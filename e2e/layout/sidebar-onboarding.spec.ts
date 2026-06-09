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
    // Navigate to /integrations/installed
    await page.goto('/integrations/installed')

    // expect: left sidebar visible
    await expect(page.getByRole('complementary', { name: 'Main sidebar' })).toBeVisible()

    const sidebar = page.getByRole('complementary', { name: 'Main sidebar' })

    // expect: navigation items include links to /integrations/installed, /storage/files, /vault/accounts
    await expect(sidebar.getByRole('link', { name: 'Integrations' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Storage' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Vault' })).toBeVisible()

    await expect(sidebar.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '/integrations/installed')
    await expect(sidebar.getByRole('link', { name: 'Storage' })).toHaveAttribute('href', '/storage/files')
    await expect(sidebar.getByRole('link', { name: 'Vault' })).toHaveAttribute('href', '/vault/accounts')

    // expect: user profile button at bottom of sidebar
    await expect(sidebar.getByRole('button', { name: /User profile/i })).toBeVisible()
  })

  test('Toggle sidebar button collapses and expands', async ({ page }) => {
    await page.goto('/integrations/installed')

    // Dismiss modal if shown so it doesn't block interactions
    await dismissOnboardingModalIfOpen(page)

    const sidePanelSlot = page.locator('.side-panel-slot')

    // expect: sidebar visible in expanded state
    await expect(sidePanelSlot).not.toHaveClass(/is-collapsed/)

    // Click Toggle sidebar button → collapses/compact state
    await page.locator('button[aria-label="Toggle sidebar"]').click()
    await expect(sidePanelSlot).toHaveClass(/is-collapsed/)

    // Click toggle again → re-expands
    await page.locator('button[aria-label="Toggle sidebar"]').click()
    await expect(sidePanelSlot).not.toHaveClass(/is-collapsed/)
  })

  test('Notifications button opens notifications panel', async ({ page }) => {
    await page.goto('/integrations/installed')

    // Dismiss modal if shown
    await dismissOnboardingModalIfOpen(page)

    // Click Notifications button (in page header)
    await page.locator('button[aria-label="Notifications"]').click()

    // expect: notifications panel/drawer opens
    await expect(page.getByText('Notifications').first()).toBeVisible()
  })

  test('New Workflow button creates a new workflow', async ({ page }) => {
    await page.goto('/integrations/installed')

    // Dismiss modal if shown
    await dismissOnboardingModalIfOpen(page)

    // Click 'New Workflow' button in sidebar
    await page.locator('aside[aria-label="Main sidebar"] button:has-text("New Workflow")').click()

    // expect: navigated to workflow editor page
    await expect(page).toHaveURL(/\/workflow\//)
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
    await page.goto('/integrations/installed')

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
    await page.goto('/integrations/installed')

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
    await page.goto('/integrations/installed')

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
    await page.goto('/integrations/installed')

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
    await page.goto('/integrations/installed')

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
