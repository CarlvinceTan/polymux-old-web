import { test } from '@playwright/test'

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    await page.goto('http://localhost:3000/sign-in')
    await page.locator('#signin-email').waitFor({ state: 'visible' })
    await page.fill('#signin-email', 'carlvince@live.com')
    await page.fill('#signin-password', 'testing')
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 })
    await page.goto('http://localhost:3000/vault/accounts')
  })
})
