import { defineConfig, devices } from '@playwright/test';

/**
 * Pre-deploy check target.
 *
 * BASE_URL            Origin to test. Default http://localhost (CI, HTTP-only nginx).
 * CHECK_RESOLVE_TO    Optional IP. When set, Chromium resolves the BASE_URL host to this IP
 *                     (--host-resolver-rules), so checks hit the LOCAL stack while using the
 *                     real hostname, TLS cert and nginx server block. deploy.sh uses
 *                     BASE_URL=https://orthoandspinetools.com CHECK_RESOLVE_TO=127.0.0.1.
 *                     Plain http://localhost on the prod box only 301s to the public domain,
 *                     which is why the old checks silently tested production instead.
 * CHECK_IGNORE_HTTPS_ERRORS=1  Accept self-signed certs (e.g. https://localhost).
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost';
const RESOLVE_TO = (process.env.CHECK_RESOLVE_TO || '').trim();
const baseHost = new URL(BASE_URL).hostname;

const launchArgs: string[] = [];
if (RESOLVE_TO) {
  launchArgs.push(`--host-resolver-rules=MAP ${baseHost} ${RESOLVE_TO}, MAP www.${baseHost} ${RESOLVE_TO}`);
}

const ignoreHTTPSErrors =
  process.env.CHECK_IGNORE_HTTPS_ERRORS === '1' ||
  /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(BASE_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Keep concurrency modest: checks run on the prod box during deploy.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60000,
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { args: launchArgs },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
