// spec: Documentation (/documentation/[slug])
// seed: e2e/home.public.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Documentation (/documentation/[slug])', () => {
  test('Page renders with three-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction on 1280px viewport
    await page.goto('/documentation/introduction')

    // expect: sticky top bar with Polymux logo/Docs link
    const header = page.locator('header')
    await expect(header.getByRole('link', { name: 'Home' })).toBeVisible()

    // expect: centered search bar
    await expect(header.getByRole('searchbox')).toBeVisible()

    // expect: language picker
    await expect(header.getByRole('button', { name: 'Language' })).toBeVisible()

    // expect: left sidebar with collapsible section groups and nav links
    const sidebar = page.locator('aside.sticky').first()
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Getting started' })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Using Polymux' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Introduction' })).toBeVisible()

    // expect: main content area renders markdown as HTML
    const article = page.locator('article.docs-body')
    await expect(article).toBeVisible()
    await expect(article.getByRole('heading', { name: 'Introduction', level: 1 })).toBeVisible()

    // expect: right rail 'On This Page' ToC visible for docs with multiple headings
    const rightRail = page.locator('aside').last()
    await expect(rightRail.getByRole('heading', { name: 'On this page', level: 4 })).toBeVisible()
    await expect(rightRail.getByRole('link', { name: 'What Polymux gives you' })).toBeVisible()
  })

  test('Left sidebar navigation links navigate to correct pages', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    // Click a different doc entry in the sidebar
    await page.locator('aside.sticky nav a[href="/documentation/quickstart"]').click()

    // expect: navigated to /documentation/quickstart
    await expect(page).toHaveURL('/documentation/quickstart')

    // expect: clicked entry highlighted as active
    const activeLink = page.locator('aside.sticky nav a[href="/documentation/quickstart"]')
    await expect(activeLink).toHaveClass(/font-medium/)
  })

  test('Collapsible sidebar sections expand and collapse', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/quickstart
    await page.goto('/documentation/quickstart')

    const sidebar = page.locator('aside.sticky').first()
    const sectionBtn = sidebar.getByRole('button', { name: 'Getting started' })

    // expect: sections expanded by default
    await expect(sectionBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar.getByRole('link', { name: 'Introduction' })).toBeVisible()

    // Click section heading -> collapses (entry links hidden)
    await sectionBtn.click()
    await expect(sectionBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(sidebar.getByRole('link', { name: 'Introduction' })).not.toBeVisible()

    // Click again -> expands
    await sectionBtn.click()
    await expect(sectionBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(sidebar.getByRole('link', { name: 'Introduction' })).toBeVisible()
  })

  test('Search bar opens results for valid query', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    const searchbox = page.getByRole('searchbox')

    // Click search bar and type 'agent'
    await searchbox.click()
    await searchbox.fill('agent')

    // expect: dropdown opens with results
    const firstResult = page.getByRole('button', { name: /Quickstart Getting started/ })
    await expect(firstResult).toBeVisible()

    // Click a result -> dropdown closes, navigated to that slug
    await firstResult.click()
    await expect(page).toHaveURL('/documentation/quickstart')
  })

  test('Ctrl+K opens search bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    const searchbox = page.getByRole('searchbox')

    // Press Ctrl+K
    await page.keyboard.press('Control+k')

    // expect: search input focused
    await expect(searchbox).toBeFocused()

    // Press Escape -> search closes
    await page.keyboard.press('Escape')
    await expect(searchbox).not.toBeFocused()
  })

  test('/ shortcut opens search when not in input', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    // Click main article area to ensure focus is not in an input
    await page.locator('article.docs-body').click()

    const searchbox = page.getByRole('searchbox')

    // Press / while not in an input
    await page.keyboard.press('/')

    // expect: search input focused
    await expect(searchbox).toBeFocused()
  })

  test('Language picker changes locale', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/quickstart
    await page.goto('/documentation/quickstart')

    // Click language picker -> dropdown with 8 locales
    await page.getByRole('button', { name: 'Language' }).click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(8)

    // Select French -> content reloads in French locale
    await menu.getByRole('menuitem', { name: 'Français' }).click()

    // expect: language button label changes to French
    await expect(page.getByRole('button', { name: 'Langue' })).toBeVisible()
  })

  test('Right rail ToC highlights current heading on scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to doc with multiple headings
    await page.goto('/documentation/quickstart')

    const rightRail = page.locator('aside').last()

    // expect: first heading highlighted in ToC (active on initial load)
    const firstTocLink = rightRail.getByRole('link', { name: '1. Create an account' })
    await expect(firstTocLink).toBeVisible()
    await expect(firstTocLink).toHaveClass(/font-medium/)

    // Scroll past first h2 -> next h2 becomes active in ToC
    await page.evaluate(() => {
      const scrollRoot = document.getElementById('docs-scroll')
      const heading = document.getElementById('2-start-your-first-workflow')
      if (scrollRoot && heading) {
        scrollRoot.scrollTop = heading.offsetTop + 200
      }
    })

    const secondTocLink = rightRail.getByRole('link', { name: '2. Start your first workflow' })
    await expect(secondTocLink).toHaveClass(/font-medium/)
  })

  test('Clicking ToC entry scrolls to that heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to doc with multiple headings
    await page.goto('/documentation/quickstart')

    const rightRail = page.locator('aside').last()

    // Click a heading in right rail ToC
    await rightRail.getByRole('link', { name: '3. Watch the agent work' }).click()

    // expect: page scrolls to that heading, URL hash updates
    await expect(page).toHaveURL(/\/documentation\/quickstart#3-watch-the-agent-work/)
  })

  test('Previous and Next links appear and navigate', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to a middle doc page (quickstart has both prev and next)
    await page.goto('/documentation/quickstart')

    const prevNextNav = page.locator('main nav').first()

    // expect: Previous and Next links visible with neighbour titles
    await expect(prevNextNav.getByRole('link', { name: /Previous.*Introduction/i })).toBeVisible()
    await expect(prevNextNav.getByRole('link', { name: /Next.*Installation/i })).toBeVisible()

    // Click Next -> navigated to next slug
    await prevNextNav.getByRole('link', { name: /Next.*Installation/i }).click()
    await expect(page).toHaveURL('/documentation/installation')
  })

  test('Footer shows Contact, Forum, Privacy Policy links', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    // Scroll to bottom of content area
    await page.evaluate(() => {
      const scrollRoot = document.getElementById('docs-scroll')
      if (scrollRoot) scrollRoot.scrollTop = scrollRoot.scrollHeight
    })

    const footer = page.locator('main footer')

    // expect: footer with copyright
    await expect(footer).toContainText('Polymux')

    // expect: links to /contact, /forum, /privacy-policy
    await expect(footer.getByRole('link', { name: 'Contact' })).toBeVisible()
    await expect(footer.getByRole('link', { name: 'Forum' })).toBeVisible()
    await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
  })

  test('Mobile sidebar toggle opens and closes', async ({ page }) => {
    // Set viewport to 375px
    await page.setViewportSize({ width: 375, height: 812 })

    // Navigate to /documentation/introduction
    await page.goto('/documentation/introduction')

    // expect: hamburger button visible
    const hamburger = page.getByRole('button', { name: 'Open navigation' })
    await expect(hamburger).toBeVisible()

    // expect: desktop sidebar hidden on mobile
    const desktopSidebar = page.locator('aside.sticky.hidden')
    await expect(desktopSidebar).not.toBeVisible()

    // Click hamburger -> mobile sidebar slides in, backdrop appears
    await hamburger.click()

    const mobileSidebar = page.locator('aside[class*="fixed"]')
    await expect(mobileSidebar).toBeVisible()

    const backdrop = page.locator('div[class*="fixed"][class*="bg-neutral-950"]')
    await expect(backdrop).toBeVisible()

    // Click backdrop -> sidebar closes
    await backdrop.click()
    await expect(mobileSidebar).not.toBeVisible()
  })
})
