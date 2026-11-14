import bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { db } from '../src/db.js';
import { app } from '../src/app.js';
import { setDemoTime, now } from '../src/clock.js';
import { policy } from '../src/policies.js';
export const origin = 'http://localhost:5173';
const passwordHash = await bcrypt.hash('TestPassword!23', 4);
export async function fixture() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Tests require an isolated database whose name ends in _test.');
  setDemoTime();
  await db.$executeRaw`TRUNCATE reviews,payments,bookings,blocked_slots,availability_slots,vehicles,parking_spots,users CASCADE`;
  const owner = await db.user.create({
    data: {
      fullName: 'Test Owner',
      email: 'owner@test.demo',
      passwordHash,
      roles: ['DRIVER', 'OWNER'],
    },
  });
  const owner2 = await db.user.create({
    data: {
      fullName: 'Other Owner',
      email: 'owner2@test.demo',
      passwordHash,
      roles: ['DRIVER', 'OWNER'],
    },
  });
  const a = await db.user.create({
    data: { fullName: 'Driver A', email: 'a@test.demo', passwordHash, roles: ['DRIVER'] },
  });
  const b = await db.user.create({
    data: { fullName: 'Driver B', email: 'b@test.demo', passwordHash, roles: ['DRIVER'] },
  });
  const admin = await db.user.create({
    data: { fullName: 'Admin', email: 'admin@test.demo', passwordHash, roles: ['ADMIN'] },
  });
  const va = await db.vehicle.create({
    data: {
      userId: a.id,
      registrationNumber: 'TEST A 1234',
      vehicleType: 'CAR',
      vehicleModel: 'Test car',
    },
  });
  const vb = await db.vehicle.create({
    data: {
      userId: b.id,
      registrationNumber: 'TEST B 1234',
      vehicleType: 'CAR',
      vehicleModel: 'Test car B',
    },
  });
  const spot = await db.parkingSpot.create({
    data: {
      ownerId: owner.id,
      title: 'Test Courtyard Space',
      description: 'A fictional space for integration testing.',
      address: '123 Test Campus, Bengaluru',
      city: 'Bengaluru',
      latitude: 12.9346,
      longitude: 77.6057,
      hourlyPrice: 4000,
      vehicleTypes: ['CAR'],
      parkingType: 'COVERED',
      spotNumber: 'T-1',
      accessInstructions: 'Ask the test host at the gate.',
      approvalStatus: 'APPROVED',
      permissionConfirmed: true,
    },
  });
  await db.availabilitySlot.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      parkingSpotId: spot.id,
      dayOfWeek,
      startTime: '00:00',
      endTime: '24:00',
      effectiveFrom: new Date('2020-01-01'),
    })),
  });
  const start = new Date(+now() + 7200000),
    end = new Date(+start + 3600000);
  const input = {
    parkingSpotId: spot.id,
    vehicleId: va.id,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    idempotencyKey: randomUUID(),
  };
  return { owner, owner2, a, b, admin, va, vb, spot, start, end, input };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export const payment = (key = randomUUID(), outcome = 'success', type = 'BOOKING') => ({
  idempotencyKey: key,
  method: 'DEMO_UPI',
  outcome,
  type,
});
export async function session(user: User) {
  const login = await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password: 'TestPassword!23' });
  if (login.status !== 200) throw new Error(JSON.stringify(login.body));
  const cookie = login.headers['set-cookie'];
  const csrf = login.body.csrf;
  return {
    get: (path: string) => request(app).get(`/api${path}`).set('Cookie', cookie),
    post: (path: string, body: unknown = {}) =>
      request(app)
        .post(`/api${path}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body),
    patch: (path: string, body: unknown) =>
      request(app)
        .patch(`/api${path}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body),
    put: (path: string, body: unknown) =>
      request(app)
        .put(`/api${path}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body),
    delete: (path: string) =>
      request(app)
        .delete(`/api${path}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf),
    cookie,
    csrf,
  };
}
export function directBooking(f: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    driverId: f.a.id,
    parkingSpotId: f.spot.id,
    vehicleId: f.va.id,
    startTime: f.start,
    endTime: f.end,
    totalAmount: 4000,
    priceSnapshot: 4000,
    termsSnapshot: policy(),
    idempotencyKey: randomUUID(),
    bookingStatus: 'CONFIRMED',
    paymentStatus: 'SUCCESS',
    ...overrides,
  };
}
