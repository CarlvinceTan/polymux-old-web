// spec: Sign-In and Sign-Up Pages
// seed: e2e/seed.public.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Sign-In and Sign-Up Pages', () => {
  // ─── SIGN-IN TESTS ─────────────────────────────────────────────────────────

  test('sign-in page renders all expected elements', async ({ page }) => {
    // Navigate to http://localhost:3000/sign-in
    await page.goto('/sign-in')

    // expect: heading 'Welcome back' is visible
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

    // expect: 'Continue with Google' button is present
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    // expect: email input field with id 'signin-email' is present
    await expect(page.locator('#signin-email')).toBeVisible()

    // expect: password input field with id 'signin-password' is present
    await expect(page.locator('#signin-password')).toBeVisible()

    // expect: 'Forgot password?' link pointing to /forgot-password is present
    const forgotLink = page.getByRole('link', { name: 'Forgot password?' })
    await expect(forgotLink).toBeVisible()
    await expect(forgotLink).toHaveAttribute('href', '/forgot-password')

    // expect: 'Sign in' submit button is present
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // expect: 'Sign up' link pointing to /sign-up is present
    const signUpLink = page.getByRole('link', { name: 'Sign up' })
    await expect(signUpLink).toBeVisible()
    await expect(signUpLink).toHaveAttribute('href', '/sign-up')
  })

  test('successful sign-in with valid credentials redirects', async ({ page }) => {
    // Navigate to http://localhost:3000/sign-in
    await page.goto('/sign-in')

    // Enter carlvince@live.com in email, testing in password, click Sign In
    await page.locator('#signin-email').fill('carlvince@live.com')
    await page.locator('#signin-password').fill('testing')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // expect: redirected away from /sign-in
    await expect(page).not.toHaveURL(/\/sign-in/)

    // expect: URL is an authenticated page (not /sign-up or /forgot-password)
    await expect(page).not.toHaveURL(/\/sign-up/)
  })

  test('sign-in with incorrect credentials shows error', async ({ page }) => {
    // Navigate to http://localhost:3000/sign-in
    await page.goto('/sign-in')

    // Enter notauser@example.com and wrongpassword
    await page.locator('#signin-email').fill('notauser@example.com')
    await page.locator('#signin-password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // expect: error alert with role='alert' is displayed
    await expect(page.getByRole('alert')).toBeVisible()

    // expect: user remains on /sign-in
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('sign-in with empty fields shows validation', async ({ page }) => {
    // Navigate to http://localhost:3000/sign-in
    await page.goto('/sign-in')

    // Click submit without filling fields
    await page.getByRole('button', { name: 'Sign in' }).click()

    // expect: error message is displayed
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('redirect parameter is honoured after sign-in', async ({ page }) => {
    // Navigate to /sign-in?redirect=%2Fworkflow%2Fnew
    await page.goto('/sign-in?redirect=%2Fworkflow%2Fnew')

    // Sign in with valid credentials
    await page.locator('#signin-email').fill('carlvince@live.com')
    await page.locator('#signin-password').fill('testing')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // expect: redirected to /workflow/new
    await expect(page).toHaveURL(/\/workflow\/new/)
  })

  test('back button navigates to previous page', async ({ page }) => {
    // Navigate to / then to /sign-in
    await page.goto('/')
    await page.goto('/sign-in')

    // Click the back arrow button
    await page.getByRole('button', { name: 'Back' }).click()

    // expect: navigated to / or previous non-auth page
    await expect(page).toHaveURL('/')
  })

  test('logo link navigates to home', async ({ page }) => {
    // Navigate to /sign-in
    await page.goto('/sign-in')

    // Click the Polymux logo
    await page.getByRole('link', { name: 'Polymux home' }).click()

    // expect: navigated to /
    await expect(page).toHaveURL('/')
  })

  test('Continue with Google button initiates OAuth flow', async ({ page }) => {
    // Navigate to /sign-in
    await page.goto('/sign-in')

    // Click 'Continue with Google'
    await page.getByRole('button', { name: 'Continue with Google' }).click()

    // expect: redirected to a Google OAuth URL or Supabase OAuth redirect
    await expect(page).toHaveURL(/accounts\.google\.com|supabase\.co\/auth/)
  })

  // ─── SIGN-UP TESTS ─────────────────────────────────────────────────────────

  test('sign-up page renders all expected elements', async ({ page }) => {
    // Navigate to http://localhost:3000/sign-up
    await page.goto('/sign-up')

    // expect: heading 'Create your account' is visible
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

    // expect: 'Continue with Google' button is present
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    // expect: email input with id 'signup-email' is present
    await expect(page.locator('#signup-email')).toBeVisible()

    // expect: password input with id 'signup-password' is present
    await expect(page.locator('#signup-password')).toBeVisible()

    // expect: confirm password input with id 'signup-password-confirm' is present
    await expect(page.locator('#signup-password-confirm')).toBeVisible()

    // expect: 'Create account' submit button is present
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()

    // expect: 'Sign in' link pointing to /sign-in is present
    const signInLink = page.getByRole('link', { name: 'Sign in' })
    await expect(signInLink).toBeVisible()
    await expect(signInLink).toHaveAttribute('href', '/sign-in')
  })

  test('mismatched passwords show validation error', async ({ page }) => {
    // Navigate to /sign-up
    await page.goto('/sign-up')

    // Enter email, password, and different confirm password
    await page.locator('#signup-email').fill('newuser@example.com')
    await page.locator('#signup-password').fill('password123')
    await page.locator('#signup-password-confirm').fill('different456')

    // Click 'Create account'
    await page.getByRole('button', { name: 'Create account' }).click()

    // expect: error alert indicates passwords do not match
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(/passwords do not match/i)

    // expect: no API call, user remains on /sign-up
    await expect(page).toHaveURL(/\/sign-up/)
  })

  test('password shorter than 6 characters shows minimum length error', async ({ page }) => {
    // Navigate to /sign-up
    await page.goto('/sign-up')

    // Enter matching 5-character passwords
    await page.locator('#signup-email').fill('newuser@example.com')
    await page.locator('#signup-password').fill('abc12')
    await page.locator('#signup-password-confirm').fill('abc12')

    // Click 'Create account'
    await page.getByRole('button', { name: 'Create account' }).click()

    // expect: error indicates minimum password length
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(/6 characters/i)
  })

  test('registering with already-used email shows API error', async ({ page }) => {
    // Navigate to /sign-up
    await page.goto('/sign-up')

    // Fill fields with existing email carlvince@live.com and valid passwords
    await page.locator('#signup-email').fill('carlvince@live.com')
    await page.locator('#signup-password').fill('testing123')
    await page.locator('#signup-password-confirm').fill('testing123')

    // Click 'Create account'
    await page.getByRole('button', { name: 'Create account' }).click()

    // expect: error message from API response
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('successful registration shows email confirmation screen', async ({ page }) => {
    // Navigate to /sign-up
    await page.goto('/sign-up')

    // Fill all fields with unique email and valid matching passwords (>=6 chars)
    const uniqueEmail = `testuser+${Date.now()}@example.com`
    await page.locator('#signup-email').fill(uniqueEmail)
    await page.locator('#signup-password').fill('password123')
    await page.locator('#signup-password-confirm').fill('password123')

    // Click 'Create account'
    await page.getByRole('button', { name: 'Create account' }).click()

    // expect: confirmation screen shows 'Check your email'
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  })
})
