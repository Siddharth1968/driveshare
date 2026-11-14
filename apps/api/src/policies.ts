import { DateTime } from 'luxon';
import type { AvailabilitySlot } from '@prisma/client';
import { settings } from './config.js';
import { ensure } from './errors.js';
export const active = ['PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKOUT_PENDING'];
export const policy = () => ({
  graceMinutes: settings.graceMinutes,
  intervalMinutes: settings.fineInterval,
  intervalPaise: settings.fineRupees * 100,
  freeCancellationMinutes: settings.freeCancellationMinutes,
  lateCancellationPercent: settings.lateCancellationPercent,
  afterStartCancellationPercent: settings.afterStartCancellationPercent,
  cancellation: `Free >${settings.freeCancellationMinutes} min; ${settings.lateCancellationPercent}% within ${settings.freeCancellationMinutes} min; ${settings.afterStartCancellationPercent}% after start; owner/unavailable: full refund.`,
  checkoutCapMinutes: 15,
});
export function calculateFine(end: Date, exit: Date, terms: Record<string, unknown> = policy()) {
  const minutes = Math.max(0, Math.ceil((exit.getTime() - end.getTime()) / 60000));
  const chargeable = Math.max(0, minutes - Number(terms.graceMinutes));
  return {
    minutes,
    amount: Math.ceil(chargeable / Number(terms.intervalMinutes)) * Number(terms.intervalPaise),
  };
}
export function cancellationFee(
  total: number,
  start: Date,
  time: Date,
  fullRefund: boolean,
  terms: Record<string, unknown> = policy(),
) {
  const freeMinutes = Number(terms.freeCancellationMinutes ?? 60);
  if (fullRefund || start.getTime() - time.getTime() > freeMinutes * 60000) return 0;
  const percent =
    time < start
      ? Number(terms.lateCancellationPercent ?? 10)
      : Number(terms.afterStartCancellationPercent ?? 25);
  return Math.round((total * percent) / 100);
}
export function validateInterval(start: Date, end: Date, maxHours = 24) {
  ensure(
    Number.isFinite(+start) && Number.isFinite(+end) && end > start,
    400,
    'End time must be after start time.',
  );
  ensure(
    +end - +start <= maxHours * 3600000,
    400,
    `The interval may last at most ${maxHours} hours.`,
  );
}
export function coveredBySchedule(slots: AvailabilitySlot[], zone: string, start: Date, end: Date) {
  let cursor = +start;
  const intervals: [number, number][] = [];
  let day = DateTime.fromJSDate(start, { zone }).startOf('day');
  const last = DateTime.fromJSDate(end, { zone }).startOf('day');
  while (day <= last) {
    for (const s of slots) {
      if (!s.isActive || s.dayOfWeek !== day.weekday % 7) continue;
      const date = day.toISODate()!;
      if (
        date < s.effectiveFrom.toISOString().slice(0, 10) ||
        (s.effectiveUntil && date > s.effectiveUntil.toISOString().slice(0, 10))
      )
        continue;
      const minute = (str: string) => Number(str.slice(0, 2)) * 60 + Number(str.slice(3));
      const wallTime = (m: number) =>
        m === 1440 ? day.plus({ days: 1 }) : day.set({ hour: Math.floor(m / 60), minute: m % 60 });
      intervals.push([+wallTime(minute(s.startTime)), +wallTime(minute(s.endTime))]);
    }
    day = day.plus({ days: 1 });
  }
  intervals.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of intervals) if (a <= cursor && b > cursor) cursor = b;
  return cursor >= +end;
}
export function distanceKm(a: number, b: number, c: number, d: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 100) / 100;
}
