import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Works against a fresh local demo, including the Docker/Nginx origin.
// It makes only simulated transactions in the fictional driver4 account.
const base = (process.env.SMOKE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const origin = new URL(base).origin;
let cookie = '',
  csrf = '';
async function request(path, body) {
  const response = await fetch(`${base}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${result.error ?? response.status}`);
  return { response, result };
}
assert.equal((await request('/health')).result.status, 'ok');
const spaces = (await request('/spots')).result;
assert.equal(spaces.length, 7);
const login = await request('/auth/login', {
  email: 'driver4@driveshare.demo',
  password: 'DriveShareDemo!23',
});
cookie = login.response.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
csrf = login.result.csrf;
assert.ok(cookie && csrf);
const vehicle = (await request('/vehicles')).result[0];
const spot = spaces.find((space) => space.title === 'Riverside Court');
assert.ok(vehicle && spot);
const start = new Date(Date.now() + 2 * 3600000);
const booking = (
  await request('/bookings', {
    parkingSpotId: spot.id,
    vehicleId: vehicle.id,
    startTime: start.toISOString(),
    endTime: new Date(+start + 3600000).toISOString(),
    idempotencyKey: randomUUID(),
  })
).result;
assert.equal(booking.bookingStatus, 'PAYMENT_PENDING');
const payment = (
  await request(`/bookings/${booking.id}/pay`, {
    idempotencyKey: randomUUID(),
    method: 'DEMO_CARD',
    outcome: 'success',
    type: 'BOOKING',
  })
).result;
assert.equal(payment.booking.bookingStatus, 'CONFIRMED');
assert.equal(payment.payment.amount, spot.hourlyPrice);
const cancelled = (
  await request(`/bookings/${booking.id}/cancel`, {
    reason: 'Fresh installation smoke verification completed.',
  })
).result;
assert.equal(cancelled.bookingStatus, 'CANCELLED');
const ledger = (await request('/payments')).result.filter(
  (entry) => entry.bookingId === booking.id && entry.paymentStatus === 'SUCCESS',
);
assert.equal(
  ledger.reduce((sum, entry) => sum + entry.amount, 0),
  0,
);
console.log(
  'Smoke passed: health, seed, cookie authentication, reservation, simulated payment, cancellation and balanced refund.',
);
