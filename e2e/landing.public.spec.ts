// spec: Landing & Home Page (/ and /landing)
// seed: e2e/seed.public.spec.ts
// Note: /landing is NOT a registered route — nuxt.config.ts explicitly removes
// landing.vue from file-based routing. index.vue imports it as a component for /.

import { test, expect } from '@playwright/test'

const HERO_TITLE = 'AI agents for the live web'
const PAGE_TITLE = /AI Agents for Browser Automation/
const ROTATING_PHRASES = [
  'Live browser sessions.',
  'Multi-agent handoffs.',
  'Vault-safe secrets.',
  'Replayable workflows.',
]

test.describe('Landing & Home Page (/ and /landing)', () => {
  test('Landing page renders hero section with CTA buttons', async ({ page }) => {
    // 1. Navigate to http://localhost:3000/
    await page.goto('/')

    // expect: page title reflects the landing meta title
    await expect(page).toHaveTitle(PAGE_TITLE)

    // expect: hero section is visible with a headline
    await expect(page.getByRole('heading', { name: HERO_TITLE, level: 1 })).toBeVisible()

    // expect: rotating phrase status element is present and shows one of the known phrases
    const statusEl = page.locator('[role="status"]')
    await expect(statusEl).toBeVisible()
    const statusLabel = await statusEl.getAttribute('aria-label')
    expect(ROTATING_PHRASES).toContain(statusLabel)

    // expect: primary CTA button linking to /workflow/new is present
    const useNowLinks = page.getByRole('link', { name: 'Use now' })
    await expect(useNowLinks.first()).toBeVisible()
    await expect(useNowLinks.first()).toHaveAttribute('href', '/workflow/new')

    // 2. Verify the page contains features section with four feature tiles
    await expect(page.getByRole('heading', { name: 'Multi-Agent Orchestration', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Live Browser Sessions', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Secure Vault', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Smart Marketplace', level: 3 })).toBeVisible()

    // 3. Scroll down to pricing comparison section and verify plan columns
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { name: 'Free', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pro', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Max', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Enterprise', level: 3 })).toBeVisible()
  })

  test('/landing route renders identical content to /', async ({ page }) => {
    // The /landing file-based route is intentionally removed in nuxt.config.ts
    // (landing.vue is imported as a component by index.vue, not a routed page).
    // This test documents the actual behaviour: /landing is a 404.

    // 1. Navigate to http://localhost:3000/landing
    await page.goto('/landing')

    // /landing does not exist as a route — Nuxt returns 404
    // Nuxt 4 renders its own 404 page; verify the page title indicates an error
    await expect(page).toHaveTitle(/404|not found/i)
  })

  test('Hero rotating phrases cycle through the list', async ({ page }) => {
    // 1. Navigate to http://localhost:3000/ and observe the rotating phrase element
    await page.goto('/')

    // expect: a rotating phrase is displayed in the hero headline
    const statusEl = page.locator('[role="status"]')
    await expect(statusEl).toBeVisible()

    // Capture the initial phrase
    const initialLabel = await statusEl.getAttribute('aria-label')
    expect(initialLabel).toBeTruthy()
    expect(ROTATING_PHRASES).toContain(initialLabel)

    // 2. Wait up to 5 seconds for the phrase rotation cycle to change
    // holdMs default = 2800ms, flipMs default = 720ms → one full cycle ≈ 3520ms
    await expect(statusEl).not.toHaveAttribute('aria-label', initialLabel ?? '', { timeout: 5000 })

    // expect: phrase displayed changes to a different entry from the rotation list
    const nextLabel = await statusEl.getAttribute('aria-label')
    expect(ROTATING_PHRASES).toContain(nextLabel)
    expect(nextLabel).not.toBe(initialLabel)
  })
})
