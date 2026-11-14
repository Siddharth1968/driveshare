import { pathToFileURL } from 'node:url';

export function requireHostedDatabase() {
  if (process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true')
    throw new Error('Hosted setup requires production with demo clock controls disabled.');

  const url = URL.parse(process.env.DATABASE_URL ?? '');
  if (
    !url ||
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname !== '/driveshare_online' ||
    url.hash
  ) {
    throw new Error(
      'DATABASE_URL must explicitly target the driveshare_online PostgreSQL database.',
    );
  }

  const isolatedRehearsal =
    process.env.DRIVESHARE_HOSTED_REHEARSAL === 'true' &&
    ['127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.port !== '' &&
    url.port !== '5432';
  if (isolatedRehearsal) return;

  const endpoint = url.hostname.split('.')[0];
  const requiredTls = ['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '');
  if (
    !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(url.hostname) ||
    endpoint.endsWith('-pooler') ||
    (url.port && url.port !== '5432') ||
    !requiredTls
  ) {
    throw new Error('Use the direct Neon TLS connection string for driveshare_online.');
  }

  for (const [key, value] of url.searchParams) {
    const allowed =
      key === 'sslmode' ||
      (key === 'schema' && value === 'public') ||
      (key === 'channel_binding' && value === 'require') ||
      (key === 'connect_timeout' && /^\d{1,3}$/.test(value));
    if (!allowed || url.searchParams.getAll(key).length !== 1)
      throw new Error('Use the direct Neon connection string with its standard TLS options.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  requireHostedDatabase();
