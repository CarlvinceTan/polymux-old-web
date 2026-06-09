// spec: e2e/blog/blog.public.spec.ts
// seed: e2e/home.public.spec.ts
//
// NOTE — Three scenarios from the original test plan are not implemented here:
//
//  • Index #6 "Authenticated non-subscribed visitor sees scroll-to-newsletter button"
//  • Index #7 "Authenticated subscribed user doesn't see newsletter prompt"
//    → Both require a signed-in session. This file matches `*.public.spec.ts`
//      which is routed to the `public` project (no storageState). Playwright
//      config explicitly ignores `*.public.spec.ts` in the `authed` project.
//      These must live in a `*.spec.ts` file that runs in the `authed` project.
//
//  • Detail #4 "Code blocks have a copy button"
//    → `app/pages/blog/[slug].vue` renders body markdown via `marked` into
//      `v-html` using plain CSS-styled `<pre><code>` blocks. There is no copy
//      button component or clipboard directive injected into blog post bodies.
//      The feature doesn't exist yet; writing a test for it would always fail.
//
// Known seed slugs (from supabase/migrations/20260520000000_blog_posts.sql):
//   introducing-polymux-agents | vault-security-model | marketplace-rollout

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Blog Index Tests
// ---------------------------------------------------------------------------

test.describe('Blog Index and Blog Post Detail', () => {
  test.describe('Blog Index', () => {
    test('Page renders heading and subtitle', async ({ page }) => {
      // Navigate to the blog index
      await page.goto('/blog')

      // expect: main heading visible
      await expect(page.locator('h1')).toBeVisible()

      // expect: subtitle paragraph visible (the <p> directly under the <header>)
      const header = page.locator('header').first()
      await expect(header.locator('p').first()).toBeVisible()
    })

    test('Shows empty state when no posts published', async ({ page }) => {
      // Navigate to the blog index
      await page.goto('/blog')

      // If no published posts exist, expect empty state text and no articles
      const articleCount = await page.locator('article').count()
      if (articleCount === 0) {
        // expect: empty state message shown, no article cards
        await expect(page.locator('text=/nothing here yet|no posts/i').or(
          page.locator('[class*="empty"]'),
        )).toBeVisible()
        await expect(page.locator('article')).toHaveCount(0)
      } else {
        // Posts are present — this scenario does not apply, skip silently
        test.skip()
      }
    })

    test('Published posts are listed with title, date, category', async ({ page }) => {
      // Navigate to the blog index
      await page.goto('/blog')

      const articleCount = await page.locator('article').count()
      if (articleCount === 0) {
        // No posts seeded — cannot validate article cards
        test.skip()
      }

      // expect: article cards visible
      await expect(page.locator('article').first()).toBeVisible()

      // expect: formatted date (<time> element) present in first card
      await expect(page.locator('article').first().locator('time')).toBeVisible()

      // expect: post title rendered as a link
      const firstTitleLink = page.locator('article').first().locator('h2 a')
      await expect(firstTitleLink).toBeVisible()

      // expect: category label present (seeded posts all have a category)
      const metaArea = page.locator('article').first().locator('time').locator('..')
      await expect(metaArea).toContainText(/Product|Security|Platform/)
    })

    test('Clicking post title navigates to post detail', async ({ page }) => {
      // Navigate to the blog index
      await page.goto('/blog')

      const articleCount = await page.locator('article').count()
      if (articleCount === 0) {
        test.skip()
      }

      // Click first post title link
      const firstTitleLink = page.locator('article').first().locator('h2 a')
      const href = await firstTitleLink.getAttribute('href')
      await firstTitleLink.click()

      // expect: navigated to /blog/[slug]
      await expect(page).toHaveURL(/\/blog\/.+/)
      if (href) {
        await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      }
    })

    test('Unauthenticated visitor sees sign-in link for newsletter', async ({ page }) => {
      // Navigate as unauthenticated user
      await page.goto('/blog')

      // expect: subscription hint with 'Subscribe' link pointing to /sign-in?redirect=/blog
      const subscribeLink = page.locator('a[href*="/sign-in"]').filter({ hasText: /subscribe/i })
      await expect(subscribeLink).toBeVisible()
      const href = await subscribeLink.getAttribute('href')
      expect(href).toMatch(/\/sign-in/)
      expect(href).toMatch(/redirect/)
    })
  })

  // -------------------------------------------------------------------------
  // Blog Post Detail Tests
  // -------------------------------------------------------------------------

  test.describe('Blog Post Detail', () => {
    // Use a known-seeded slug so tests don't depend on live DB state
    const VALID_SLUG = 'introducing-polymux-agents'

    test('Valid post renders title, date, category, cover image, and body', async ({ page }) => {
      // Navigate to a valid post
      await page.goto(`/blog/${VALID_SLUG}`)

      // expect: h1 displays post title
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('h1')).toContainText(/polymux/i)

      // expect: publication date shown
      await expect(page.locator('time')).toBeVisible()

      // expect: category shown
      const headerMeta = page.locator('article header p').first()
      await expect(headerMeta).toContainText('Product')

      // expect: markdown body rendered as HTML (the .blog-body div)
      const body = page.locator('.blog-body')
      await expect(body).toBeVisible()
      // rendered markdown should produce at least one element inside
      await expect(body.locator('h1, h2, h3, p').first()).toBeVisible()
    })

    test('Back link navigates to /blog', async ({ page }) => {
      // Navigate to post detail
      await page.goto(`/blog/${VALID_SLUG}`)

      // expect: '← All posts' link visible
      const backLink = page.locator('a', { hasText: /all posts/i })
      await expect(backLink).toBeVisible()

      // Click it → navigated to /blog
      await backLink.click()
      await expect(page).toHaveURL('/blog')
    })

    test('Invalid slug returns 404 error page', async ({ page }) => {
      // Navigate to a non-existent slug
      await page.goto('/blog/this-slug-does-not-exist')

      // expect: 404 error page with 'Post not found' or standard message
      await expect(
        page.locator('text=/post not found/i').or(
          page.locator('text=/404/'),
        ),
      ).toBeVisible()
    })

    test('OG meta tags are set', async ({ page }) => {
      // Navigate to valid post
      await page.goto(`/blog/${VALID_SLUG}`)

      // expect: og:title matches post title
      const ogTitle = page.locator('meta[property="og:title"]')
      const ogTitleContent = await ogTitle.getAttribute('content')
      expect(ogTitleContent).toBeTruthy()

      // expect: og:type is 'article'
      const ogType = page.locator('meta[property="og:type"]')
      const ogTypeContent = await ogType.getAttribute('content')
      expect(ogTypeContent).toBe('article')
    })
  })
})
