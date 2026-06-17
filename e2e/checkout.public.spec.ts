import { test, expect } from '@playwright/test'

// spec: e2e coverage for the in-app /checkout page (replaces the redirect to
// checkout.stripe.com). Runs in the `public` project (no stored session).
//
// /checkout is a public route, but the payment session needs a signed-in
// workspace owner — its onMounted guard bounces an unauthenticated visitor to
// /sign-in, preserving the intended destination as ?redirect=.

const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2'

test.describe('Checkout (public)', () => {
  test('unauthenticated visit redirects to sign-in', async ({ page }) => {
    // Visit checkout with valid params but no session.
    await page.goto(`/checkout?plan=max&period=annual&workspaceId=${WS}`)

    // Bounced to /sign-in, carrying the original path as ?redirect=.
    await expect(page).toHaveURL(/\/sign-in\?redirect=/, { timeout: 15_000 })
    await expect(page).toHaveURL(/redirect=.*checkout/, { timeout: 15_000 })
  })
})
