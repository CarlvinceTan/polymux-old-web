import { test, expect } from '@playwright/test'

// spec: confirms the in-app Stripe Payment Element actually renders on /checkout
// once STRIPE_PUBLISHABLE_KEY is configured (runs in the `authed` project).
//
// Skips gracefully when the key is absent (the form shows a "not configured"
// notice instead), so it never red-fails an env that hasn't set the key.

const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2'

test.describe('Checkout payment element (authed)', () => {
  test('Stripe Payment Element mounts when configured', async ({ page }) => {
    await page.goto(`/checkout?plan=max&period=annual&workspaceId=${WS}`)

    // Wait for hydration (price fills in after onMounted).
    await expect(page.getByTestId('checkout-price')).toHaveText(/\$\d/, { timeout: 15_000 })

    // No publishable key → graceful notice, nothing to assert.
    const notConfigured = page.getByText(/Payments aren't configured/i)
    if (await notConfigured.isVisible().catch(() => false)) {
      test.skip(true, 'STRIPE_PUBLISHABLE_KEY not set in this environment')
    }

    // Stripe mounts the Payment Element's card input in an iframe whose src is
    // the elements-inner-payment document (the currency-selector iframe shares
    // the same title, so disambiguate by src).
    const cardFrame = page.locator('iframe[src*="elements-inner-payment"]').first()
    await expect(cardFrame).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('button', { name: /Subscribe/ })).toBeVisible()

    await page.screenshot({ path: '../.playwright-cli/screenshots/web/checkout-payment-live.png' })
  })
})
