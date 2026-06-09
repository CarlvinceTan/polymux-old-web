// spec: body (inline test plan)
// seed: e2e/home.public.spec.ts

import { test, expect } from '@playwright/test'

/**
 * Public smoke checks for legal pages and the unsubscribed flow.
 * No auth needed — runs in the `public` project.
 */

test.describe('Legal Pages, API Reference, Unsubscribed', () => {
  // ---------------------------------------------------------------------------
  // API REFERENCE
  // ---------------------------------------------------------------------------

  test('API Reference - page renders content', async ({ page }) => {
    // Navigate to API Reference
    await page.goto('/api-reference')

    // expect: page title is 'API Reference'
    await expect(page).toHaveTitle(/API Reference/)

    // expect: heading visible
    await expect(page.getByRole('heading', { name: 'API reference', level: 1 })).toBeVisible()

    // expect: subtitle visible
    await expect(page.getByText('HTTP endpoints, auth, and integration details for developers.')).toBeVisible()

    // expect: content body rendered (article element)
    await expect(page.locator('article.legal-doc-body')).toBeVisible()
  })

  test('API Reference - meta description set correctly', async ({ page }) => {
    // Navigate to API Reference
    await page.goto('/api-reference')

    // expect: meta description contains 'Polymux' and 'API'
    const metaDescription = page.locator('meta[name="description"]')
    await expect(metaDescription).toHaveAttribute('content', /Polymux/)
    await expect(metaDescription).toHaveAttribute('content', /API/)
  })

  // ---------------------------------------------------------------------------
  // PRIVACY POLICY
  // ---------------------------------------------------------------------------

  test('Privacy Policy - page renders content', async ({ page }) => {
    // Navigate to Privacy Policy
    await page.goto('/privacy-policy')

    // expect: page title is 'Privacy Policy'
    await expect(page).toHaveTitle(/Privacy Policy/)

    // expect: heading visible
    await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible()

    // expect: subtitle visible
    await expect(page.getByText('How we collect, use, and protect your information when you use Polymux.')).toBeVisible()

    // expect: doc body rendered
    await expect(page.locator('article.legal-doc-body')).toBeVisible()
  })

  test('Privacy Policy - meta description mentions privacy or personal information', async ({ page }) => {
    // Navigate to Privacy Policy
    await page.goto('/privacy-policy')

    // expect: meta description mentions privacy or personal information
    const metaDescription = page.locator('meta[name="description"]')
    await expect(metaDescription).toHaveAttribute('content', /personal information/i)
  })

  // ---------------------------------------------------------------------------
  // TERMS OF SERVICE
  // ---------------------------------------------------------------------------

  test('Terms of Service - page renders content', async ({ page }) => {
    // Navigate to Terms of Service
    await page.goto('/terms-of-service')

    // expect: heading visible
    await expect(page.getByRole('heading', { name: 'Terms of service', level: 1 })).toBeVisible()

    // expect: subtitle visible
    await expect(page.getByText('Rules and conditions for using Polymux products and services.')).toBeVisible()

    // expect: content rendered
    await expect(page.locator('article.legal-doc-body')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // COOKIE POLICY
  // ---------------------------------------------------------------------------

  test('Cookie Policy - page renders content', async ({ page }) => {
    // Navigate to Cookie Policy
    await page.goto('/cookie-policy')

    // expect: heading visible
    await expect(page.getByRole('heading', { name: 'Cookie policy', level: 1 })).toBeVisible()

    // expect: content rendered
    await expect(page.locator('article.legal-doc-body')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // UNSUBSCRIBED PAGE
  // ---------------------------------------------------------------------------

  test('Unsubscribed - without token shows invalid state', async ({ page }) => {
    // Navigate to /unsubscribed (no params)
    await page.goto('/unsubscribed')

    // expect: amber warning icon shown (exclamation-triangle)
    await expect(page.locator('[class*="text-amber"]')).toBeVisible()

    // expect: 'Invalid link' heading visible
    await expect(page.getByRole('heading', { name: 'Link expired or invalid' })).toBeVisible()

    // expect: no success state — no resubscribe button
    await expect(page.getByRole('button', { name: /Re-subscribe/i })).not.toBeVisible()
  })

  test('Unsubscribed - with valid token shows success state', async ({ page }) => {
    // Mock POST to /api/mailing-list/unsubscribe to return success
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'test@example.com' }),
      }),
    )

    // Navigate with valid token
    await page.goto('/unsubscribed?token=valid-token-abc')

    // Wait for POST to /api/mailing-list/unsubscribe
    await expect(page.getByRole('heading', { name: "You've unsubscribed" })).toBeVisible()

    // expect: green check circle icon
    await expect(page.locator('[class*="text-green"]')).toBeVisible()

    // expect: email address shown
    await expect(page.getByText('test@example.com')).toBeVisible()

    // expect: Resubscribe button visible
    await expect(page.getByRole('button', { name: /Re-subscribe/i })).toBeVisible()

    // expect: Go to Home link visible
    await expect(page.getByRole('link', { name: /Back to home/i })).toBeVisible()
  })

  test('Unsubscribed - with invalid/expired token shows error state', async ({ page }) => {
    // Mock unsubscribe API to return 400
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 400, message: 'Invalid token' }),
      }),
    )

    // Navigate to /unsubscribed?token=invalid-token-value
    await page.goto('/unsubscribed?token=invalid-token-value')

    // expect: amber warning icon
    await expect(page.locator('[class*="text-amber"]')).toBeVisible()

    // expect: 'Invalid link' heading
    await expect(page.getByRole('heading', { name: 'Link expired or invalid' })).toBeVisible()
  })

  test('Unsubscribed - API server error shows generic error', async ({ page }) => {
    // Mock unsubscribe API to return 500
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Internal server error' }),
      }),
    )

    // Navigate while unsubscribe API returns 500
    await page.goto('/unsubscribed?token=some-token')

    // expect: red error icon
    await expect(page.locator('[class*="text-red"]')).toBeVisible()

    // expect: error heading visible
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  })

  test('Unsubscribed - Resubscribe button triggers resubscription and redirects to /blog#blog-newsletter', async ({ page }) => {
    // Mock unsubscribe API for success
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'test@example.com' }),
      }),
    )

    // Mock subscribe API for success
    await page.route('/api/mailing-list/subscribe*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }),
    )

    // Reach success state
    await page.goto('/unsubscribed?token=valid-token')
    await expect(page.getByRole('heading', { name: "You've unsubscribed" })).toBeVisible()

    // Click Resubscribe
    const resubBtn = page.getByRole('button', { name: /Re-subscribe/i })
    await resubBtn.click()

    // expect: navigated to /blog#blog-newsletter
    await expect(page).toHaveURL(/\/blog#blog-newsletter/)
  })

  test('Unsubscribed - Resubscribe API error shows inline error', async ({ page }) => {
    // Mock unsubscribe API for success
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'test@example.com' }),
      }),
    )

    // Mock subscribe API to fail
    await page.route('/api/mailing-list/subscribe*', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, data: { message: 'Subscription failed' } }),
      }),
    )

    // Reach success state
    await page.goto('/unsubscribed?token=valid-token')
    await expect(page.getByRole('heading', { name: "You've unsubscribed" })).toBeVisible()

    // Click Resubscribe while subscribe API fails
    await page.getByRole('button', { name: /Re-subscribe/i }).click()

    // expect: inline red error message
    await expect(page.locator('[role="alert"]')).toBeVisible()

    // expect: button re-enabled
    await expect(page.getByRole('button', { name: /Re-subscribe/i })).toBeEnabled()
  })

  test('Unsubscribed - Home link navigates to /', async ({ page }) => {
    // Mock unsubscribe API for success
    await page.route('/api/mailing-list/unsubscribe*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'test@example.com' }),
      }),
    )

    // Reach success state
    await page.goto('/unsubscribed?token=valid-token')
    await expect(page.getByRole('heading', { name: "You've unsubscribed" })).toBeVisible()

    // Click Home link
    await page.getByRole('link', { name: /Back to home/i }).click()

    // expect: navigated to /
    await expect(page).toHaveURL('/')
  })
})
