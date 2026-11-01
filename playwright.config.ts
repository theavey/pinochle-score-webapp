import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;
const CI = !!process.env.CI;
// Optional: use an already-installed Chromium instead of the one matching this
// Playwright version (e.g. in sandboxes where `playwright install` isn't allowed).
const chromiumPath = process.env.PW_CHROMIUM_PATH;

/**
 * E2E tests run against the production build served by `wrangler dev`, so the
 * real Cloudflare `_headers` (including the CSP) are in effect.
 * Run `npm run build` first.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    // iOS Safari is the main target; WebKit is installed in CI.
    ...(CI ? [{ name: 'iphone-webkit', use: { ...devices['iPhone 13'] } }] : []),
  ],
  webServer: {
    command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
