import { defineConfig, devices } from '@playwright/test';

// Live smoke test against a deployed Wickfleet; no dev server, no mocks.
export default defineConfig({
  testDir: './e2e/live',
  reporter: 'line',
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.WICKFLEET_URL,
    // A trace would record the typed password and TOTP.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-bundled', use: { ...devices['Desktop Chrome'] } }],
});
