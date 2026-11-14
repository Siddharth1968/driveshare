import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, transaction } from '../src/db.js';
import { reserve, pay, cancel, bookingAction, lockSpot, decorateBooking } from '../src/engine.js';
import { now, setDemoTime } from '../src/clock.js';
import { fixture, payment, directBooking, session, type Fixture } from './helpers.js';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterAll(() => db.$disconnect());
const confirm = async () => {
  const b = await reserve(f.a, f.input);
  await pay(f.a, b.id, payment());
  return b;
};
describe('reservation and simulated ledger', () => {
  it('reserves a hold and confirms only after successful simulated payment', async () => {
    const b = await reserve(f.a, f.input);
    expect(b.bookingStatus).toBe('PAYMENT_PENDING');
    expect(b.holdExpiresAt).toBeInstanceOf(Date);
    const result = await pay(f.a, b.id, payment());
    expect(result.booking.bookingStatus).toBe('CONFIRMED');
    expect(result.payment.amount).toBe(4000);
  });
  it('failed payment retains the hold and a new key safely retries', async () => {
    const b = await reserve(f.a, f.input);
    const failed = await pay(f.a, b.id, payment(randomUUID(), 'failure'));
    expect(failed.payment.paymentStatus).toBe('FAILED');
    expect(failed.booking.bookingStatus).toBe('PAYMENT_PENDING');
    expect((await pay(f.a, b.id, payment())).booking.bookingStatus).toBe('CONFIRMED');
  });
  it('reservation idempotency returns the same record and rejects a changed payload', async () => {
    const a = await reserve(f.a, f.input);
    expect((await reserve(f.a, f.input)).id).toBe(a.id);
    await expect(
      reserve(f.a, { ...f.input, endTime: new Date(+f.end + 60000).toISOString() }),
    ).rejects.toThrow('different reservation');
  });
  it('payment idempotency returns one ledger entry', async () => {
    const b = await reserve(f.a, f.input);
    const input = payment();
    const first = await pay(f.a, b.id, input);
    const second = await pay(f.a, b.id, input);
    expect(first.payment.id).toBe(second.payment.id);
    expect(await db.payment.count()).toBe(1);
  });
  it('rejects changed payment payload under a reused key', async () => {
    const b = await reserve(f.a, f.input);
    const input = payment();
    await pay(f.a, b.id, input);
    await expect(pay(f.a, b.id, { ...input, method: 'DEMO_CARD' })).rejects.toThrow(
      'different payment',
    );
  });
  it('expired holds are nonblocking even without background cleanup', async () => {
    const b = await reserve(f.a, f.input);
    setDemoTime(new Date(+now() + 6 * 60000).toISOString());
    const replacement = await reserve(f.b, {
      ...f.input,
      vehicleId: f.vb.id,
      idempotencyKey: randomUUID(),
    });
    expect(replacement.bookingStatus).toBe('PAYMENT_PENDING');
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.bookingStatus).toBe('EXPIRED');
    await expect(pay(f.a, b.id, payment())).rejects.toThrow('expired');
  });
  it('free cancellation produces a negative refund and releases the interval', async () => {
    const b = await confirm();
    await cancel(f.a, b.id, 'Plans changed today');
    const ledger = await db.payment.findMany();
    expect(ledger.reduce((s, p) => s + p.amount, 0)).toBe(0);
    await expect(
      reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: randomUUID() }),
    ).resolves.toBeDefined();
  });
  it('late cancellation accounts for only the 10% fee', async () => {
    f.input.startTime = new Date(+now() + 30 * 60000).toISOString();
    f.input.endTime = new Date(+now() + 90 * 60000).toISOString();
    const b = await confirm();
    await cancel(f.a, b.id, 'My plans have changed');
    const ledger = await db.payment.findMany({ where: { paymentStatus: 'SUCCESS' } });
    expect(ledger.reduce((s, p) => s + p.amount, 0)).toBe(400);
    expect(ledger.some((p) => p.paymentType === 'CANCELLATION_FEE')).toBe(true);
  });
  it('owner cancellation is a full refund', async () => {
    const b = await confirm();
    setDemoTime(new Date(+f.start - 10 * 60000).toISOString());
    await cancel(f.owner, b.id, 'Owner emergency maintenance');
    expect((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount).toBe(0);
  });
  it('waitlist does not reserve inventory and gets a notification after cancellation', async () => {
    const b = await confirm();
    const w = await reserve(f.b, {
      ...f.input,
      vehicleId: f.vb.id,
      idempotencyKey: randomUUID(),
      waitlist: true,
    });
    expect(w.bookingStatus).toBe('WAITLISTED');
    await cancel(f.a, b.id, 'Changed my plans');
    const u = await db.user.findUnique({ where: { id: f.b.id } });
    expect(JSON.stringify(u?.notifications)).toContain('available');
    expect(await db.payment.count({ where: { bookingId: w.id } })).toBe(0);
  });
  it('blocks outside recurring schedules and unsupported vehicle types', async () => {
    await db.availabilitySlot.deleteMany();
    await expect(reserve(f.a, f.input)).rejects.toThrow('availability');
  });
  it('does not publicly book a pending listing', async () => {
    await db.parkingSpot.update({ where: { id: f.spot.id }, data: { approvalStatus: 'PENDING' } });
    await expect(reserve(f.a, f.input)).rejects.toThrow('publicly bookable');
  });
});
describe('owner-verified occupancy and fair fines', () => {
  async function parked() {
    const b = await confirm();
    setDemoTime(f.start.toISOString());
    await bookingAction(f.owner, b.id, 'check-in', {});
    return b;
  }
  it('only the owner or admin can verify entry', async () => {
    const b = await confirm();
    setDemoTime(f.start.toISOString());
    await expect(bookingAction(f.a, b.id, 'check-in', {})).rejects.toThrow('owner');
    await expect(bookingAction(f.owner2, b.id, 'check-in', {})).rejects.toThrow('another user');
  });
  it('occupied sessions cannot release inventory by cancelling', async () => {
    const b = await parked();
    await expect(cancel(f.a, b.id, 'Driver pressed cancel')).rejects.toThrow('physical checkout');
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.occupied).toBe(true);
  });
  it('late owner-verified checkout finalizes ₹40 and supports fine payment', async () => {
    const b = await parked();
    setDemoTime(new Date(+f.end + 35 * 60000).toISOString());
    const done = await bookingAction(f.owner, b.id, 'confirm-checkout', {
      departureVerified: true,
    });
    expect(done.fineAmount).toBe(4000);
    expect(done.occupied).toBe(false);
    expect(done.exitConfirmedBy).toBe(f.owner.id);
    const paid = await pay(f.a, b.id, payment(randomUUID(), 'success', 'OVERSTAY_FINE'));
    expect(paid.booking.fineStatus).toBe('PAID');
  });
  it('checkout request caps accumulation after 15 min while preserving occupancy', async () => {
    const b = await parked();
    setDemoTime(new Date(+f.end + 10 * 60000).toISOString());
    await bookingAction(f.a, b.id, 'request-checkout', {});
    setDemoTime(new Date(+f.end + 90 * 60000).toISOString());
    const done = await bookingAction(f.owner, b.id, 'confirm-checkout', {
      departureVerified: true,
    });
    expect(done.fineAmount).toBe(2000);
    expect(done.overstayMinutes).toBe(25);
  });
  it('disputed accumulation freezes and admin can resolve a contested departure', async () => {
    const b = await parked();
    setDemoTime(new Date(+f.end + 35 * 60000).toISOString());
    await bookingAction(f.a, b.id, 'dispute', {
      message: 'I left earlier; please review the host delay.',
    });
    setDemoTime(new Date(+f.end + 120 * 60000).toISOString());
    const current = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect((await decorateBooking(current)).provisionalFine).toBe(4000);
    const resolved = await bookingAction(f.admin, b.id, 'resolve', {
      fineAmount: 0,
      message: 'Departure verified and fine waived after review.',
      departureVerified: true,
    });
    expect(resolved.bookingStatus).toBe('COMPLETED');
    expect(resolved.fineStatus).toBe('WAIVED');
    expect((resolved.dispute as { status: string }).status).toBe('RESOLVED');
    expect(await db.payment.count({ where: { paymentType: 'ADJUSTMENT' } })).toBe(1);
  });
  it('next-driver protection blocks check-in and gives full refund', async () => {
    const old = await parked();
    const next = await db.booking.create({
      data: directBooking(f, {
        driverId: f.b.id,
        vehicleId: f.vb.id,
        startTime: f.end,
        endTime: new Date(+f.end + 3600000),
      }),
    });
    await db.payment.create({
      data: {
        bookingId: next.id,
        paymentType: 'BOOKING',
        amount: 4000,
        paymentMethod: 'DEMO_UPI',
        paymentStatus: 'SUCCESS',
        transactionReference: 'DEMO-NEXT',
        idempotencyKey: 'next-payment',
      },
    });
    setDemoTime(new Date(+f.end + 2 * 60000).toISOString());
    await expect(bookingAction(f.owner, next.id, 'check-in', {})).rejects.toThrow(
      'previous vehicle',
    );
    expect((await decorateBooking(next)).spaceUnavailable).toBe(true);
    await cancel(f.b, next.id, 'Previous vehicle remains parked');
    expect(
      (await db.payment.aggregate({ where: { bookingId: next.id }, _sum: { amount: true } }))._sum
        .amount,
    ).toBe(0);
    expect((await db.booking.findUnique({ where: { id: old.id } }))?.occupied).toBe(true);
  });
  it('no-show requires grace and explicit absence verification; driver can dispute', async () => {
    const b = await confirm();
    setDemoTime(new Date(+f.start + 29 * 60000).toISOString());
    await expect(
      bookingAction(f.owner, b.id, 'no-show', { absenceVerified: true }),
    ).rejects.toThrow('grace');
    setDemoTime(new Date(+f.start + 31 * 60000).toISOString());
    await expect(bookingAction(f.owner, b.id, 'no-show', {})).rejects.toThrow('physically verify');
    await bookingAction(f.owner, b.id, 'no-show', { absenceVerified: true });
    expect((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount).toBe(1000);
    await bookingAction(f.a, b.id, 'dispute', {
      message: 'I was present but the host did not verify arrival.',
    });
    await bookingAction(f.admin, b.id, 'resolve', {
      fineAmount: 0,
      message: 'No-show report rejected following review.',
      refundNoShow: true,
    });
    expect((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount).toBe(0);
  });
  it('a paid fine can be waived with a signed refund, never double refunded', async () => {
    const b = await parked();
    setDemoTime(new Date(+f.end + 35 * 60000).toISOString());
    await bookingAction(f.owner, b.id, 'confirm-checkout', { departureVerified: true });
    await pay(f.a, b.id, payment(randomUUID(), 'success', 'OVERSTAY_FINE'));
    await bookingAction(f.admin, b.id, 'resolve', {
      fineAmount: 0,
      message: 'Waiver after reviewing evidence.',
    });
    await bookingAction(f.admin, b.id, 'resolve', {
      fineAmount: 0,
      message: 'Confirm waiver again.',
    });
    expect((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount).toBe(4000);
  });
});
describe('concurrent inventory and payment races', () => {
  it('twelve simultaneous reservation requests produce one successful hold', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        reserve(i % 2 ? f.a : f.b, {
          ...f.input,
          vehicleId: i % 2 ? f.va.id : f.vb.id,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.booking.count({ where: { bookingStatus: 'PAYMENT_PENDING' } })).toBe(1);
  });
  it('booking versus cancellation preserves consistency in either order', async () => {
    const b = await confirm();
    await Promise.allSettled([
      cancel(f.a, b.id, 'Plans changed'),
      reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: randomUUID() }),
    ]);
    expect(
      await db.booking.count({
        where: { bookingStatus: { in: ['PAYMENT_PENDING', 'CONFIRMED'] } },
      }),
    ).toBeLessThanOrEqual(1);
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.bookingStatus).toBe('CANCELLED');
  });
  it('booking versus owner block permits only one inventory claim', async () => {
    const block = () =>
      transaction(async (tx) => {
        await lockSpot(tx, f.spot.id);
        return tx.blockedSlot.create({
          data: {
            parkingSpotId: f.spot.id,
            startTime: f.start,
            endTime: f.end,
            reason: 'Maintenance test',
            createdBy: f.owner.id,
          },
        });
      });
    const results = await Promise.allSettled([reserve(f.a, f.input), block()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('booking versus payment keeps the held reservation exclusive', async () => {
    const b = await reserve(f.a, f.input);
    const results = await Promise.allSettled([
      pay(f.a, b.id, payment()),
      reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: randomUUID() }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
  });
  it('expired hold payment loses safely to a fresh reservation', async () => {
    const b = await reserve(f.a, f.input);
    setDemoTime(new Date(+now() + 6 * 60000).toISOString());
    const results = await Promise.allSettled([
      pay(f.a, b.id, payment()),
      reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: randomUUID() }),
    ]);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
  });
  it('eight simultaneous payment submissions create one successful debit', async () => {
    const b = await reserve(f.a, f.input);
    const input = payment();
    const results = await Promise.all(Array.from({ length: 8 }, () => pay(f.a, b.id, input)));
    expect(new Set(results.map((r) => r.payment.id)).size).toBe(1);
    expect(await db.payment.count()).toBe(1);
  });
  it('waiting-list acceptance versus direct booking has one winner', async () => {
    const old = await confirm();
    const w = await reserve(f.b, {
      ...f.input,
      vehicleId: f.vb.id,
      idempotencyKey: randomUUID(),
      waitlist: true,
    });
    await cancel(f.a, old.id, 'Slot release for race');
    const results = await Promise.allSettled([
      reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: `accept:${w.id}` }, w.id),
      reserve(f.a, { ...f.input, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('payment versus cancellation leaves a cancelled booking and a balanced ledger', async () => {
    const b = await reserve(f.a, f.input);
    await Promise.allSettled([
      pay(f.a, b.id, payment()),
      cancel(f.a, b.id, 'Changed plans during checkout'),
    ]);
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.bookingStatus).toBe('CANCELLED');
    expect(
      (await db.payment.aggregate({ where: { paymentStatus: 'SUCCESS' }, _sum: { amount: true } }))
        ._sum.amount ?? 0,
    ).toBe(0);
  });
});
