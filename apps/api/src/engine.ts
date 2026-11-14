import { randomUUID } from 'node:crypto';
import type { Booking, User, Prisma } from '@prisma/client';
import { db, transaction, type Tx } from './db.js';
import { now } from './clock.js';
import { settings } from './config.js';
import { ensure } from './errors.js';
import {
  active,
  calculateFine,
  cancellationFee,
  coveredBySchedule,
  policy,
  validateInterval,
} from './policies.js';

export const bookingInclude = {
  spot: true,
  vehicle: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  review: true,
};
export const event = (actor: string, action: string, detail?: unknown) => ({
  actor,
  action,
  detail: detail ?? null,
  at: now().toISOString(),
});
export function appendAudit(previous: Prisma.JsonValue, item: unknown): Prisma.InputJsonValue {
  return [...(Array.isArray(previous) ? previous : []), item] as Prisma.InputJsonValue;
}
export async function notify(tx: Tx, userId: string, message: string, bookingId?: string) {
  const entry = JSON.stringify([
    { id: randomUUID(), message, bookingId, at: now().toISOString(), read: false },
  ]);
  await tx.$executeRaw`UPDATE users SET notifications = (SELECT jsonb_agg(value ORDER BY ord) FROM (SELECT value, ord FROM jsonb_array_elements(notifications || ${entry}::jsonb) WITH ORDINALITY AS n(value,ord) ORDER BY ord DESC LIMIT 200) recent) WHERE id = ${userId}::uuid`;
}
export async function lockSpot(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM parking_spots WHERE id = ${id}::uuid FOR UPDATE`;
  const spot = await tx.parkingSpot.findUnique({
    where: { id },
    include: { availability: true, owner: { select: { accountStatus: true } } },
  });
  ensure(spot, 404, 'Parking space not found.');
  await tx.booking.updateMany({
    where: { parkingSpotId: id, bookingStatus: 'PAYMENT_PENDING', holdExpiresAt: { lte: now() } },
    data: { bookingStatus: 'EXPIRED' },
  });
  return spot;
}
export async function lockedBooking(tx: Tx, id: string, actor: User) {
  const first = await tx.booking.findUnique({ where: { id } });
  ensure(first, 404, 'Booking not found.');
  const spot = await lockSpot(tx, first.parkingSpotId);
  const booking = (await tx.booking.findUnique({ where: { id }, include: bookingInclude }))!;
  ensure(
    actor.roles.includes('ADMIN') || actor.id === booking.driverId || actor.id === spot.ownerId,
    403,
    'This booking belongs to another user.',
  );
  return { booking, spot };
}
export function ownsSpot(actor: User, ownerId: string) {
  ensure(
    actor.id === ownerId || actor.roles.includes('ADMIN'),
    403,
    'Only this space’s owner can perform this action.',
  );
}
export async function isUnavailable(tx: Tx, spotId: string, start: Date, end: Date) {
  const reservation = await tx.booking.findFirst({
    where: {
      parkingSpotId: spotId,
      bookingStatus: { in: active },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  const block = await tx.blockedSlot.findFirst({
    where: { parkingSpotId: spotId, startTime: { lt: end }, endTime: { gt: start } },
  });
  const occupant = await tx.booking.findFirst({
    where: { parkingSpotId: spotId, occupied: true, endTime: { lte: now() } },
  });
  return Boolean(reservation || block || occupant);
}
export type ReserveInput = {
  parkingSpotId: string;
  vehicleId: string;
  startTime: string;
  endTime: string;
  idempotencyKey: string;
  waitlist?: boolean;
};
export async function reserve(actor: User, input: ReserveInput, acceptingId?: string) {
  return transaction(async (tx) => {
    const spot = await lockSpot(tx, input.parkingSpotId);
    const key = `${actor.id}:${input.idempotencyKey}`;
    const existing = await tx.booking.findUnique({
      where: { idempotencyKey: key },
      include: bookingInclude,
    });
    const start = new Date(input.startTime),
      end = new Date(input.endTime);
    if (existing) {
      ensure(
        existing.parkingSpotId === spot.id &&
          existing.vehicleId === input.vehicleId &&
          +existing.startTime === +start &&
          +existing.endTime === +end,
        409,
        'Idempotency key already used for a different reservation.',
      );
      ensure(
        Boolean((existing.termsSnapshot as Record<string, unknown>).waitlist) ===
          Boolean(input.waitlist),
        409,
        'Idempotency key belongs to a different reservation kind.',
      );
      return existing;
    }
    ensure(spot.ownerId !== actor.id, 403, 'You cannot book or review your own parking space.');
    ensure(
      spot.approvalStatus === 'APPROVED' && spot.isActive && spot.owner.accountStatus === 'ACTIVE',
      409,
      'This parking space is not publicly bookable.',
    );
    validateInterval(start, end);
    ensure(+end - +start >= 15 * 60000, 400, 'Reserve at least 15 minutes.');
    ensure(
      +start >= +now() && +start < +now() + 366 * 86400000,
      400,
      'Choose a future start time within one year.',
    );
    const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
    ensure(
      vehicle && vehicle.userId === actor.id && vehicle.isActive,
      403,
      'Select one of your active vehicles.',
    );
    ensure(
      spot.vehicleTypes.includes(vehicle.vehicleType),
      400,
      'This space does not support your vehicle type.',
    );
    ensure(
      coveredBySchedule(spot.availability, spot.timezone, start, end),
      409,
      'The requested interval is outside the owner’s recurring availability.',
    );
    const unavailable = await isUnavailable(tx, spot.id, start, end);
    ensure(
      input.waitlist || !unavailable,
      409,
      'This interval is unavailable. Choose another time or join the waiting list.',
    );
    ensure(!input.waitlist || unavailable, 409, 'This interval is available. Reserve it directly.');
    if (input.waitlist) {
      const duplicate = await tx.booking.findFirst({
        where: {
          driverId: actor.id,
          parkingSpotId: spot.id,
          startTime: start,
          endTime: end,
          bookingStatus: 'WAITLISTED',
        },
      });
      ensure(!duplicate, 409, 'You are already waiting for this interval.');
    }
    if (acceptingId) {
      const wait = await tx.booking.findUnique({ where: { id: acceptingId } });
      ensure(
        wait?.driverId === actor.id &&
          wait.bookingStatus === 'WAITLISTED' &&
          wait.parkingSpotId === spot.id,
        409,
        'This waiting-list entry is no longer active.',
      );
      await tx.booking.update({
        where: { id: acceptingId },
        data: {
          bookingStatus: 'CANCELLED',
          cancellationReason: 'Converted to reservation hold',
          cancelledAt: now(),
        },
      });
    }
    const amount = Math.ceil(((+end - +start) / 3600000) * spot.hourlyPrice);
    return tx.booking.create({
      data: {
        driverId: actor.id,
        parkingSpotId: spot.id,
        vehicleId: vehicle.id,
        startTime: start,
        endTime: end,
        bookingStatus: input.waitlist ? 'WAITLISTED' : 'PAYMENT_PENDING',
        totalAmount: amount,
        priceSnapshot: spot.hourlyPrice,
        termsSnapshot: {
          ...policy(),
          waitlist: Boolean(input.waitlist),
          title: spot.title,
          address: spot.address,
          accessInstructions: spot.accessInstructions,
          timezone: spot.timezone,
        },
        holdExpiresAt: input.waitlist ? null : new Date(+now() + settings.holdMinutes * 60000),
        idempotencyKey: key,
        audit: [event(actor.id, input.waitlist ? 'WAITLIST_JOINED' : 'HOLD_CREATED')],
      },
      include: bookingInclude,
    });
  });
}
export async function alertWaiters(tx: Tx, spotId: string) {
  const entries = await tx.booking.findMany({
    where: { parkingSpotId: spotId, bookingStatus: 'WAITLISTED', startTime: { gt: now() } },
    orderBy: { createdAt: 'asc' },
  });
  for (const b of entries)
    if (!(await isUnavailable(tx, spotId, b.startTime, b.endTime)))
      await notify(
        tx,
        b.driverId,
        'A space you are waiting for is available. Reserve it now; availability is confirmed only after a hold succeeds.',
        b.id,
      );
}
async function ledger(
  tx: Tx,
  booking: Booking,
  type: string,
  amount: number,
  key: string,
  status = 'SUCCESS',
  method = 'DEMO_SYSTEM',
) {
  return tx.payment.create({
    data: {
      bookingId: booking.id,
      paymentType: type,
      amount,
      paymentMethod: method,
      paymentStatus: status,
      transactionReference: `DEMO-${randomUUID()}`,
      idempotencyKey: key,
    },
  });
}
export async function pay(
  actor: User,
  id: string,
  input: { idempotencyKey: string; method: string; outcome: string; type: string },
) {
  return transaction(async (tx) => {
    const { booking: b, spot } = await lockedBooking(tx, id, actor);
    ensure(b.driverId === actor.id, 403, 'Only the booking driver may make demo payments.');
    const key = `${actor.id}:${input.idempotencyKey}`;
    const old = await tx.payment.findUnique({ where: { idempotencyKey: key } });
    if (old) {
      ensure(
        old.bookingId === id &&
          old.paymentType === input.type &&
          old.paymentMethod === input.method &&
          old.paymentStatus === (input.outcome === 'success' ? 'SUCCESS' : 'FAILED'),
        409,
        'Idempotency key belongs to a different payment request.',
      );
      return { payment: old, booking: b };
    }
    const fine = input.type === 'OVERSTAY_FINE';
    if (fine)
      ensure(
        b.bookingStatus === 'COMPLETED' && b.fineStatus === 'OUTSTANDING' && b.fineAmount > 0,
        409,
        'No finalized undisputed fine is payable.',
      );
    else
      ensure(
        b.bookingStatus === 'PAYMENT_PENDING' &&
          b.holdExpiresAt &&
          b.holdExpiresAt > now() &&
          b.endTime > now(),
        409,
        'Your reservation hold has expired or is no longer payable. Please reserve again.',
      );
    const success = input.outcome === 'success';
    const payment = await ledger(
      tx,
      b,
      input.type,
      fine ? b.fineAmount : b.totalAmount,
      key,
      success ? 'SUCCESS' : 'FAILED',
      input.method,
    );
    const booking = await tx.booking.update({
      where: { id },
      data: {
        ...(success
          ? fine
            ? { fineStatus: 'PAID' }
            : { bookingStatus: 'CONFIRMED', paymentStatus: 'SUCCESS', holdExpiresAt: null }
          : {}),
        audit: appendAudit(
          b.audit,
          event(actor.id, success ? 'DEMO_PAYMENT_SUCCESS' : 'DEMO_PAYMENT_FAILED', {
            paymentId: payment.id,
          }),
        ),
      },
      include: bookingInclude,
    });
    if (success && !fine) {
      await notify(
        tx,
        spot.ownerId,
        `New confirmed booking ${id}. ${actor.fullName} reserved ${spot.title}.`,
        id,
      );
      await notify(
        tx,
        b.driverId,
        `Booking ${id} is confirmed. Your host can now see the same reservation.`,
        id,
      );
    }
    return { payment, booking };
  });
}
export async function cancelInTransaction(
  tx: Tx,
  b: Booking,
  actor: User,
  ownerId: string,
  reason: string,
  status = 'CANCELLED',
  notifyWaiters = true,
) {
  ensure(
    !b.occupied,
    409,
    'An occupied space requires verified physical checkout before cancellation.',
  );
  ensure(
    ['PAYMENT_PENDING', 'CONFIRMED', 'WAITLISTED'].includes(b.bookingStatus),
    409,
    'This booking cannot be cancelled.',
  );
  const occupied = await tx.booking.findFirst({
    where: {
      parkingSpotId: b.parkingSpotId,
      occupied: true,
      id: { not: b.id },
      endTime: { lte: now() },
    },
  });
  const full =
    actor.id === ownerId ||
    actor.roles.includes('ADMIN') ||
    Boolean(occupied) ||
    b.bookingStatus !== 'CONFIRMED';
  const fee =
    status === 'NO_SHOW'
      ? Math.round(b.totalAmount * 0.25)
      : cancellationFee(
          b.totalAmount,
          b.startTime,
          now(),
          full,
          b.termsSnapshot as Record<string, unknown>,
        );
  if (b.paymentStatus === 'SUCCESS') {
    await ledger(tx, b, 'REFUND', -b.totalAmount, `refund:${b.id}`);
    if (fee) await ledger(tx, b, 'CANCELLATION_FEE', fee, `cancellation-fee:${b.id}`);
  }
  const result = await tx.booking.update({
    where: { id: b.id },
    data: {
      bookingStatus: status,
      paymentStatus: b.paymentStatus === 'SUCCESS' ? 'REFUNDED' : b.paymentStatus,
      cancellationReason: reason,
      cancelledAt: now(),
      audit: appendAudit(b.audit, event(actor.id, status, { reason, fee, fullRefund: full })),
    },
    include: bookingInclude,
  });
  await notify(
    tx,
    b.driverId,
    `${status === 'NO_SHOW' ? 'Owner reported a no-show. You may dispute this report.' : 'Booking cancelled.'} Simulated refund and fee details are in payment history.`,
    b.id,
  );
  if (ownerId !== b.driverId)
    await notify(
      tx,
      ownerId,
      `Booking ${b.id} ${status === 'NO_SHOW' ? 'marked no-show' : 'cancelled'}. ${reason}`,
      b.id,
    );
  if (notifyWaiters) await alertWaiters(tx, b.parkingSpotId);
  return result;
}
export async function cancel(actor: User, id: string, reason: string) {
  return transaction(async (tx) => {
    const { booking, spot } = await lockedBooking(tx, id, actor);
    if (booking.bookingStatus === 'CANCELLED') return booking;
    return cancelInTransaction(tx, booking, actor, spot.ownerId, reason);
  });
}
export async function bookingAction(
  actor: User,
  id: string,
  action: string,
  input: Record<string, unknown>,
) {
  return transaction(async (tx) => {
    const { booking: b, spot } = await lockedBooking(tx, id, actor);
    const data: Prisma.BookingUpdateInput = {};
    switch (action) {
      case 'arrival-request':
        ensure(
          actor.id === b.driverId && b.bookingStatus === 'CONFIRMED',
          409,
          'Only a confirmed driver can request arrival.',
        );
        await notify(
          tx,
          spot.ownerId,
          'Your driver has arrived. Verify the vehicle and confirm entry.',
          b.id,
        );
        break;
      case 'check-in': {
        ownsSpot(actor, spot.ownerId);
        ensure(
          b.bookingStatus === 'CONFIRMED' && b.paymentStatus === 'SUCCESS',
          409,
          'Only a paid confirmed reservation can check in.',
        );
        ensure(
          +now() >= +b.startTime - 15 * 60000 && now() < b.endTime,
          409,
          'Entry is allowed from 15 minutes before the booking until its end.',
        );
        const occupied = await tx.booking.findFirst({
          where: { parkingSpotId: spot.id, occupied: true },
        });
        ensure(
          !occupied,
          409,
          'The previous vehicle is still physically parked here. This driver may cancel for a full refund.',
        );
        data.bookingStatus = 'CHECKED_IN';
        data.occupied = true;
        data.checkedInAt = now();
        await notify(
          tx,
          b.driverId,
          'Owner verified your arrival. Your parking session is active.',
          b.id,
        );
        break;
      }
      case 'request-checkout':
        ensure(
          actor.id === b.driverId && b.occupied,
          409,
          'You must have an active parking session to request checkout.',
        );
        if (!b.checkoutRequestedAt) {
          data.checkoutRequestedAt = now();
          data.fineCapAt = new Date(+now() + 15 * 60000);
        }
        data.bookingStatus = 'CHECKOUT_PENDING';
        await notify(
          tx,
          spot.ownerId,
          'A driver requested checkout. Verify departure to release physical occupancy.',
          b.id,
        );
        break;
      case 'confirm-checkout': {
        ownsSpot(actor, spot.ownerId);
        ensure(b.occupied, 409, 'This vehicle is not checked in.');
        ensure(
          input.departureVerified === true,
          400,
          'Confirm that you physically verified the vehicle has departed.',
        );
        const cap = b.fineCapAt && b.fineCapAt < now() ? b.fineCapAt : now();
        const fine = calculateFine(b.endTime, cap, b.termsSnapshot as Record<string, unknown>);
        data.bookingStatus = 'COMPLETED';
        data.occupied = false;
        data.actualExitTime = now();
        data.exitConfirmedBy = actor.id;
        data.overstayMinutes = fine.minutes;
        data.fineAmount = fine.amount;
        data.fineStatus =
          b.fineStatus === 'DISPUTED' ? 'DISPUTED' : fine.amount ? 'OUTSTANDING' : 'NONE';
        await notify(
          tx,
          b.driverId,
          `Departure verified. Final simulated overstay fine: ₹${fine.amount / 100}.`,
          b.id,
        );
        break;
      }
      case 'no-show':
        ownsSpot(actor, spot.ownerId);
        ensure(
          b.bookingStatus === 'CONFIRMED' &&
            !b.occupied &&
            +now() >= +b.startTime + settings.noShowGrace * 60000,
          409,
          'A no-show can only be reported after the arrival grace period for an unoccupied confirmed booking.',
        );
        ensure(
          input.absenceVerified === true,
          400,
          'You must physically verify that the vehicle is absent.',
        );
        return cancelInTransaction(
          tx,
          b,
          actor,
          spot.ownerId,
          'Owner verified vehicle absent after arrival grace period. Driver may dispute.',
          'NO_SHOW',
        );
      case 'dispute': {
        ensure(actor.id === b.driverId, 403, 'Only the driver can raise this dispute.');
        ensure(
          !b.dispute || (b.dispute as Record<string, unknown>).status === 'RESOLVED',
          409,
          'There is already an open dispute.',
        );
        ensure(
          ['CHECKED_IN', 'CHECKOUT_PENDING', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(
            b.bookingStatus,
          ),
          409,
          'Disputes apply to sessions, cancellations or no-show reports.',
        );
        const message = String(input.message ?? '').trim();
        ensure(
          message.length >= 10 && message.length <= 2000,
          400,
          'Explain the dispute in 10–2000 characters.',
        );
        data.dispute = { status: 'OPEN', message, openedAt: now().toISOString(), responses: [] };
        data.fineStatus = 'DISPUTED';
        data.fineCapAt = b.fineCapAt && b.fineCapAt < now() ? b.fineCapAt : now();
        await notify(
          tx,
          spot.ownerId,
          'A driver raised a dispute. Respond in booking management.',
          b.id,
        );
        break;
      }
      case 'respond-dispute': {
        ownsSpot(actor, spot.ownerId);
        const dispute = b.dispute as Record<string, Prisma.JsonValue> | null;
        ensure(dispute?.status === 'OPEN', 409, 'There is no open dispute.');
        const response = String(input.message ?? '').trim();
        ensure(
          response.length >= 5 && response.length <= 2000,
          400,
          'Enter a response in 5–2000 characters.',
        );
        data.dispute = {
          ...dispute,
          responses: [
            ...(Array.isArray(dispute.responses) ? dispute.responses : []),
            event(actor.id, 'OWNER_RESPONSE', response),
          ],
        };
        await notify(tx, b.driverId, 'The owner responded to your dispute.', b.id);
        break;
      }
      case 'resolve': {
        ensure(actor.roles.includes('ADMIN'), 403, 'Administrator permission required.');
        const reason = String(input.message ?? '').trim();
        ensure(
          reason.length >= 5 && reason.length <= 2000,
          400,
          'A resolution explanation is required.',
        );
        ensure(
          input.fineAmount === undefined ||
            (Number.isInteger(input.fineAmount) &&
              Number(input.fineAmount) >= 0 &&
              Number(input.fineAmount) <= 1000000),
          400,
          'Fine must be nonnegative integer paise, at most ₹10,000.',
        );
        ensure(
          !b.occupied || input.departureVerified === true || input.fineAmount === undefined,
          409,
          'Verify departure before finalizing the occupied session’s fine.',
        );
        const fine = input.fineAmount === undefined ? b.fineAmount : Number(input.fineAmount);
        if (b.occupied && input.departureVerified === true) {
          data.occupied = false;
          data.bookingStatus = 'COMPLETED';
          data.actualExitTime = now();
          data.exitConfirmedBy = actor.id;
          data.overstayMinutes = calculateFine(
            b.endTime,
            b.fineCapAt ?? now(),
            b.termsSnapshot as Record<string, unknown>,
          ).minutes;
        }
        if (input.fineAmount !== undefined) {
          data.fineAmount = fine;
          const paid = await tx.payment.aggregate({
            where: { bookingId: b.id, paymentType: 'OVERSTAY_FINE', paymentStatus: 'SUCCESS' },
            _sum: { amount: true },
          });
          const alreadyPaid = paid._sum.amount ?? 0;
          ensure(
            !alreadyPaid || fine <= alreadyPaid,
            409,
            'A paid fine can only be reduced or waived.',
          );
          ensure(
            !alreadyPaid || fine <= b.fineAmount,
            409,
            'A previously reduced paid fine cannot be increased.',
          );
          await ledger(tx, b, 'ADJUSTMENT', 0, `fine-adjust:${b.id}:${randomUUID()}`);
          if (alreadyPaid && fine < alreadyPaid) {
            const refunded = await tx.payment.aggregate({
              where: {
                bookingId: b.id,
                paymentType: 'REFUND',
                idempotencyKey: { startsWith: `fine-refund:${b.id}:` },
              },
              _sum: { amount: true },
            });
            const remaining = alreadyPaid + (refunded._sum.amount ?? 0) - fine;
            if (remaining > 0)
              await ledger(tx, b, 'REFUND', -remaining, `fine-refund:${b.id}:${randomUUID()}`);
          }
          data.fineStatus = fine === 0 ? 'WAIVED' : alreadyPaid ? 'PAID' : 'OUTSTANDING';
        }
        if (b.dispute)
          data.dispute = {
            ...(b.dispute as Prisma.JsonObject),
            status: 'RESOLVED',
            resolution: reason,
            resolvedBy: actor.id,
            resolvedAt: now().toISOString(),
          };
        if (b.fineStatus === 'DISPUTED' && input.fineAmount === undefined)
          data.fineStatus = b.fineAmount > 0 ? 'OUTSTANDING' : 'NONE';
        if (input.refundNoShow === true) {
          ensure(b.bookingStatus === 'NO_SHOW', 409, 'No-show refund requires a no-show booking.');
          const fee = await tx.payment.findUnique({
            where: { idempotencyKey: `cancellation-fee:${b.id}` },
          });
          if (
            fee &&
            !(await tx.payment.findUnique({
              where: { idempotencyKey: `no-show-reversal:${b.id}` },
            }))
          )
            await ledger(tx, b, 'REFUND', -fee.amount, `no-show-reversal:${b.id}`);
        }
        await notify(tx, b.driverId, `Administrator resolved your case: ${reason}`, b.id);
        break;
      }
      default:
        ensure(false, 404, 'Unknown booking action.');
    }
    data.audit = appendAudit(b.audit, event(actor.id, action, input));
    return tx.booking.update({ where: { id }, data, include: bookingInclude });
  });
}
export async function decorateBooking(b: Booking & { spot?: { ownerId: string } }) {
  const occupant = await db.booking.findFirst({
    where: {
      parkingSpotId: b.parkingSpotId,
      occupied: true,
      id: { not: b.id },
      endTime: { lte: now() },
    },
    select: { id: true },
  });
  const cap = b.fineCapAt && b.fineCapAt < now() ? b.fineCapAt : now();
  const provisional = b.occupied
    ? calculateFine(b.endTime, cap, b.termsSnapshot as Record<string, unknown>).amount
    : b.fineAmount;
  return {
    ...b,
    bookingStatus:
      b.bookingStatus === 'PAYMENT_PENDING' && b.holdExpiresAt && b.holdExpiresAt <= now()
        ? 'EXPIRED'
        : b.bookingStatus,
    provisionalFine: provisional,
    spaceUnavailable: Boolean(occupant),
    serverTime: now(),
    checkoutReminder: b.occupied && +b.endTime - +now() < 15 * 60000,
  };
}
