// spec: Dashboard — Console (/dashboard/console)
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

test.describe('Dashboard — Console', () => {
  // Authenticated tests reuse the stored session from auth.setup.ts.
  // The `authed` project in playwright.config.ts applies storageState globally.

  test('/dashboard redirects to /dashboard/console', async ({ page }) => {
    // Navigate to /dashboard and expect URL becomes /dashboard/console
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard\/console/)
  })

  test('Console page loads all three stat cards', async ({ page }) => {
    // Navigate to /dashboard/console
    await page.goto('/dashboard/console')

    // expect: heading 'Console' visible
    await expect(page.getByRole('heading', { name: 'Console', exact: true })).toBeVisible()

    // expect: three stat cards visible: 'Active Runs', 'Schedules', 'Runs/mo'
    const statActive = page.getByText('Active runs', { exact: true }).first()
    const statSchedules = page.getByText('Schedules', { exact: true }).first()
    const statRunsPerMonth = page.getByText('Runs / month', { exact: true })

    await expect(statActive).toBeVisible()
    await expect(statSchedules).toBeVisible()
    await expect(statRunsPerMonth).toBeVisible()

    // expect: each card displays a numeric value (font-mono text-2xl)
    const statValues = page.locator('.font-mono.text-2xl')
    await expect(statValues.first()).toBeVisible()
    const count = await statValues.count()
    expect(count).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent()
      expect(text?.trim()).toMatch(/^\d+$/)
    }
  })

  test('Active runs section shows empty state when no runs are live', async ({ page }) => {
    // Navigate to /dashboard/console
    await page.goto('/dashboard/console')

    // expect: 'Active Runs' section visible
    await expect(page.getByRole('heading', { name: 'Active runs', exact: true })).toBeVisible()

    // Check if active runs list or empty state is shown
    const activeRunsSection = page.locator('section').filter({ hasText: 'Active runs' })
    const activeRunsList = activeRunsSection.locator('ul')
    const activeRunsEmpty = activeRunsSection.getByText('Nothing running', { exact: true })

    const hasRuns = await activeRunsList.isVisible().catch(() => false)
    if (!hasRuns) {
      // If no active runs: dashed-border empty state with 'Nothing running' message shown
      await expect(activeRunsEmpty).toBeVisible()
    }
  })

  test('Schedules section shows empty state when no schedules exist', async ({ page }) => {
    // Navigate to /dashboard/console
    await page.goto('/dashboard/console')

    // Check if schedules list or empty state is shown
    const schedulesSection = page.locator('section').filter({ hasText: 'Schedules' }).first()
    const schedulesList = schedulesSection.locator('ul')
    const schedulesEmpty = schedulesSection.getByText('No active schedules', { exact: true })

    const hasSchedules = await schedulesList.isVisible().catch(() => false)
    if (!hasSchedules) {
      // If no schedules: dashed-border empty state with 'No active schedules' message shown
      await expect(schedulesEmpty).toBeVisible()
    }
  })

  test('Recent runs section renders', async ({ page }) => {
    // Navigate to /dashboard/console
    await page.goto('/dashboard/console')

    // expect: 'Recent Runs' section visible
    await expect(page.getByRole('heading', { name: 'Recent runs', exact: true })).toBeVisible()

    const recentRunsSection = page.locator('section').filter({ hasText: 'Recent runs' })
    await expect(recentRunsSection).toBeVisible()

    // expect: rows shown if runs exist, or empty state if none
    const runsList = recentRunsSection.locator('ul')

    const hasRuns = await runsList.isVisible().catch(() => false)
    if (hasRuns) {
      // If runs exist: each row shows title, status dot, and relative timestamp
      const firstRow = runsList.locator('li').first()
      await expect(firstRow).toBeVisible()
      // status dot: size-1.5 rounded-full
      await expect(firstRow.locator('.size-1\\.5.rounded-full')).toBeVisible()
      // title text
      await expect(firstRow.locator('p.truncate')).toBeVisible()
      // relative timestamp
      await expect(firstRow.locator('p').nth(1)).toBeVisible()
    }
    // If no runs, the section is still rendered (empty state acceptable)
  })

  test('View All button navigates to /workflow', async ({ page }) => {
    // Navigate to /dashboard/console
    await page.goto('/dashboard/console')

    // Click 'View All' button in Recent Runs section header
    const viewAllLink = page.getByRole('link', { name: /View all/i })
    await expect(viewAllLink).toBeVisible()
    await viewAllLink.click()

    // expect: navigated to /workflow or /workflow/new
    await expect(page).toHaveURL(/\/workflow/)
  })

  test('Unauthenticated access redirects to /sign-in', async ({ browser }) => {
    // In a fresh browser context (no auth), navigate to /dashboard
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()

    await freshPage.goto('http://localhost:3000/dashboard')

    // expect: redirected to /sign-in
    await expect(freshPage).toHaveURL(/\/sign-in/)

    await freshContext.close()
  })

  test('Unauthenticated access to /workflow redirects to /sign-in', async ({ browser }) => {
    // In a fresh browser context, navigate to /workflow
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()

    await freshPage.goto('http://localhost:3000/workflow')

    // expect: redirected to /sign-in
    await expect(freshPage).toHaveURL(/\/sign-in/)

    await freshContext.close()
  })
})
