import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public',
      APP_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: 'test-session-secret-only-not-for-deployment',
    },
  },
});
