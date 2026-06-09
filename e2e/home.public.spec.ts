import { test, expect } from '@playwright/test'

/**
 * Public smoke checks — no auth. Runs in the `public` project.
 * Keep these resilient: assert the page renders, not exact marketing copy.
 */

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
  await expect(page.locator('body')).toBeVisible()
})

test('sign-in page renders the email/password form', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.locator('#signin-email')).toBeVisible()
  await expect(page.locator('#signin-password')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('pricing page loads', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page).toHaveTitle(/.+/)
})
