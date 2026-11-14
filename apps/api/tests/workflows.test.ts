import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { reserve, pay, bookingAction } from '../src/engine.js';
import { fixture, payment, session, type Fixture } from './helpers.js';
import { setDemoTime, now } from '../src/clock.js';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterAll(() => db.$disconnect());
const listing = () => ({
  title: 'New Host Courtyard',
  description: 'A real API-created fictional space for testing.',
  address: '42 Test Road, Bengaluru',
  city: 'Bengaluru',
  latitude: 12.94,
  longitude: 77.61,
  hourlyPrice: 6000,
  vehicleTypes: ['CAR'],
  parkingType: 'GATED',
  spotNumber: 'T-2',
  accessInstructions: 'Meet the host at the marked entrance.',
  permissionConfirmed: true,
  isActive: true,
  images: [],
});
describe('complete API workflows and deployment gates', () => {
  it('creates, schedules and approves a listing before it becomes bookable', async () => {
    const owner = await session(f.owner),
      admin = await session(f.admin);
    const created = await owner.post('/spots', listing());
    expect(created.status).toBe(201);
    expect(created.body.approvalStatus).toBe('PENDING');
    const before = await owner.get('/spots');
    expect(before.body.some((s: { id: string }) => s.id === created.body.id)).toBe(false);
    const slots = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      startTime: '00:00',
      endTime: '24:00',
      effectiveFrom: '2020-01-01',
      effectiveUntil: null,
      isActive: true,
    }));
    expect((await owner.put(`/spots/${created.body.id}/availability`, { slots })).status).toBe(200);
    expect(
      (
        await admin.post(`/admin/spots/${created.body.id}`, {
          approvalStatus: 'APPROVED',
          reason: 'Verified fictional permission and safe access.',
        })
      ).status,
    ).toBe(200);
    const booked = await reserve(f.a, { ...f.input, parkingSpotId: created.body.id });
    expect(booked.totalAmount).toBe(6000);
  });
  it('listing edits require reapproval and never rewrite confirmed price/access snapshots', async () => {
    const b = await reserve(f.a, f.input);
    await pay(f.a, b.id, payment());
    const owner = await session(f.owner);
    const edit = await owner.patch(`/spots/${f.spot.id}`, {
      ...listing(),
      hourlyPrice: 9000,
      accessInstructions: 'A new instruction for future reservations.',
    });
    expect(edit.status).toBe(200);
    expect(edit.body.approvalStatus).toBe('PENDING');
    const after = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.totalAmount).toBe(4000);
    expect((after.termsSnapshot as { accessInstructions: string }).accessInstructions).toBe(
      'Ask the test host at the gate.',
    );
  });
  it('recurring edits cannot invalidate confirmed reservations; overlapping windows return 409', async () => {
    const b = await reserve(f.a, f.input);
    await pay(f.a, b.id, payment());
    const owner = await session(f.owner);
    expect((await owner.put(`/spots/${f.spot.id}/availability`, { slots: [] })).status).toBe(409);
    const base = {
      dayOfWeek: 1,
      startTime: '00:00',
      endTime: '24:00',
      effectiveFrom: '2020-01-01',
      effectiveUntil: null,
      isActive: true,
    };
    const all = Array.from({ length: 7 }, (_, dayOfWeek) => ({ ...base, dayOfWeek }));
    expect(
      (await owner.put(`/spots/${f.spot.id}/availability`, { slots: [...all, base] })).status,
    ).toBe(409);
  });
  it('a completed booking permits one review and rejects a second', async () => {
    const b = await reserve(f.a, f.input);
    await pay(f.a, b.id, payment());
    setDemoTime(f.start.toISOString());
    await bookingAction(f.owner, b.id, 'check-in', {});
    await bookingAction(f.owner, b.id, 'confirm-checkout', { departureVerified: true });
    const driver = await session(f.a);
    expect(
      (
        await driver.post(`/bookings/${b.id}/review`, {
          rating: 5,
          comment: 'A very easy fictional arrival.',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await driver.post(`/bookings/${b.id}/review`, {
          rating: 4,
          comment: 'Duplicate review should fail.',
        })
      ).status,
    ).toBe(409);
  });
  it('HTTP concurrency yields one successful reservation response', async () => {
    const a = await session(f.a),
      b = await session(f.b);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? a : b).post('/bookings', {
          ...f.input,
          vehicleId: i % 2 ? f.va.id : f.vb.id,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
  });
  it('owner block supports several days without sending false availability notices', async () => {
    const original = await reserve(f.a, f.input);
    await pay(f.a, original.id, payment());
    await reserve(f.b, {
      ...f.input,
      vehicleId: f.vb.id,
      idempotencyKey: randomUUID(),
      waitlist: true,
    });
    const owner = await session(f.owner);
    const block = {
      startTime: f.start.toISOString(),
      endTime: new Date(+f.start + 3 * 86400000).toISOString(),
      reason: 'Three-day family maintenance',
      resolveBookings: true,
      affectedBookingIds: [original.id],
    };
    expect((await owner.post(`/spots/${f.spot.id}/blocks`, block)).status).toBe(201);
    const waiting = await db.user.findUniqueOrThrow({ where: { id: f.b.id } });
    expect(JSON.stringify(waiting.notifications)).not.toContain('is available');
  });
  it('notification read state persists without replacing other users’ notices', async () => {
    await db.user.update({
      where: { id: f.a.id },
      data: { notifications: [{ id: 'test', message: 'Test notification', read: false }] },
    });
    const a = await session(f.a);
    expect((await a.post('/notifications/read')).status).toBe(200);
    expect((await a.get('/notifications')).body[0].read).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.b.id } })).notifications).toEqual([]);
  });
  it('production disables demo clock/seed/reset even when DEMO_MODE is set', () => {
    const result = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "const c=await import('./src/config.ts'); const k=await import('./src/clock.ts'); if(c.demo)process.exit(2);let blocked=false;try{k.setDemoTime('2026-01-01T00:00:00Z')}catch{blocked=true}if(!blocked)process.exit(3); console.log('production-gates-ok');",
      ],
      {
        cwd: resolve(process.cwd()),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DEMO_MODE: 'true',
          SESSION_SECRET: 'production-gate-test-unique-secret-only-123456',
        },
      },
    ).toString();
    expect(result).toContain('production-gates-ok');
  });
  it('production refuses the documented demo session secret', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/config.ts')"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'production',
            SESSION_SECRET: 'local-demo-only-change-before-any-deployment',
          },
          stdio: 'pipe',
        },
      ),
    ).toThrow();
  });
});
