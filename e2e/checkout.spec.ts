import { test, expect } from '@playwright/test'

// spec: authenticated /checkout coverage (runs in the `authed` project, reusing
// the stored session for the test workspace owner).
//
// Asserts the order-summary half renders the right plan/price/features and
// controls, and that the page's param guard bounces non-paid / invalid plans
// back to /pricing. We assert the SUMMARY (not the Stripe Payment Element):
// the element only renders when STRIPE_PUBLISHABLE_KEY is configured, whereas
// the summary is independent of Stripe, so these stay green either way.

const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2' // test user's free workspace

test.describe('Checkout (authed)', () => {
  test('renders the order summary for the Max plan', async ({ page }) => {
    // Open checkout for the Max annual plan against the owned workspace.
    await page.goto(`/checkout?plan=max&period=annual&workspaceId=${WS}`)

    // Plan heading + per-month price.
    await expect(page.getByRole('heading', { name: 'Max plan' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('checkout-price')).toHaveText(/\$\d/, { timeout: 15_000 })

    // At least one included-feature line and the cadence note.
    await expect(page.getByText(/browser agents/).first()).toBeVisible()
    await expect(page.getByText(/billed annually/i)).toBeVisible()

    // Back-to-plans control and the Stripe trust line.
    await expect(page.getByRole('button', { name: 'Back to plans' })).toBeVisible()
    await expect(page.getByText('Secured by Stripe')).toBeVisible()
  })

  test('back-to-plans returns to pricing', async ({ page }) => {
    await page.goto(`/checkout?plan=max&period=annual&workspaceId=${WS}`)
    // Gate on the price filling in: it only populates after onMounted runs, so
    // this proves the page has hydrated and the @click handler is attached
    // (clicking the type="button" before hydration is a no-op native click).
    await expect(page.getByTestId('checkout-price')).toHaveText(/\$\d/, { timeout: 15_000 })

    // Clicking the back arrow navigates to /pricing.
    await page.getByRole('button', { name: 'Back to plans' }).click()
    await expect(page).toHaveURL(/\/pricing/, { timeout: 15_000 })
  })

  test('a non-paid plan param is bounced to pricing', async ({ page }) => {
    // `free` is not a purchasable plan → the guard redirects to /pricing.
    await page.goto(`/checkout?plan=free&period=annual&workspaceId=${WS}`)
    await expect(page).toHaveURL(/\/pricing/, { timeout: 15_000 })
  })

  test('a missing workspaceId is bounced to pricing', async ({ page }) => {
    await page.goto('/checkout?plan=max&period=annual')
    await expect(page).toHaveURL(/\/pricing/, { timeout: 15_000 })
  })
})
