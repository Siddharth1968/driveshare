import { describe, it, expect } from 'vitest';
import { calculateFine, cancellationFee, coveredBySchedule } from '../src/policies.js';
const end = new Date('2026-10-29T06:30:00Z');
describe('authoritative fine and cancellation policies', () => {
  it('interprets wall-clock hours correctly on a daylight-saving transition', () => {
    const slot = {
      id: 'dst',
      parkingSpotId: 'p',
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '17:00',
      effectiveFrom: new Date('2020-01-01'),
      effectiveUntil: null,
      isActive: true,
    };
    expect(
      coveredBySchedule(
        [slot],
        'America/New_York',
        new Date('2026-03-08T13:00:00Z'),
        new Date('2026-03-08T21:00:00Z'),
      ),
    ).toBe(true);
  });
  it.each([
    [-10, 0],
    [0, 0],
    [10, 0],
    [11, 2000],
    [25, 2000],
    [26, 4000],
    [35, 4000],
    [55, 6000],
  ])('checkout %i minutes late produces %i paise', (minutes, amount) => {
    expect(calculateFine(end, new Date(+end + minutes * 60000)).amount).toBe(amount);
  });
  it('more than an hour is free; exact hour and start boundaries are explicit', () => {
    expect(cancellationFee(4000, end, new Date(+end - 3600001), false)).toBe(0);
    expect(cancellationFee(4000, end, new Date(+end - 3600000), false)).toBe(400);
    expect(cancellationFee(4000, end, end, false)).toBe(1000);
    expect(cancellationFee(4000, end, end, true)).toBe(0);
  });
  it('uses the parking location timezone for recurring coverage', () => {
    const slot = {
      id: 's',
      parkingSpotId: 'p',
      dayOfWeek: 4,
      startTime: '09:00',
      endTime: '17:00',
      effectiveFrom: new Date('2020-01-01'),
      effectiveUntil: null,
      isActive: true,
    };
    expect(
      coveredBySchedule(
        [slot],
        'Asia/Kolkata',
        new Date('2026-10-29T03:30:00Z'),
        new Date('2026-10-29T11:30:00Z'),
      ),
    ).toBe(true);
    expect(
      coveredBySchedule(
        [slot],
        'Asia/Kolkata',
        new Date('2026-10-29T03:29:00Z'),
        new Date('2026-10-29T11:30:00Z'),
      ),
    ).toBe(false);
  });
});
