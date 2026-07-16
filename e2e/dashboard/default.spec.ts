// spec: Dashboard default route
// seed: e2e/auth.setup.ts

import { expect, test } from '@playwright/test'

test.describe('Dashboard default route', () => {
  test('/dashboard redirects to the Flow draft home', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/workflow\/new/)
  })

  test('Flow draft home exposes the sidebar without a Console row', async ({ page }) => {
    await page.goto('/workflow/new')

    const sidebar = page.getByRole('complementary', { name: 'Main sidebar' })
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByRole('button', { name: /new workflow|new flow/i })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: /^console$/i })).toHaveCount(0)
  })

  test('Unauthenticated access redirects to /sign-in', async ({ browser }) => {
    const freshContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const freshPage = await freshContext.newPage()

    await freshPage.goto('http://localhost:3000/dashboard')
    await expect(freshPage).toHaveURL(/\/sign-in/)

    await freshContext.close()
  })

  test('Unauthenticated access to /workflow redirects to /sign-in', async ({ browser }) => {
    const freshContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const freshPage = await freshContext.newPage()

    await freshPage.goto('http://localhost:3000/workflow')
    await expect(freshPage).toHaveURL(/\/sign-in/)

    await freshContext.close()
  })
})
