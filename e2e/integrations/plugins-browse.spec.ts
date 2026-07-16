// spec: unified plugins page (/connections) — Installed + Marketplace merged
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

// The onboarding/beta modal is a full-screen overlay that blocks all clicks.
// Pre-seed the localStorage acceptance flag so it never opens during tests.
const USER = '0a3eceac-cc7c-4317-a800-f0ff83126757'

test.beforeEach(async ({ page }) => {
  await page.addInitScript((user) => {
    const v = '2026-05-03'
    for (const u of [user, 'undefined', 'null', '']) {
      try { localStorage.setItem(`polymux:betaAgreementAccepted:${v}:${u}`, 'true') }
      catch { /* ignore */ }
    }
  }, USER)
})

test.describe('Plugins — unified browse page', () => {
  // ─── Redirects (Installed + Marketplace merged into /browse) ───────────────

  test('Redirects /integrations to /connections', async ({ page }) => {
    await page.goto('/integrations')
    await expect(page).toHaveURL(/\/connections/)
  })

  test('Legacy /integrations/browse redirects to /connections', async ({ page }) => {
    await page.goto('/integrations/browse')
    await expect(page).toHaveURL(/\/connections/)
  })

  test('Legacy /integrations/installed redirects to /connections', async ({ page }) => {
    await page.goto('/integrations/installed')
    await expect(page).toHaveURL(/\/connections/)
  })

  test('Legacy /integrations/marketplace redirects to /connections (preserving tag)', async ({ page }) => {
    await page.goto('/integrations/marketplace?tag=storage')
    await expect(page).toHaveURL(/\/connections\?tag=storage/)
  })

  // ─── Layout ────────────────────────────────────────────────────────────────

  test('Browse page renders the unified table', async ({ page }) => {
    await page.goto('/connections')

    // Page header now shows two tabs: Browse, Publish (Installed/Marketplace gone)
    await expect(page.getByRole('link', { name: 'Browse' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Publish' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Marketplace' })).toHaveCount(0)

    // Single search box for the merged list
    await expect(page.locator('input[name="plugins-search"]')).toBeVisible()

    // Left rail filter groups (visible at the default lg viewport)
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Category', { exact: true }).first()).toBeVisible()

    // At least one row (catalog loads asynchronously)
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()
  })

  // ─── Search ──────────────────────────────────────────────────────────────

  test('Search filters rows', async ({ page }) => {
    await page.goto('/connections')
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()

    const searchInput = page.locator('input[name="plugins-search"]')
    await searchInput.fill('Google')
    await expect(page.locator('[data-testid="integration-row-google-drive"]')).toBeVisible()

    await searchInput.fill('')
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()
  })

  test('Search with no results shows empty state', async ({ page }) => {
    await page.goto('/connections')
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()

    await page.locator('input[name="plugins-search"]').fill('xyznotexist')
    await expect(page.getByText('No items match your search.')).toBeVisible()
    await expect(page.locator('[data-testid^="integration-row-"]')).toHaveCount(0)
  })

  // ─── Status filter (replaces the Installed/Marketplace tab split) ──────────

  test('Status filter switches between installed and available lists', async ({ page }) => {
    await page.goto('/connections')
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()

    const filters = page.getByRole('complementary').filter({ hasText: 'Status' })
    await filters.getByRole('button', { name: /^Installed\b/ }).click()
    await expect(page.getByText('No items match your search.').or(page.locator('[data-testid="plugins-table"]'))).toBeVisible()

    await filters.getByRole('button', { name: /^Available\b/ }).click()
    await expect(page.locator('[data-testid^="integration-row-"]').first()).toBeVisible()
  })

  // ─── Detail modal (opens from a row, install/uninstall lives inside) ───────

  test('Clicking a row opens the detail dialog', async ({ page }) => {
    await page.goto('/connections')

    const driveRow = page.locator('[data-testid="integration-row-google-drive"]')
    await expect(driveRow).toBeVisible()
    await driveRow.click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('About')).toBeVisible()
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /Connect|Install|Disconnect|Uninstall/i }),
    ).toBeVisible()
  })

  test('Closes the detail dialog', async ({ page }) => {
    await page.goto('/connections')

    const driveRow = page.locator('[data-testid="integration-row-google-drive"]')
    await expect(driveRow).toBeVisible()
    await driveRow.click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    await page.locator('[role="dialog"]').getByRole('button', { name: /close/i }).click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    await expect(page.locator('input[name="plugins-search"]')).toBeVisible()
  })

  // ─── Sort ──────────────────────────────────────────────────────────────────

  test('Sort control is visible', async ({ page }) => {
    await page.goto('/connections')

    // The sort button shows the active selection (default: Popularity).
    const sortBtn = page.getByRole('button', { name: /Popularity/i })
    await expect(sortBtn).toBeVisible()
  })
})
