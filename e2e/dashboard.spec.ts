import { test, expect } from '@playwright/test'

/**
 * Authenticated smoke checks — runs in the `authed` project using the stored
 * session from auth.setup.ts. Targets pages that work in local dev (avoid
 * B2/Cloud storage and the FileBrowser grid, which can't run locally).
 */

test('dashboard is reachable when authenticated', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).not.toHaveURL(/\/sign-in/)
})

test('vault is reachable when authenticated', async ({ page }) => {
  await page.goto('/vault')
  await expect(page).not.toHaveURL(/\/sign-in/)
})

test('workflow index is reachable when authenticated', async ({ page }) => {
  await page.goto('/workflow')
  await expect(page).not.toHaveURL(/\/sign-in/)
})
