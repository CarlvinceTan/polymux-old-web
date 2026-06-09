import { defineConfig, devices } from '@playwright/test'

/**
 * Programmatic E2E suite for the Nuxt web app.
 *
 * This coexists with the manual `playwright-cli` workflow documented in
 * `content/docs/en/e2e.md`; it does not replace it. Keep all artifacts
 * (test-results/, playwright-report/, e2e/.auth/) inside `web/` — never write
 * into the workspace-root `.playwright-cli/` directory.
 *
 * Auth: a `setup` project signs in once and saves storageState, which the
 * browser projects reuse. Local UI sessions drop to /sign-in after ~10s, so
 * per-test UI login would flake — always go through the stored state.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Signs in once and persists storageState for the authed projects.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // Public pages — no auth needed.
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.public\.spec\.ts/,
    },

    // Authenticated pages — reuse the stored session.
    {
      name: 'authed',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /.*\.public\.spec\.ts/,
    },
  ],

  // Reuse a dev server if one is already running; otherwise start one.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
