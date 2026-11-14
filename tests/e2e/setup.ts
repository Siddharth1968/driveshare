import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export default async function setup() {
  const database =
    process.env.TEST_DATABASE_URL ??
    'postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public';
  if (!new URL(database).pathname.endsWith('_test'))
    throw new Error('Browser tests must use an isolated database ending in _test.');
  const env = {
    ...process.env,
    DATABASE_URL: database,
    DEMO_MODE: 'true',
    NODE_ENV: 'development',
  };
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: resolve('apps/api'), env, stdio: 'inherit' },
  );
  execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/prepare-e2e.ts')], {
    env,
    stdio: 'inherit',
  });
}
