import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { reserve, pay, cancel, bookingAction } from '../src/engine.js';
import { fixture, payment, session, type Fixture } from './helpers.js';
import { setDemoTime, now } from '../src/clock.js';
import { campus } from '../src/campus.js';
import { campusSpaces } from '../prisma/campus-seed.js';
import {
  istParts,
  istToISO,
  defaultInterval,
  withDuration,
  hoursBetween,
  intervalError,
  readInterval,
} from '../../web/src/booking-time.js';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterAll(() => db.$disconnect());
describe('shared IST booking interval', () => {
  it.each([1, 2, 4, 8, 12, 24])(
    '%i-hour shortcut preserves exact duration across midnight',
    (hours) => {
      const start = istToISO('2026-11-12', '23:15');
      const v = withDuration(start, hours);
      expect(hoursBetween(v)).toBe(hours);
      expect(readInterval(new URLSearchParams(v))).toEqual(v);
    },
  );
  it('24 hours from 12 November 10:00 is 13 November 10:00 IST', () => {
    const v = withDuration(istToISO('2026-11-12', '10:00'), 24);
    expect(istParts(v.end)).toEqual({ date: '2026-11-13', time: '10:00' });
    expect(v.start).toBe('2026-11-12T04:30:00.000Z');
  });
  it('handles month/year rollover and midnight without hour 24', () => {
    expect(istParts(withDuration(istToISO('2026-12-31', '00:00'), 24).end)).toEqual({
      date: '2027-01-01',
      time: '00:00',
    });
  });
  it('rejects past, reversed and excessive intervals', () => {
    const base = '2026-11-12T04:30:00Z';
    expect(intervalError(withDuration(base, 2), '2026-11-12T04:31:00Z')).toContain('future');
    expect(intervalError({ start: base, end: '2026-11-12T04:00:00Z' })).toContain('after');
    expect(intervalError(withDuration(base, 25))).toContain('24 hours');
  });
  it('defaults to a future quarter hour using server time', () => {
    const v = defaultInterval('2026-11-12T04:31:00Z');
    expect(v.start).toBe('2026-11-12T05:15:00.000Z');
    expect(hoursBetween(v)).toBe(2);
  });
});
describe('connected driver/host database workflow', () => {
  it('exposes the exact booking to its host, persists notices once, and releases cancellation', async () => {
    const driver = await session(f.a),
      host = await session(f.owner);
    const key = payment();
    const booked = await driver.post('/bookings', f.input);
    expect(booked.status).toBe(201);
    const id = booked.body.id;
    expect((await driver.post(`/bookings/${id}/pay`, key)).status).toBe(200);
    await driver.post(`/bookings/${id}/pay`, key);
    const list = await host.get('/bookings?scope=owner');
    const same = list.body.find((b: { id: string }) => b.id === id);
    expect(same.driver.fullName).toBe(f.a.fullName);
    expect(same.totalAmount).toBe(4000);
    expect(same.startTime).toBe(f.start.toISOString());
    expect(same.bookingStatus).toBe('CONFIRMED');
    let notices = (await host.get('/notifications')).body;
    expect(
      notices.filter((n: { message: string }) => n.message.includes('New confirmed booking')),
    ).toHaveLength(1);
    expect(notices[0].bookingId).toBe(id);
    expect(
      (
        await driver.post(`/bookings/${id}/cancel`, {
          reason: 'Demonstrating connected cancellation',
        })
      ).status,
    ).toBe(200);
    const updated = (await host.get('/bookings?scope=owner')).body.find(
      (b: { id: string }) => b.id === id,
    );
    expect(updated.bookingStatus).toBe('CANCELLED');
    notices = (await host.get('/notifications')).body;
    expect(
      notices.some(
        (n: { message: string; bookingId: string }) =>
          n.bookingId === id && n.message.includes('cancelled'),
      ),
    ).toBe(true);
    expect(
      (await reserve(f.b, { ...f.input, vehicleId: f.vb.id, idempotencyKey: randomUUID() }))
        .bookingStatus,
    ).toBe('PAYMENT_PENDING');
  });
  it('notification failure rolls back payment and confirmation together', async () => {
    const b = await reserve(f.a, f.input);
    await db.$executeRawUnsafe(
      "ALTER TABLE users ADD CONSTRAINT test_notification_delivery CHECK (email <> 'owner@test.demo' OR notifications = '[]'::jsonb)",
    );
    try {
      await expect(pay(f.a, b.id, payment())).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE users DROP CONSTRAINT test_notification_delivery');
    }
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).bookingStatus).toBe(
      'PAYMENT_PENDING',
    );
    expect(await db.payment.count()).toBe(0);
  });
  it('a non-overlapping current occupant does not hide a valid future reservation', async () => {
    const b = await reserve(f.a, f.input);
    await pay(f.a, b.id, payment());
    setDemoTime(f.start.toISOString());
    await bookingAction(f.owner, b.id, 'check-in', {});
    const driver = await session(f.b);
    const start = new Date(+f.end + 3600000).toISOString(),
      end = new Date(+f.end + 7200000).toISOString();
    const response = await driver.get(`/spots?${new URLSearchParams({ start, end })}`);
    expect(response.status).toBe(200);
    expect(response.body.find((s: { id: string }) => s.id === f.spot.id).available).toBe(true);
    expect(
      (
        await reserve(f.b, {
          ...f.input,
          startTime: start,
          endTime: end,
          vehicleId: f.vb.id,
          idempotencyKey: randomUUID(),
        })
      ).bookingStatus,
    ).toBe('PAYMENT_PENDING');
  });
  it('rejects a check-in even a few seconds in the past', async () => {
    await expect(
      reserve(f.a, { ...f.input, startTime: new Date(+now() - 5000).toISOString() }),
    ).rejects.toThrow('future');
  });
  it('Sahyadri fixtures are nearby, idempotent and preserve existing user listings', async () => {
    const first = await db.$transaction((tx) => campusSpaces(tx, [f.owner.id, f.owner2.id]));
    const second = await db.$transaction((tx) => campusSpaces(tx, [f.owner.id, f.owner2.id]));
    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
    expect(await db.parkingSpot.count()).toBe(9);
    expect((await db.parkingSpot.findUniqueOrThrow({ where: { id: f.spot.id } })).title).toBe(
      f.spot.title,
    );
    expect(
      first.every(
        (s) =>
          Math.abs(s.latitude - campus.latitude) < 0.01 &&
          Math.abs(s.longitude - campus.longitude) < 0.01 &&
          s.city === 'Mangaluru',
      ),
    ).toBe(true);
  });
});
