import { test } from '@playwright/test'
test.use({ storageState: 'e2e/.auth/user.json' })
test('seed', async ({ page }) => { await page.goto('/vault/accounts') })
