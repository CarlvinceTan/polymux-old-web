// spec: integrations/publish listing and publish/new standalone pages
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Signs in via the UI, retrying up to 4 times (mirrors auth.setup.ts pattern).
 * Used in each test because `storageState` is set but this generator session
 * cannot pre-populate it — the authed project dependency handles that at
 * run time; these helpers guard against any edge-case redirect.
 */
async function ensureSignedIn(page: import('@playwright/test').Page) {
  if (!page.url().includes('/sign-in')) return
  await page.locator('#signin-email').waitFor({ state: 'visible' })
  await page.waitForTimeout(500)
  await page.fill('#signin-email', 'carlvince@live.com')
  await page.fill('#signin-password', 'testing')
  await page.click('button[type="submit"]')
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })
}

test.describe('Integrations — Publish Listing and Publish New', () => {
  // =========================================================================
  // PUBLISH LISTING TESTS
  // =========================================================================

  test('Publish page renders with empty state', async ({ page }) => {
    // Navigate to /integrations/publish
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await expect(page).not.toHaveURL(/\/sign-in/)

    // expect: Publish tab active
    await expect(page.locator('a[href="/integrations/publish"]').first()).toBeVisible()

    // expect: search box visible
    await expect(page.locator('input[name="publisher-search"]')).toBeVisible()

    // expect: New button visible (icon-only button with aria-label "New")
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible()

    // expect: Filter by and Sort by buttons visible
    await expect(page.getByRole('button', { name: /Filter by/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sort by/i })).toBeVisible()

    // expect: Documentation link in header visible
    await expect(page.getByRole('link', { name: /Documentation/i }).first()).toBeVisible()

    // expect: empty state 'Nothing published yet' OR published listings exist
    // (empty state only renders when account has zero listings)
    const emptyState = page.getByText('Nothing published yet')
    const listings = page.locator('a[href^="/integrations/publish/"]').first()
    await expect(emptyState.or(listings)).toBeVisible({ timeout: 10_000 })
  })

  test('Clicking New opens type selection dialog', async ({ page }) => {
    // Navigate to /integrations/publish
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)

    // Click 'New' button
    await page.getByRole('button', { name: 'New' }).click()

    // expect: dialog 'What kind of thing are you publishing?' appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('What kind of thing are you publishing?')).toBeVisible()

    // expect: three options: Connection, Workflow, Plugin
    await expect(page.getByRole('button', { name: /Connection/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Workflow/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Plugin/ })).toBeVisible()
  })

  test('Selecting Connection opens Connection form', async ({ page }) => {
    // Navigate to /integrations/publish and open dialog
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Connection in dialog
    await page.getByRole('button', { name: /Connection/ }).click()

    // expect: Manifest URL field shown
    await expect(page.locator('input[name="manifest-url"]')).toBeVisible()

    // expect: Publish button disabled, Back button present
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible()
  })

  test('Selecting Workflow opens Workflow form', async ({ page }) => {
    // Navigate to /integrations/publish and open dialog
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Workflow in dialog
    await page.getByRole('button', { name: /^Workflow/ }).click()

    // expect: Workflow combobox, Name, Slug, Description, Tags fields visible
    await expect(page.locator('select[name="wf-workflow-id"]')).toBeVisible()
    await expect(page.locator('input[name="wf-name"]')).toBeVisible()
    await expect(page.getByText('Slug')).toBeVisible()
    await expect(page.locator('textarea[name="wf-description"]')).toBeVisible()
    await expect(page.locator('input[name="wf-tags"]')).toBeVisible()

    // expect: Publish button disabled
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
  })

  test('Selecting Plugin opens Plugin form', async ({ page }) => {
    // Navigate to /integrations/publish and open dialog
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Plugin in dialog
    await page.getByRole('button', { name: /Plugin/ }).click()

    // expect: Name, Description, Tags, Bundle items section visible
    await expect(page.locator('input[name="pl-name"]')).toBeVisible()
    await expect(page.locator('textarea[name="pl-description"]')).toBeVisible()
    await expect(page.locator('input[name="pl-tags"]')).toBeVisible()
    await expect(page.getByText('Bundle items')).toBeVisible()
  })

  test('Connection Publish stays disabled with empty Manifest URL', async ({ page }) => {
    // Open Connection form
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /Connection/ }).click()

    // Leave Manifest URL empty, expect: Publish button remains disabled
    await expect(page.locator('input[name="manifest-url"]')).toBeVisible()
    await expect(page.locator('input[name="manifest-url"]')).toHaveValue('')
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
  })

  test('Connection Publish enables when Manifest URL is filled', async ({ page }) => {
    // Open Connection form
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /Connection/ }).click()

    // Type URL in Manifest URL field
    await page.locator('input[name="manifest-url"]').fill('https://example.com/polymux.json')

    // expect: Publish button becomes enabled
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeEnabled()
  })

  test('Closing dialog returns to listing', async ({ page }) => {
    // Navigate to /integrations/publish
    await page.goto('/integrations/publish')
    await ensureSignedIn(page)

    // Click New, then click Close (X)
    await page.getByRole('button', { name: 'New' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    // expect: dialog closes, publish listing visible
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.locator('input[name="publisher-search"]')).toBeVisible()
  })

  // =========================================================================
  // PUBLISH NEW STANDALONE PAGE TESTS
  // =========================================================================

  test('/integrations/publish/new shows all four type options', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // expect: heading 'What kind of thing are you publishing?'
    await expect(page.getByRole('heading', { name: 'What kind of thing are you publishing?' })).toBeVisible()

    // expect: four options: Connection, Workflow, Plugin, Layout
    await expect(page.getByRole('button', { name: /Connection/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Workflow/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Plugin/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Layout/ })).toBeVisible()

    // expect: Back link points to /integrations/publish
    const backLink = page.getByRole('link', { name: /Back/i })
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/integrations/publish')
  })

  test('Back link returns to publish listing', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // Click Back
    await page.getByRole('link', { name: /Back/i }).click()

    // expect: navigated to /integrations/publish
    await expect(page).toHaveURL(/\/integrations\/publish$/)
  })

  test('Clicking Connection navigates to connection form page', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // Click Connection
    await page.getByRole('button', { name: /Connection/ }).click()

    // expect: navigated to /integrations/publish/new/integration
    await expect(page).toHaveURL(/\/integrations\/publish\/new\/integration/)

    // expect: Manifest URL field shown
    await expect(page.locator('input[name="manifest-url"]')).toBeVisible()
  })

  test('Clicking Workflow navigates to workflow form page', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // Click Workflow
    await page.getByRole('button', { name: /Workflow/ }).click()

    // expect: navigated to /integrations/publish/new/workflow
    await expect(page).toHaveURL(/\/integrations\/publish\/new\/workflow/)

    // expect: Workflow, Name, Slug, Description fields visible
    await expect(page.locator('select[name="workflow-id"]')).toBeVisible()
    await expect(page.locator('input[name="workflow-name"]')).toBeVisible()
    await expect(page.getByText('Slug')).toBeVisible()
    await expect(page.locator('textarea[name="workflow-description"]')).toBeVisible()
  })

  test('Clicking Plugin navigates to plugin form page', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // Click Plugin
    await page.getByRole('button', { name: /Plugin/ }).click()

    // expect: navigated to /integrations/publish/new/plugin
    await expect(page).toHaveURL(/\/integrations\/publish\/new\/plugin/)

    // expect: Name, Slug, Description, Bundle items visible
    await expect(page.locator('input[name="plugin-name"]')).toBeVisible()
    await expect(page.getByText('Slug')).toBeVisible()
    await expect(page.locator('textarea[name="plugin-description"]')).toBeVisible()
    await expect(page.getByText('Bundle items')).toBeVisible()
  })

  test('Clicking Layout navigates to layout form page', async ({ page }) => {
    // Navigate to /integrations/publish/new
    await page.goto('/integrations/publish/new')
    await ensureSignedIn(page)

    // Click Layout
    await page.getByRole('button', { name: /Layout/ }).click()

    // expect: navigated to /integrations/publish/new/layout
    await expect(page).toHaveURL(/\/integrations\/publish\/new\/layout/)

    // expect: Name, Slug, Section combobox, Body HTML editor visible
    await expect(page.locator('input[name="layout-name"]')).toBeVisible()
    await expect(page.getByText('Slug')).toBeVisible()
    await expect(page.locator('select[name="layout-section"]')).toBeVisible()
    await expect(page.locator('textarea[name="layout-body"]')).toBeVisible()
  })

  test('Layout Section dropdown has all expected options', async ({ page }) => {
    // Navigate to /integrations/publish/new/layout
    await page.goto('/integrations/publish/new/layout')
    await ensureSignedIn(page)

    // expect: four options: Integrations, Storage, Vault, Dashboard
    const section = page.locator('select[name="layout-section"]')
    await expect(section).toBeVisible()
    await expect(section.locator('option[value="integrations"]')).toBeAttached()
    await expect(section.locator('option[value="storage"]')).toBeAttached()
    await expect(section.locator('option[value="vault"]')).toBeAttached()
    await expect(section.locator('option[value="dashboard"]')).toBeAttached()
  })

  test('Layout Publish button disabled with empty Name', async ({ page }) => {
    // Navigate to /integrations/publish/new/layout
    await page.goto('/integrations/publish/new/layout')
    await ensureSignedIn(page)

    // Leave Name field empty, expect: Publish button disabled
    await expect(page.locator('input[name="layout-name"]')).toBeVisible()
    await page.locator('input[name="layout-name"]').clear()
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
  })

  test('Workflow Publish form requires workflow selection', async ({ page }) => {
    // Navigate to /integrations/publish/new/workflow
    await page.goto('/integrations/publish/new/workflow')
    await ensureSignedIn(page)

    // Fill Name only, expect: Publish button remains disabled (no workflow selected)
    await page.locator('input[name="workflow-name"]').fill('My Test Workflow')

    // expect: Publish button remains disabled (no workflow selected)
    await expect(page.getByRole('button', { name: /^Publish$/ })).toBeDisabled()
  })
})
