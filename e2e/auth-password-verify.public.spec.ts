// spec: Forgot Password, Reset Password, Confirm, Verify Email Pages
// seed: e2e/home.public.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Forgot Password, Reset Password, Confirm, Verify Email Pages', () => {
  // ─── FORGOT PASSWORD ───────────────────────────────────────────────────────

  test('forgot password page renders correctly', async ({ page }) => {
    // Navigate to /forgot-password
    await page.goto('/forgot-password')

    // expect: heading for forgot password title is visible
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()

    // expect: email input with id 'forgot-email' is present
    await expect(page.locator('#forgot-email')).toBeVisible()

    // expect: 'Send reset link' button is present
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()

    // expect: 'Back to sign in' link pointing to /sign-in is present
    const backLink = page.getByRole('link', { name: 'Back to sign in' })
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/sign-in')
  })

  test('submitting valid email shows confirmation', async ({ page }) => {
    await page.goto('/forgot-password')

    // Enter email and click 'Send reset link'
    await page.locator('#forgot-email').fill('carlvince@live.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()

    // expect: status message with confirmation heading about checking email
    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Send reset link')
  })

  test('empty email shows error', async ({ page }) => {
    await page.goto('/forgot-password')

    // Leave email empty, click 'Send reset link'
    await page.getByRole('button', { name: 'Send reset link' }).click()

    // expect: error alert appears
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('back to sign in link navigates to /sign-in', async ({ page }) => {
    await page.goto('/forgot-password')

    // Click 'Back to sign in'
    await page.getByRole('link', { name: 'Back to sign in' }).click()

    // expect: navigated to /sign-in
    await expect(page).toHaveURL(/\/sign-in/)
  })

  // ─── RESET PASSWORD ────────────────────────────────────────────────────────

  test('reset password page renders the form', async ({ page }) => {
    // Navigate to /reset-password
    await page.goto('/reset-password')

    // expect: heading 'Reset your password' visible
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()

    // expect: 'New password' input with id 'reset-password' is present
    await expect(page.locator('#reset-password')).toBeVisible()

    // expect: 'Confirm new password' input with id 'reset-password-confirm' is present
    await expect(page.locator('#reset-password-confirm')).toBeVisible()

    // expect: 'Update password' submit button is present
    await expect(page.getByRole('button', { name: 'Update password' })).toBeVisible()

    // expect: 'Back to sign in' link pointing to /sign-in is present
    const backLink = page.getByRole('link', { name: 'Back to sign in' })
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/sign-in')
  })

  test('mismatched passwords show validation error', async ({ page }) => {
    await page.goto('/reset-password')

    // Enter password of ≥6 chars, different confirm password, click 'Update password'
    await page.locator('#reset-password').fill('password123')
    await page.locator('#reset-password-confirm').fill('different123')
    await page.getByRole('button', { name: 'Update password' }).click()

    // expect: error alert indicates passwords do not match
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Passwords do not match')
  })

  test('password shorter than 6 chars shows minimum length error', async ({ page }) => {
    await page.goto('/reset-password')

    // Enter matching 5-char passwords, click 'Update password'
    await page.locator('#reset-password').fill('abc12')
    await page.locator('#reset-password-confirm').fill('abc12')
    await page.getByRole('button', { name: 'Update password' }).click()

    // expect: error indicates minimum password length
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('at least 6 characters')
  })

  test('reset password back to sign in link navigates to /sign-in', async ({ page }) => {
    await page.goto('/reset-password')

    // Click 'Back to sign in'
    await page.getByRole('link', { name: 'Back to sign in' }).click()

    // expect: navigated to /sign-in
    await expect(page).toHaveURL(/\/sign-in/)
  })

  // ─── CONFIRM PAGE ──────────────────────────────────────────────────────────

  test('confirm page shows loading spinner on direct navigation', async ({ page }) => {
    // Navigate to /confirm
    await page.goto('/confirm')

    // expect: loading spinner or "Signing you in" text is visible
    await expect(page.getByText('Signing you in')).toBeVisible()
  })

  test('confirm without code or type redirects to home', async ({ page }) => {
    // Navigate to /confirm with no query params
    await page.goto('/confirm')

    // Wait for redirect
    await expect(page).toHaveURL('/')
  })

  test('confirm with type=signup redirects to /verification-successful', async ({ page }) => {
    // Navigate to /confirm?type=signup
    await page.goto('/confirm?type=signup')

    // expect: redirected to /verification-successful
    await expect(page).toHaveURL(/\/verification-successful/)
  })

  test('confirm with auth_redirect in sessionStorage redirects to that URL', async ({ page }) => {
    // Set sessionStorage key 'auth_redirect' to '/dashboard/console'
    await page.goto('/')
    await page.evaluate(() => sessionStorage.setItem('auth_redirect', '/dashboard/console'))

    // Navigate to /confirm
    await page.goto('/confirm')

    // expect: redirected to /dashboard/console
    await expect(page).toHaveURL(/\/dashboard\/console/)
  })

  // ─── VERIFY EMAIL ──────────────────────────────────────────────────────────

  test('verify-email without token shows missing token error', async ({ page }) => {
    // Navigate to /verify-email
    await page.goto('/verify-email')

    // expect: error state shown with error message about missing token
    await expect(page.getByText('Verification token is missing')).toBeVisible()

    // expect: 'Back to Blog' button visible linking to /blog
    const backToBlog = page.getByRole('link', { name: 'Back to blog' })
    await expect(backToBlog).toBeVisible()
    await expect(backToBlog).toHaveAttribute('href', '/blog')
  })

  test('verify-email with invalid token shows error state', async ({ page }) => {
    // Navigate to /verify-email?token=INVALID_TOKEN
    await page.goto('/verify-email?token=INVALID_TOKEN')

    // expect: error icon and error message displayed
    await expect(page.getByRole('heading', { name: 'Verification failed' })).toBeVisible()

    // expect: 'Back to Blog' button present
    await expect(page.getByRole('link', { name: 'Back to blog' })).toBeVisible()
  })

  test('back to blog button navigates to /blog', async ({ page }) => {
    // From error state on /verify-email
    await page.goto('/verify-email')
    await expect(page.getByText('Verification token is missing')).toBeVisible()

    // Click 'Back to Blog'
    await page.getByRole('link', { name: 'Back to blog' }).click()

    // expect: navigated to /blog
    await expect(page).toHaveURL(/\/blog/)
  })
})
