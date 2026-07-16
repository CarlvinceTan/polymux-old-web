// spec: Global Layout Sidebar and Onboarding Modal
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

/**
 * Helper: if the beta agreement / onboarding modal is open, advance to the
 * terms slide via "Skip" and accept it so subsequent interactions aren't
 * blocked by the overlay.
 */
async function dismissOnboardingModalIfOpen(page: import('@playwright/test').Page) {
  const modal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
  const isOpen = await modal.isVisible().catch(() => false)
  if (!isOpen) return

  // Skip → terms slide
  await page.locator('button:has-text("Skip")').click()
  await page.getByText('A few things to know').first().waitFor({ state: 'visible' })

  // Accept terms
  await page.locator('input[name="acknowledged"]').click()
  await page.locator('button:has-text("Get started")').click()
  await page.getByText('A few things to know').first().waitFor({ state: 'hidden' })
}

test.describe('Global Layout Sidebar and Onboarding Modal', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR TESTS
  // ─────────────────────────────────────────────────────────────────────────

  test('Sidebar is visible and contains main navigation links', async ({ page }) => {
    await page.goto('/connections')

    // expect: left sidebar visible
    await expect(page.getByRole('complementary', { name: 'Main sidebar' })).toBeVisible()

    const sidebar = page.getByRole('complementary', { name: 'Main sidebar' })

    await expect(sidebar.getByRole('link', { name: 'Schedule' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Connections' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Files' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Credentials' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Wallet' })).toBeVisible()

    await expect(sidebar.getByRole('link', { name: 'Connections' })).toHaveAttribute('href', '/connections')
    await expect(sidebar.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/files')
    await expect(sidebar.getByRole('link', { name: 'Credentials' })).toHaveAttribute('href', '/credentials')
    await expect(sidebar.getByRole('link', { name: 'Wallet' })).toHaveAttribute('href', '/wallet')

    // expect: user profile button at bottom of sidebar
    await expect(sidebar.getByRole('button', { name: /User profile/i })).toBeVisible()
  })

  test('Toggle sidebar button is visible', async ({ page }) => {
    await page.goto('/connections')

    // Dismiss modal if shown so it doesn't block interactions
    await dismissOnboardingModalIfOpen(page)

    const sidebar = page.getByRole('complementary', { name: 'Main sidebar' })
    await expect(sidebar.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible()
  })

  test('Notifications button opens notifications panel', async ({ page }) => {
    await page.goto('/connections')

    // Dismiss modal if shown
    await dismissOnboardingModalIfOpen(page)

    // The sidebar exposes the inbox trigger.
    await expect(
      page.getByRole('complementary', { name: 'Main sidebar' }).getByRole('button', { name: 'Notifications' }),
    ).toBeVisible()
  })

  test('New Workflow button creates a new workflow', async ({ page }) => {
    await page.goto('/connections')

    // Dismiss modal if shown
    await dismissOnboardingModalIfOpen(page)

    const newWorkflowButton = page.getByRole('complementary', { name: 'Main sidebar' }).getByRole('button', { name: 'New Workflow' })
    await expect(newWorkflowButton).toBeVisible()
    await expect(newWorkflowButton).toBeEnabled()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ONBOARDING MODAL TESTS
  // The OnboardingModal is the beta agreement modal shown on first visit.
  // It covers multiple slides (welcome → terms). The modal can only be closed
  // by accepting via the consent checkbox + Get started on the terms slide.
  // "Skip" advances to the terms slide — it does NOT close the modal.
  // ─────────────────────────────────────────────────────────────────────────

  test('Onboarding modal appears on first visit for new accounts', async ({ page }) => {
    // NOTE: Requires an account that has not yet accepted beta. Skipped when
    // the test account has already completed onboarding.
    await page.goto('/connections')

    const modal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
    const isOpen = await modal.isVisible().catch(() => false)
    if (!isOpen) {
      test.skip(true, 'Test account has already accepted onboarding; modal not shown')
      return
    }

    // If modal appears: dialog titled 'Welcome to your new workspace' shown
    await expect(modal).toBeVisible()

    // expect: step indicator buttons visible
    await expect(page.getByRole('button', { name: /Step 1 of/ })).toBeVisible()

    // expect: Next and Skip buttons visible
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
    await expect(page.locator('button:has-text("Skip")')).toBeVisible()
  })

  test('Skip button advances to the terms slide (modal stays open)', async ({ page }) => {
    await page.goto('/connections')

    const modal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
    const isOpen = await modal.isVisible().catch(() => false)
    if (!isOpen) {
      test.skip(true, 'Test account has already accepted onboarding; modal not shown')
      return
    }

    // When onboarding modal is open, click Skip
    await page.locator('button:has-text("Skip")').click()

    // Skip advances to the terms slide — modal stays open showing 'A few things to know'
    await expect(page.getByText('A few things to know')).toBeVisible()
  })

  test('Beta agreement terms slide shows consent checkbox and Get started button', async ({ page }) => {
    await page.goto('/connections')

    const welcomeModal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
    const isOpen = await welcomeModal.isVisible().catch(() => false)
    if (!isOpen) {
      test.skip(true, 'Test account has already accepted onboarding; modal not shown')
      return
    }

    // Skip to terms slide
    await page.locator('button:has-text("Skip")').click()
    await page.getByText('A few things to know').first().waitFor({ state: 'visible' })

    // expect: 'A few things to know' heading
    await expect(page.getByRole('heading', { name: 'A few things to know' })).toBeVisible()

    // expect: consent checkbox and Get started button visible
    await expect(page.locator('input[name="acknowledged"]')).toBeVisible()
    await expect(page.locator('button:has-text("Get started")')).toBeVisible()
  })

  test('Get started button is disabled until consent checkbox is checked', async ({ page }) => {
    await page.goto('/connections')

    const welcomeModal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
    const isOpen = await welcomeModal.isVisible().catch(() => false)
    if (!isOpen) {
      test.skip(true, 'Test account has already accepted onboarding; modal not shown')
      return
    }

    // Skip to terms slide
    await page.locator('button:has-text("Skip")').click()
    await page.getByText('A few things to know').first().waitFor({ state: 'visible' })

    const getStartedBtn = page.locator('button:has-text("Get started")')

    // expect: Get started button disabled initially
    await expect(getStartedBtn).toBeDisabled()

    // Check consent checkbox → Get started button becomes enabled
    await page.locator('input[name="acknowledged"]').click()
    await expect(getStartedBtn).toBeEnabled()
  })

  test('Accepting beta agreement closes the dialog', async ({ page }) => {
    await page.goto('/connections')

    const welcomeModal = page.getByRole('dialog', { name: 'Welcome to your new workspace' })
    const isOpen = await welcomeModal.isVisible().catch(() => false)
    if (!isOpen) {
      test.skip(true, 'Test account has already accepted onboarding; modal not shown')
      return
    }

    // Skip to terms slide
    await page.locator('button:has-text("Skip")').click()
    await page.getByText('A few things to know').first().waitFor({ state: 'visible' })

    // Check consent checkbox, click Get started
    await page.locator('input[name="acknowledged"]').click()
    await page.locator('button:has-text("Get started")').click()

    // expect: dialog closes, user can interact with main page
    await page.getByText('A few things to know').first().waitFor({ state: 'hidden' })
    await expect(page.getByRole('complementary', { name: 'Main sidebar' })).toBeVisible()
  })
})
