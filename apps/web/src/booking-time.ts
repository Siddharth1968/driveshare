export type BookingInterval = { start: string; end: string };
export const CAMPUS = {
  name: 'Sahyadri College of Engineering & Management',
  latitude: 12.867571,
  longitude: 74.925072,
};
export function istParts(value: string | Date) {
  const d = new Date(value);
  if (!Number.isFinite(+d)) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
export function istToISO(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return '';
  const d = new Date(`${date}T${time}:00+05:30`);
  return Number.isFinite(+d) ? d.toISOString() : '';
}
export function defaultInterval(serverTime: string | Date = new Date()): BookingInterval {
  const start = Math.ceil((+new Date(serverTime) + 30 * 60000) / (15 * 60000)) * 15 * 60000;
  return { start: new Date(start).toISOString(), end: new Date(start + 2 * 3600000).toISOString() };
}
export const withDuration = (start: string, hours: number): BookingInterval => ({
  start,
  end: new Date(+new Date(start) + hours * 3600000).toISOString(),
});
export const hoursBetween = (v: BookingInterval) =>
  Math.max(0, (+new Date(v.end) - +new Date(v.start)) / 3600000) || 0;
export const durationText = (v: BookingInterval) => {
  const minutes = Math.round(hoursBetween(v) * 60);
  return (
    [
      Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h` : '',
      minutes % 60 ? `${minutes % 60}m` : '',
    ]
      .filter(Boolean)
      .join(' ') || '0h'
  );
};
export function intervalError(value: BookingInterval, serverTime?: string) {
  if (
    !value.start ||
    !value.end ||
    !Number.isFinite(+new Date(value.start)) ||
    !Number.isFinite(+new Date(value.end))
  )
    return 'Choose check-in and check-out dates and times.';
  if (serverTime && +new Date(value.start) < +new Date(serverTime))
    return 'Check-in must be in the future.';
  if (new Date(value.end) <= new Date(value.start)) return 'Check-out must be after check-in.';
  if (hoursBetween(value) < 0.25) return 'Choose at least 15 minutes of parking.';
  if (hoursBetween(value) > 24)
    return 'A reservation can last up to 24 hours. Choose an earlier check-out.';
  return '';
}
export function readInterval(params: URLSearchParams): BookingInterval | null {
  const start = params.get('start'),
    end = params.get('end');
  return start && end && !intervalError({ start, end }) ? { start, end } : null;
}
export const detailsURL = (id: string, params: URLSearchParams) => `/explore/${id}?${params}`;
export const directionsURL = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: 'driving' })}`;
