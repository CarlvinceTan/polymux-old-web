// spec: integrations installed and marketplace pages
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

// The onboarding/beta modal is a full-screen overlay that blocks all clicks.
// Pre-seed the localStorage acceptance flag so it never opens during tests.
// Uses the same user/workspace IDs as e2e/workflow-run.spec.ts.
const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2'
const USER = '0a3eceac-cc7c-4317-a800-f0ff83126757'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([ws, user]) => {
    const v = '2026-05-03'
    for (const u of [user, 'undefined', 'null', '']) {
      try { localStorage.setItem(`polymux:betaAgreementAccepted:${v}:${u}`, 'true') }
      catch { /* ignore */ }
    }
    try { localStorage.setItem('polymux_current_workspace_id', ws) }
    catch { /* ignore */ }
  }, [WS, USER])
})

test.describe('Integrations — Installed and Marketplace', () => {
  // ─── Installed ────────────────────────────────────────────────────────────

  test('Redirects /integrations to /integrations/installed', async ({ page }) => {
    // Navigate to /integrations
    await page.goto('/integrations')

    // expect: URL becomes /integrations/installed
    await expect(page).toHaveURL(/\/integrations\/installed/)

    // expect: Installed tab in top navigation is active
    await expect(page.getByRole('link', { name: 'Installed' })).toBeVisible()
  })

  test('Installed page renders correctly', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    // expect: page header shows three tabs: Installed, Marketplace, Publish
    await expect(page.getByRole('link', { name: 'Installed' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Marketplace' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Publish' })).toBeVisible()

    // expect: search box with placeholder 'Search installed…' visible
    await expect(page.locator('input[name="installed-search"]')).toBeVisible()

    // expect: 'Filter by' and 'Sort by' buttons visible (shown only when items are installed)
    // This account has Google Drive installed, so the filter/sort controls are rendered
    await expect(page.getByRole('button', { name: /Filter by/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sort by/i })).toBeVisible()

    // expect: at least one integration card shown
    await expect(page.locator('[data-testid^="integration-card-"]').first()).toBeVisible()
  })

  test('Search filters installed integrations', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    const searchInput = page.locator('input[name="installed-search"]')
    await expect(searchInput).toBeVisible()

    // Type 'Google' in search box
    await searchInput.fill('Google')

    // expect: only matching integrations remain visible
    await expect(page.locator('[data-testid="integration-card-google-drive"]')).toBeVisible()

    // Clear search -> all integrations restored
    await searchInput.fill('')
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('[data-testid^="integration-card-"]').first()).toBeVisible()
  })

  test('Search with no results shows empty state', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    const searchInput = page.locator('input[name="installed-search"]')
    await expect(searchInput).toBeVisible()

    // Type 'xyznotexist' in search
    await searchInput.fill('xyznotexist')

    // expect: no integration cards shown, empty state visible
    await expect(page.getByText('No installed items match your search.')).toBeVisible()
    await expect(page.locator('[data-testid^="integration-card-"]')).not.toBeVisible()
  })

  test('Opens integration detail dialog on card click', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    // Click any integration card
    await page.locator('[data-testid^="integration-card-"]').first().click()

    // expect: dialog appears with About section
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('About')).toBeVisible()

    // expect: Disconnect or Uninstall button visible (installed item)
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /Disconnect|Uninstall/i }),
    ).toBeVisible()
  })

  test('Closes integration detail dialog', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    // Open detail dialog
    await page.locator('[data-testid^="integration-card-"]').first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Click Close (X) button — aria-label is t('common.close') = "Close"
    await page.locator('[role="dialog"]').getByRole('button', { name: /close/i }).click()

    // expect: dialog closes, main list visible
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    await expect(page.locator('input[name="installed-search"]')).toBeVisible()
  })

  test('Filter by button opens filter menu', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    const filterBtn = page.getByRole('button', { name: /Filter by/i })
    await expect(filterBtn).toBeVisible()

    // Click 'Filter by' button
    await filterBtn.click()

    // expect: dropdown/popover with filter options appears (e.g. "All" option)
    await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible()
  })

  test('Sort by button opens sort menu', async ({ page }) => {
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    const sortBtn = page.getByRole('button', { name: /Sort by/i })
    await expect(sortBtn).toBeVisible()

    // Click 'Sort by' button
    await sortBtn.click()

    // expect: dropdown/popover with sort options appears (e.g. "Popularity" option)
    await expect(page.getByRole('button', { name: /Popularity/i })).toBeVisible()
  })

  // ─── Marketplace ──────────────────────────────────────────────────────────

  test('Marketplace page renders correctly', async ({ page }) => {
    // Navigate to /integrations/marketplace
    await page.goto('/integrations/marketplace')

    // expect: Marketplace tab active
    await expect(page).toHaveURL(/\/integrations\/marketplace/)
    await expect(page.getByRole('link', { name: 'Marketplace' })).toBeVisible()

    // expect: search box with placeholder 'Search marketplace…' visible
    await expect(page.locator('input[name="marketplace-search"]')).toBeVisible()

    // expect: integration cards shown (catalog loads asynchronously)
    await expect(page.locator('[data-testid^="integration-card-"]').first()).toBeVisible()
  })

  test('Search filters marketplace integrations', async ({ page }) => {
    // Navigate to /integrations/marketplace
    await page.goto('/integrations/marketplace')

    const searchInput = page.locator('input[name="marketplace-search"]')
    await expect(searchInput).toBeVisible()

    // Type 'Google' in search -> matching only
    await searchInput.fill('Google')
    await expect(searchInput).toHaveValue('Google')

    // Clear -> all restored
    await searchInput.fill('')
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('[data-testid^="integration-card-"]').first()).toBeVisible()
  })

  test('Navigation tabs switch between Installed and Marketplace', async ({ page }) => {
    // Start on marketplace
    await page.goto('/integrations/marketplace')
    await expect(page).toHaveURL(/\/integrations\/marketplace/)

    // Click 'Installed' tab
    await page.getByRole('link', { name: 'Installed' }).click()

    // expect: navigated to /integrations/installed
    await expect(page).toHaveURL(/\/integrations\/installed/)
  })

  test('Clicking an already-installed card opens detail dialog with Disconnect', async ({ page }) => {
    // Navigate to /integrations/installed — all cards here are installed
    await page.goto('/integrations/installed')

    // Click an already-installed integration card
    await page.locator('[data-testid^="integration-card-"]').first().click()

    // expect: dialog shows Disconnect or Uninstall button
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /Disconnect|Uninstall/i }),
    ).toBeVisible()
  })

  test('Clicking an uninstalled card shows Install option', async ({ page }) => {
    // Navigate to /integrations/marketplace
    // Marketplace sorts uninstalled items first by default
    await page.goto('/integrations/marketplace')

    // Wait for catalog to load
    await expect(page.locator('[data-testid^="integration-card-"]').first()).toBeVisible()

    // Click the first card in the marketplace (should be an uninstalled item)
    await page.locator('[data-testid^="integration-card-"]').first().click()

    // expect: dialog appears
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // expect: Install or Connect button visible (for uninstalled items)
    await expect(
      page.locator('[role="dialog"]').getByRole('button', { name: /^Install$|^Connect$/i }),
    ).toBeVisible()
  })
})
