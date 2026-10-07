import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.CIC_E2E_STAGING_URL ?? 'http://127.0.0.1:3200',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.CIC_E2E_STAGING_URL ? undefined : {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3200',
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
