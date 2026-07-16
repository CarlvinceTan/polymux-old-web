import { test as setup, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Signs in once via the UI and persists the Supabase session to storageState.
 * The `authed` project reuses this file so individual specs never log in (local
 * UI sessions drop to /sign-in within ~10s, so per-test login flakes).
 *
 * Credentials are resolved from env first, then from the gitignored
 * `CLAUDE.local.md` (TEST_USERNAME / TEST_PASSWORD) so local runs work without
 * exporting anything. Nothing secret is committed.
 */

const AUTH_FILE = 'e2e/.auth/user.json'

function fromLocalMd(key: string): string | undefined {
  const file = resolve(process.cwd(), 'CLAUDE.local.md')
  if (!existsSync(file)) return undefined
  const m = readFileSync(file, 'utf8').match(new RegExp(`${key}\\s*=\\s*"?([^"\\n]+)"?`))
  return m?.[1]?.trim()
}

const username = process.env.E2E_USERNAME || process.env.TEST_USERNAME || fromLocalMd('TEST_USERNAME')
const password = process.env.E2E_PASSWORD || process.env.TEST_PASSWORD || fromLocalMd('TEST_PASSWORD')

// Nuxt dev never reaches networkidle (HMR + analytics keep the socket open) and
// hydration lags the initial paint, so allow extra room for the retry loop.
setup.setTimeout(90_000)

setup('authenticate', async ({ page }) => {
  expect(
    username && password,
    'Set E2E_USERNAME/E2E_PASSWORD (or TEST_USERNAME/TEST_PASSWORD in web/CLAUDE.local.md)',
  ).toBeTruthy()

  // The sign-in form is a Vue @submit.prevent handler. If the submit button is
  // clicked before client hydration attaches it, the browser does a native GET
  // submit and stays on /sign-in (?email=...&password=...). Settle briefly for
  // hydration, then retry the whole fill+submit on a clean page until the SPA
  // handles it. Don't wait on networkidle — it never settles in Nuxt dev.
  let signedIn = false
  for (let attempt = 0; attempt < 4 && !signedIn; attempt++) {
    await page.goto('/sign-in')
    await page.locator('#signin-email').waitFor({ state: 'visible' })
    await page.waitForTimeout(1_000) // let client hydration attach the handler
    await page.fill('#signin-email', username!)
    await page.fill('#signin-password', password!)
    await page.click('button[type="submit"]')
    try {
      // Success redirects away from /sign-in (without the GET-submit query).
      await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 8_000 })
      signedIn = true
    }
    catch {
      // Surface a real auth error (bad credentials) instead of looping on it.
      const err = page.locator('[role="alert"]')
      if (await err.isVisible().catch(() => false)) {
        throw new Error(`Sign-in failed: ${(await err.textContent())?.trim()}`)
      }
    }
  }
  expect(signedIn, 'Could not sign in after 4 attempts').toBeTruthy()

  // Keep reusable auth state limited to auth/session data. UI policy caches are
  // first-paint hints, and persisting them across specs can make the client
  // hydrate a different feature-gated tree than the server rendered.
  await page.evaluate(() => {
    localStorage.removeItem('polymux_feature_flags_cache')
    localStorage.removeItem('polymux_limit_policy')
    localStorage.removeItem('polymux_workspace_plans')
    localStorage.removeItem('polymux_workspace_member_counts')
  })

  mkdirSync(dirname(AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})
