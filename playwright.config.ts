import { defineConfig, devices } from '@playwright/test';
const database =
  process.env.TEST_DATABASE_URL ??
  'postgresql://driveshare:driveshare_local@127.0.0.1:5432/driveshare_test?schema=public';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w apps/api',
      url: 'http://127.0.0.1:4001/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        DATABASE_URL: database,
        NODE_ENV: 'development',
        DEMO_MODE: 'true',
        SESSION_SECRET: 'e2e-test-secret-for-local-verification-only',
        PORT: '4001',
        APP_ORIGIN: 'http://localhost:5174',
      },
    },
    {
      command: 'npm run dev -w apps/web -- --port 5174 --host localhost',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4001' },
    },
  ],
});
