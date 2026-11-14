import { demo } from './config.js';
let offset = 0;
let frozen: Date | null = null;
export const now = () => (frozen ? new Date(frozen) : new Date(Date.now() + offset));
export function setDemoTime(value?: string) {
  if (!demo && process.env.NODE_ENV !== 'test') throw new Error('Demo clock is disabled');
  frozen = process.env.NODE_ENV === 'test' && value ? new Date(value) : null;
  offset = value ? new Date(value).getTime() - Date.now() : 0;
  return now();
}
