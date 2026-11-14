import { beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '../src/db.js';
import { app } from '../src/app.js';
import { reserve, pay } from '../src/engine.js';
import { fixture, session, payment, origin, type Fixture } from './helpers.js';
let f: Fixture;
beforeEach(async () => {
  f = await fixture();
});
afterAll(() => db.$disconnect());
describe('HTTP authorization, validation and CSRF', () => {
  it('registers a driver without allowing self-promotion to admin', async () => {
    const r = await request(app).post('/api/auth/register').set('Origin', origin).send({
      fullName: 'New User',
      email: 'new@test.demo',
      password: 'RegisterTest!23',
      owner: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.user.roles).toEqual(['DRIVER', 'OWNER']);
    expect(r.body.user.passwordHash).toBeUndefined();
    const attack = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        fullName: 'Attacker',
        email: 'attack@test.demo',
        password: 'RegisterTest!23',
        roles: ['ADMIN'],
      });
    expect(attack.status).toBe(400);
  });
  it('sets HTTP-only same-site cookies and rejects invalid passwords', async () => {
    const s = await session(f.a);
    expect(String(s.cookie)).toMatch(/HttpOnly/);
    expect(String(s.cookie)).toMatch(/SameSite=Lax/);
    const r = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: f.a.email, password: 'Incorrect!23' });
    expect(r.status).toBe(401);
  });
  it('driver cannot read another driver’s private booking', async () => {
    const b = await reserve(f.a, f.input);
    const s = await session(f.b);
    expect((await s.get(`/bookings/${b.id}`)).status).toBe(403);
  });
  it('driver cannot access admin endpoints or cancel another user’s reservation', async () => {
    const b = await reserve(f.a, f.input);
    const s = await session(f.b);
    expect((await s.get('/admin/overview')).status).toBe(403);
    expect(
      (await s.post(`/bookings/${b.id}/cancel`, { reason: 'Unauthorized cancellation' })).status,
    ).toBe(403);
  });
  it('owner cannot modify another owner’s recurring availability', async () => {
    const s = await session(f.owner2);
    expect((await s.put(`/spots/${f.spot.id}/availability`, { slots: [] })).status).toBe(403);
  });
  it('client-supplied amounts and prices are rejected', async () => {
    const s = await session(f.a);
    const b = await reserve(f.a, f.input);
    expect((await s.post(`/bookings/${b.id}/pay`, { ...payment(), amount: 1 })).status).toBe(400);
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.totalAmount).toBe(4000);
    expect((await s.post('/bookings', { ...f.input, totalAmount: 0 })).status).toBe(400);
  });
  it('missing CSRF, wrong origin and forged cookies cannot mutate state', async () => {
    const s = await session(f.a);
    const body = { registrationNumber: 'TEST Z 9876', vehicleType: 'CAR', vehicleModel: 'Test' };
    expect(
      (
        await request(app)
          .post('/api/vehicles')
          .set('Cookie', s.cookie)
          .set('Origin', origin)
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/vehicles')
          .set('Cookie', s.cookie)
          .set('Origin', 'https://evil.invalid')
          .set('X-CSRF-Token', s.csrf)
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/bookings').set('Cookie', 'driveshare_session=forged')).status,
    ).toBe(401);
  });
  it('users cannot edit or remove someone else’s vehicles', async () => {
    const s = await session(f.b);
    expect(
      (
        await s.patch(`/vehicles/${f.va.id}`, {
          registrationNumber: 'STOLEN 123',
          vehicleType: 'CAR',
          vehicleModel: 'Test',
        })
      ).status,
    ).toBe(403);
    expect((await s.delete(`/vehicles/${f.va.id}`)).status).toBe(403);
  });
  it('vehicle removal preserves booking history', async () => {
    const b = await reserve(f.a, f.input);
    const s = await session(f.a);
    expect((await s.delete(`/vehicles/${f.va.id}`)).status).toBe(200);
    expect((await s.get(`/bookings/${b.id}`)).status).toBe(200);
    expect((await s.get('/vehicles')).body).toHaveLength(0);
  });
  it('suspension invalidates an existing session', async () => {
    const driver = await session(f.a);
    const admin = await session(f.admin);
    expect(
      (
        await admin.post(`/admin/users/${f.a.id}`, {
          accountStatus: 'SUSPENDED',
          reason: 'Review suspicious activity',
        })
      ).status,
    ).toBe(200);
    expect((await driver.get('/bookings')).status).toBe(401);
  });
  it('logout invalidates replayed session cookies', async () => {
    const s = await session(f.a);
    expect((await s.post('/auth/logout')).status).toBe(200);
    expect((await s.get('/bookings')).status).toBe(401);
  });
  it('blocking confirmed intervals returns affected IDs and requires explicit resolution', async () => {
    const b = await reserve(f.a, f.input);
    await pay(f.a, b.id, payment());
    const s = await session(f.owner);
    const block = {
      startTime: f.start.toISOString(),
      endTime: f.end.toISOString(),
      reason: 'Emergency maintenance',
    };
    const preview = await s.post(`/spots/${f.spot.id}/blocks`, block);
    expect(preview.status).toBe(409);
    expect(preview.body.details.affectedBookings[0].id).toBe(b.id);
    const result = await s.post(`/spots/${f.spot.id}/blocks`, {
      ...block,
      resolveBookings: true,
      affectedBookingIds: [b.id],
    });
    expect(result.status).toBe(201);
    expect((await db.booking.findUnique({ where: { id: b.id } }))?.bookingStatus).toBe('CANCELLED');
    expect((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount).toBe(0);
  });
  it('disabled demo controls are not accessible to drivers', async () => {
    const s = await session(f.a);
    expect((await s.post('/demo/clock', { advanceMinutes: 100 })).status).toBe(403);
  });
  it('rejects malformed UUIDs and SQL-like search input is treated as text', async () => {
    const s = await session(f.a);
    expect((await s.get('/bookings/not-a-uuid')).status).toBe(400);
    const search = await request(app).get('/api/spots').query({ q: "'; DROP TABLE users; --" });
    expect(search.status).toBe(200);
    expect(await db.user.count()).toBe(5);
  });
  it('supports one-click demo login and restricts admin demo to read-only showcase', async () => {
    await db.user.createMany({
      data: [
        {
          fullName: 'Riya Sharma',
          email: 'driver@driveshare.demo',
          passwordHash: f.a.passwordHash,
          roles: ['DRIVER'],
        },
        {
          fullName: 'Meera Nair',
          email: 'owner@driveshare.demo',
          passwordHash: f.owner.passwordHash,
          roles: ['DRIVER', 'OWNER'],
        },
        {
          fullName: 'Aditi Rao',
          email: 'admin@driveshare.demo',
          passwordHash: f.admin.passwordHash,
          roles: ['ADMIN'],
        },
      ],
    });
    const driverDemo = await request(app)
      .post('/api/auth/demo-login')
      .set('Origin', origin)
      .send({ role: 'driver' });
    expect(driverDemo.status).toBe(200);
    expect(driverDemo.body.user.email).toBe('driver@driveshare.demo');
    expect(driverDemo.body.user.showcase).toBeUndefined();

    const adminDemo = await request(app)
      .post('/api/auth/demo-login')
      .set('Origin', origin)
      .send({ role: 'admin' });
    expect(adminDemo.status).toBe(200);
    expect(adminDemo.body.user.email).toBe('admin@driveshare.demo');
    expect(adminDemo.body.user.showcase).toBe(true);
    const cookie = adminDemo.headers['set-cookie'];
    const csrf = adminDemo.body.csrf;

    const overview = await request(app).get('/api/admin/overview').set('Cookie', cookie);
    expect(overview.status).toBe(200);

    const mutateUser = await request(app)
      .post(`/api/admin/users/${f.a.id}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({ accountStatus: 'SUSPENDED', reason: 'Showcase mutation attempt' });
    expect(mutateUser.status).toBe(403);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf);
    expect(logout.status).toBe(200);
  });
});
