import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { db } from '../src/db.js';
import { fixture, directBooking, type Fixture } from './helpers.js';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterAll(() => db.$disconnect());
describe('real PostgreSQL database integrity', () => {
  it('has exactly the eight business tables', async () => {
    const rows = await db.$queryRaw<
      { table_name: string }[]
    >`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'_prisma_migrations'`;
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [
        'users',
        'parking_spots',
        'availability_slots',
        'bookings',
        'payments',
        'reviews',
        'blocked_slots',
        'vehicles',
      ].sort(),
    );
  });
  it('rejects foreign keys to missing drivers', async () => {
    await expect(
      db.booking.create({
        data: directBooking(f, { driverId: '00000000-0000-0000-0000-000000000001' }),
      }),
    ).rejects.toThrow();
  });
  it('rejects invalid booking intervals', async () => {
    await expect(
      db.booking.create({ data: directBooking(f, { endTime: f.start }) }),
    ).rejects.toThrow();
  });
  it('exclusion constraint rejects overlapping active reservations', async () => {
    await db.booking.create({ data: directBooking(f) });
    await expect(
      db.booking.create({ data: directBooking(f, { driverId: f.b.id, vehicleId: f.vb.id }) }),
    ).rejects.toThrow();
  });
  it('allows adjacent half-open bookings', async () => {
    await db.booking.create({ data: directBooking(f) });
    await expect(
      db.booking.create({
        data: directBooking(f, { startTime: f.end, endTime: new Date(+f.end + 3600000) }),
      }),
    ).resolves.toBeDefined();
  });
  it.each(['CANCELLED', 'EXPIRED', 'NO_SHOW', 'WAITLISTED'])(
    '%s does not block new reservations',
    async (bookingStatus) => {
      await db.booking.create({ data: directBooking(f, { bookingStatus }) });
      await expect(db.booking.create({ data: directBooking(f) })).resolves.toBeDefined();
    },
  );
  it('blocks protect the interval at the database level', async () => {
    await db.blockedSlot.create({
      data: {
        parkingSpotId: f.spot.id,
        startTime: f.start,
        endTime: f.end,
        reason: 'Maintenance',
        createdBy: f.owner.id,
      },
    });
    await expect(db.booking.create({ data: directBooking(f) })).rejects.toThrow();
  });
  it('a block cannot silently invalidate a reservation', async () => {
    await db.booking.create({ data: directBooking(f) });
    await expect(
      db.blockedSlot.create({
        data: {
          parkingSpotId: f.spot.id,
          startTime: f.start,
          endTime: f.end,
          reason: 'Maintenance',
          createdBy: f.owner.id,
        },
      }),
    ).rejects.toThrow();
  });
  it('historical bookings protect vehicles, users and spots from deletion', async () => {
    await db.booking.create({ data: directBooking(f, { bookingStatus: 'COMPLETED' }) });
    await expect(db.vehicle.delete({ where: { id: f.va.id } })).rejects.toThrow();
    await expect(db.parkingSpot.delete({ where: { id: f.spot.id } })).rejects.toThrow();
    await expect(db.user.delete({ where: { id: f.a.id } })).rejects.toThrow();
  });
  it('rejects overlapping recurring schedule definitions', async () => {
    await expect(
      db.availabilitySlot.create({
        data: {
          parkingSpotId: f.spot.id,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          effectiveFrom: new Date('2026-01-01'),
        },
      }),
    ).rejects.toThrow();
  });
  it('enforces one physically occupied vehicle even outside scheduled overlap', async () => {
    await db.booking.create({
      data: directBooking(f, { bookingStatus: 'CHECKED_IN', occupied: true, checkedInAt: f.start }),
    });
    await expect(
      db.booking.create({
        data: directBooking(f, {
          startTime: f.end,
          endTime: new Date(+f.end + 3600000),
          bookingStatus: 'CHECKED_IN',
          occupied: true,
          checkedInAt: f.end,
        }),
      }),
    ).rejects.toThrow();
  });
  it('rejects reviews of incomplete bookings and ratings out of range', async () => {
    const b = await db.booking.create({ data: directBooking(f) });
    await expect(
      db.review.create({
        data: {
          bookingId: b.id,
          reviewerId: f.a.id,
          parkingSpotId: f.spot.id,
          rating: 5,
          comment: 'Premature',
        },
      }),
    ).rejects.toThrow();
    await db.booking.update({ where: { id: b.id }, data: { bookingStatus: 'COMPLETED' } });
    await expect(
      db.review.create({
        data: {
          bookingId: b.id,
          reviewerId: f.a.id,
          parkingSpotId: f.spot.id,
          rating: 6,
          comment: 'Invalid rating',
        },
      }),
    ).rejects.toThrow();
  });
});
