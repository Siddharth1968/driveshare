import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
dotenv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
dotenv({ quiet: true });
export const production = process.env.NODE_ENV === 'production';
export const demo = process.env.DEMO_MODE === 'true' && !production;
if (
  production &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.includes('local-demo'))
) {
  throw new Error('Production requires a unique SESSION_SECRET of at least 32 characters.');
}
const positive = (name: string, fallback: number, minimum = 1) => {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < minimum) throw new Error(`Invalid ${name}`);
  return n;
};
export const settings = {
  port: Number(process.env.PORT ?? 4000),
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  secret: new TextEncoder().encode(process.env.SESSION_SECRET ?? randomBytes(48).toString('hex')),
  holdMinutes: positive('HOLD_MINUTES', 5),
  graceMinutes: positive('GRACE_MINUTES', 10, 0),
  fineInterval: positive('FINE_INTERVAL_MINUTES', 15),
  fineRupees: positive('FINE_INTERVAL_RUPEES', 20),
  noShowGrace: positive('NO_SHOW_GRACE_MINUTES', 30),
  freeCancellationMinutes: positive('FREE_CANCELLATION_MINUTES', 60),
  lateCancellationPercent: positive('LATE_CANCELLATION_PERCENT', 10, 0),
  afterStartCancellationPercent: positive('AFTER_START_CANCELLATION_PERCENT', 25, 0),
};
if (settings.lateCancellationPercent > 100 || settings.afterStartCancellationPercent > 100)
  throw new Error('Cancellation percentages may not exceed 100.');
