import { QueryClient } from '@tanstack/react-query';
import { istParts } from './booking-time';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});
let csrf: string | null = null;
export const setCsrf = (value: string | null) => {
  csrf = value;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public details?: unknown,
    public status?: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const form = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(!form ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? 'The request failed.', data.details, response.status);
  return data;
}
export const post = <T>(path: string, data: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const dateTime = (value: string, zone = 'Asia/Kolkata') =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
export const localInput = (date: Date) => {
  const p = istParts(date);
  return `${p.date}T${p.time}`;
};
export const label = (text: string) => text.toLowerCase().replaceAll('_', ' ');
