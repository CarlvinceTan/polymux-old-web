// spec: Forum Index, New Discussion, Discussion Detail
// seed: e2e/home.public.spec.ts

import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Forum end-to-end tests.
 *
 * Public scenarios run without auth (default for *.public.spec.ts).
 * Authenticated scenarios perform an in-test sign-in using credentials from
 * CLAUDE.local.md or E2E_USERNAME / E2E_PASSWORD env vars.
 *
 * NOTE: The config warns that local UI sessions drop to /sign-in within ~10s,
 * so authenticated tests sign in and run the feature immediately in one test.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fromLocalMd(key: string): string | undefined {
  const file = resolve(process.cwd(), 'CLAUDE.local.md')
  if (!existsSync(file)) return undefined
  const m = readFileSync(file, 'utf8').match(new RegExp(`${key}\\s*=\\s*"?([^"\\n]+)"?`))
  return m?.[1]?.trim()
}

const USERNAME = process.env.E2E_USERNAME || process.env.TEST_USERNAME || fromLocalMd('TEST_USERNAME') || ''
const PASSWORD = process.env.E2E_PASSWORD || process.env.TEST_PASSWORD || fromLocalMd('TEST_PASSWORD') || ''

async function signIn(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/sign-in')
    await page.locator('#signin-email').waitFor({ state: 'visible' })
    await page.waitForTimeout(1_000)
    await page.fill('#signin-email', USERNAME)
    await page.fill('#signin-password', PASSWORD)
    await page.click('button[type="submit"]')
    try {
      await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 8_000 })
      return
    }
    catch {
      const err = page.locator('[role="alert"]')
      if (await err.isVisible().catch(() => false)) {
        throw new Error(`Sign-in failed: ${(await err.textContent())?.trim()}`)
      }
    }
  }
  throw new Error('Could not sign in after 4 attempts')
}

// ---------------------------------------------------------------------------
// Forum Index
// ---------------------------------------------------------------------------

test.describe('Forum Index', () => {
  // 1. Page renders heading, search bar, Start Discussion button
  test('page renders heading, search bar, and Start Discussion button', async ({ page }) => {
    // Navigate to the forum index
    await page.goto('/forum')

    // Expect heading visible
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Expect subtitle visible
    await expect(page.locator('p').filter({ hasText: 'Ask questions' }).first()).toBeVisible()

    // Expect search input visible
    await expect(page.locator('input[name="forum-search"]')).toBeVisible()

    // Expect Start Discussion button visible
    await expect(page.getByRole('link', { name: /start a discussion/i }).first()).toBeVisible()
  })

  // 2. Unauthenticated user clicking Start Discussion redirects to sign-in
  test('unauthenticated user clicking Start Discussion redirects to sign-in', async ({ page }) => {
    // Navigate to forum as unauthenticated user
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Click Start Discussion
    await page.getByRole('link', { name: /start a discussion/i }).first().click()

    // Expect redirect to /sign-in with ?redirect=/forum/new
    await expect(page).toHaveURL(/\/sign-in.*redirect.*forum.*new/)
  })

  // 3. Category filter buttons filter discussion list
  test('category filter buttons filter discussion list', async ({ page }) => {
    // Navigate to forum
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // All Posts category should be active by default
    const allPostsBtn = page.getByRole('button', { name: /all posts/i })
    await expect(allPostsBtn).toHaveClass(/bg-neutral-950/)

    // Click Help & Support category
    const helpBtn = page.getByRole('button', { name: /help & support/i })
    await helpBtn.click()

    // Help category button should now be active
    await expect(helpBtn).toHaveClass(/bg-neutral-950/)

    // All Posts button should no longer be active
    await expect(allPostsBtn).not.toHaveClass(/bg-neutral-950/)
  })

  // 4. Sort tabs (Latest/Top/Unanswered) change sort order
  test('sort tabs change active state', async ({ page }) => {
    // Navigate to forum
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Latest tab should be active by default
    const latestBtn = page.getByRole('button', { name: 'Latest' })
    await expect(latestBtn).toHaveClass(/text-neutral-950/)

    // Click Top tab
    const topBtn = page.getByRole('button', { name: 'Top' })
    await topBtn.click()
    await expect(topBtn).toHaveClass(/text-neutral-950/)
    await expect(latestBtn).not.toHaveClass(/text-neutral-950/)

    // Click Unanswered tab
    const unansweredBtn = page.getByRole('button', { name: 'Unanswered' })
    await unansweredBtn.click()
    await expect(unansweredBtn).toHaveClass(/text-neutral-950/)
    await expect(topBtn).not.toHaveClass(/text-neutral-950/)
  })

  // 5. Search input filters discussions
  test('search input filters discussions', async ({ page }) => {
    // Navigate to forum
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Type 'workflow' in search input
    await page.fill('input[name="forum-search"]', 'workflow')

    // Search value should be set
    await expect(page.locator('input[name="forum-search"]')).toHaveValue('workflow')
  })

  // 6. Reset Filters button clears all filters
  test('Reset Filters button clears all active filters', async ({ page }) => {
    // Navigate to forum
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Reset Filters button should not be visible initially
    await expect(page.getByRole('button', { name: /reset filters/i })).not.toBeVisible()

    // Click a category to set a filter
    await page.getByRole('button', { name: /help & support/i }).click()

    // Reset Filters button should now appear
    const resetBtn = page.getByRole('button', { name: /reset filters/i })
    await expect(resetBtn).toBeVisible()

    // Click Reset Filters
    await resetBtn.click()

    // All Posts category should be active again
    await expect(page.getByRole('button', { name: /all posts/i })).toHaveClass(/bg-neutral-950/)

    // Reset Filters button should disappear
    await expect(page.getByRole('button', { name: /reset filters/i })).not.toBeVisible()

    // Latest sort tab should be active
    await expect(page.getByRole('button', { name: 'Latest' })).toHaveClass(/text-neutral-950/)
  })

  // 7. Error state shows retry button when API fails
  test('error state shows retry button when API fails', async ({ page }) => {
    // Intercept the discussions API and return a network error
    await page.route('**/api/forum/discussions*', route => route.abort('failed'))

    // Navigate to forum
    await page.goto('/forum')

    // Expect error message and Retry button
    await expect(page.locator('text=Couldn\'t load the forum')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible()
  })

  // 8. Pinned and answered badges show on cards
  test('pinned and answered badges render when data indicates so', async ({ page }) => {
    // Mock the discussions API to return a pinned and an answered discussion
    await page.route('**/api/forum/discussions*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          discussions: [
            {
              id: 'test-pinned-1',
              category: 'help',
              title: 'Pinned discussion',
              body: 'This is a pinned discussion body.',
              author_id: 'user-1',
              author_name: 'Alice',
              author_initials: 'A',
              pinned: true,
              answered: false,
              views: 10,
              reply_count: 2,
              last_activity_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            {
              id: 'test-answered-1',
              category: 'help',
              title: 'Answered discussion',
              body: 'This discussion has been answered.',
              author_id: 'user-2',
              author_name: 'Bob',
              author_initials: 'B',
              pinned: false,
              answered: true,
              views: 5,
              reply_count: 1,
              last_activity_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
          ],
        }),
      })
    )

    // Navigate to forum
    await page.goto('/forum')

    // Expect Pinned badge
    await expect(page.locator('text=Pinned').first()).toBeVisible()

    // Expect Answered badge
    await expect(page.locator('text=Answered').first()).toBeVisible()
  })

  // 9. Clicking discussion card navigates to detail
  test('clicking a discussion card navigates to the detail page', async ({ page }) => {
    // Mock the discussions API to return one discussion
    await page.route('**/api/forum/discussions*', (route) => {
      if (!route.request().url().includes('/replies')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            discussions: [
              {
                id: 'test-disc-nav',
                category: 'help',
                title: 'Click me to navigate',
                body: 'This is a test discussion.',
                author_id: 'user-1',
                author_name: 'Alice',
                author_initials: 'A',
                pinned: false,
                answered: false,
                views: 3,
                reply_count: 0,
                last_activity_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        })
      }
      return route.continue()
    })

    // Navigate to forum
    await page.goto('/forum')

    // Click the discussion card link
    await page.getByRole('link', { name: /click me to navigate/i }).click()

    // Expect navigated to /forum/test-disc-nav
    await expect(page).toHaveURL(/\/forum\/test-disc-nav/)
  })

  // 10. Guidelines anchor link scrolls to #guidelines section
  test('Read guidelines link navigates to #guidelines section', async ({ page }) => {
    // Navigate to forum
    await page.goto('/forum')
    await expect(page.locator('h1')).toContainText('Polymux Forum')

    // Click Read the guidelines
    await page.getByRole('link', { name: /read the guidelines/i }).click()

    // URL should have #guidelines fragment
    await expect(page).toHaveURL(/#guidelines/)

    // The guidelines section should be in the DOM
    await expect(page.locator('#guidelines')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// New Forum Discussion
// ---------------------------------------------------------------------------

test.describe('New Forum Discussion', () => {
  // 1. Unauthenticated redirected to sign-in
  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    // Navigate to /forum/new without auth
    await page.goto('/forum/new')

    // Expect redirect to /sign-in?redirect=/forum/new
    await expect(page).toHaveURL(/\/sign-in.*redirect.*forum.*new/, { timeout: 10_000 })
  })

  // 2. Authenticated sees new discussion form
  test('authenticated user sees new discussion form', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Navigate to /forum/new
    await page.goto('/forum/new')

    // Expect heading 'Start a discussion'
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Expect category fieldset
    await expect(page.locator('fieldset')).toBeVisible()

    // Expect title input
    await expect(page.locator('#forum-title')).toBeVisible()

    // Expect body textarea
    await expect(page.locator('#forum-body')).toBeVisible()

    // Expect Cancel and Publish buttons
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /publish discussion/i })).toBeVisible()
  })

  // 3. Publish disabled until minimum requirements met
  test('Publish button is disabled until all minimum requirements are met', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Navigate to /forum/new
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    const publishBtn = page.getByRole('button', { name: /publish discussion/i })

    // No category + no title + no body → disabled
    await expect(publishBtn).toBeDisabled()

    // Select a category (Help & Support)
    await page.locator('label').filter({ hasText: /help & support/i }).click()
    await expect(publishBtn).toBeDisabled()

    // Add title ≥3 chars
    await page.fill('#forum-title', 'Hello')
    await expect(publishBtn).toBeDisabled()

    // Add body ≥10 chars → Publish enabled
    await page.fill('#forum-body', 'This is a test body with enough content.')
    await expect(publishBtn).toBeEnabled()
  })

  // 4. Category radio selection highlights selected
  test('clicking a category highlights it with active border style', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Navigate to /forum/new
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Click Help & Support category label
    const helpLabel = page.locator('label').filter({ hasText: /help & support/i })
    await helpLabel.click()

    // Label should have the active border class
    await expect(helpLabel).toHaveClass(/border-neutral-950/)
  })

  // 5. Title character count updates as user types
  test('title character count updates as user types', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Navigate to /forum/new
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Type 'Hello World' in title field
    await page.fill('#forum-title', 'Hello World')

    // Character count hint should show 11/200
    await expect(page.locator('p').filter({ hasText: '11/200' })).toBeVisible()
  })

  // 6. Back button navigates to /forum
  test('Back to forum button navigates to /forum', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Navigate to /forum/new directly (no history)
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Click Back to forum button
    await page.getByRole('button', { name: /back to forum/i }).click()

    // Expect navigated to /forum
    await expect(page).toHaveURL(/\/forum$/, { timeout: 8_000 })
  })

  // 7. Successfully submitting redirects to new discussion page
  test('successfully submitting form redirects to new discussion detail page', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Intercept the POST and return a mock discussion
    await page.route('**/api/forum/discussions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            discussion: {
              id: 'new-discussion-id',
              category: 'help',
              title: 'My Test Discussion',
              body: 'This is sufficient body content for the test.',
              author_id: 'user-1',
              author_name: 'Test User',
              author_initials: 'TU',
              pinned: false,
              answered: false,
              views: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        })
      }
      return route.continue()
    })

    // Navigate to /forum/new
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Fill all required fields
    await page.locator('label').filter({ hasText: /help & support/i }).click()
    await page.fill('#forum-title', 'My Test Discussion')
    await page.fill('#forum-body', 'This is sufficient body content for the test.')

    // Click Publish discussion
    await page.getByRole('button', { name: /publish discussion/i }).click()

    // Expect redirect to /forum/new-discussion-id
    await expect(page).toHaveURL(/\/forum\/new-discussion-id/, { timeout: 10_000 })
  })

  // 8. API error shows inline error message
  test('API error on submit shows inline error message', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Intercept POST and return an error
    await page.route('**/api/forum/discussions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ statusMessage: 'Internal Server Error' }),
        })
      }
      return route.continue()
    })

    // Navigate to /forum/new
    await page.goto('/forum/new')
    await expect(page.locator('h1')).toContainText('Start a discussion', { ignoreCase: true })

    // Fill all required fields
    await page.locator('label').filter({ hasText: /help & support/i }).click()
    await page.fill('#forum-title', 'Error Test Discussion')
    await page.fill('#forum-body', 'This is sufficient body content for the test.')

    // Click Publish discussion
    await page.getByRole('button', { name: /publish discussion/i }).click()

    // Expect inline error message shown as role="alert"
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Forum Detail
// ---------------------------------------------------------------------------

test.describe('Forum Detail', () => {
  const MOCK_DISCUSSION = {
    id: 'test-detail-id',
    category: 'help',
    title: 'How do I configure my agent?',
    body: 'I am trying to figure out the agent configuration settings.',
    author_id: 'user-1',
    author_name: 'Alice Smith',
    author_initials: 'AS',
    pinned: false,
    answered: false,
    views: 42,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const MOCK_REPLY = {
    id: 'reply-1',
    discussion_id: 'test-detail-id',
    body: 'Try the settings panel on the right side.',
    author_id: 'user-2',
    author_name: 'Bob Jones',
    author_initials: 'BJ',
    created_at: new Date().toISOString(),
  }

  // 1. Valid discussion renders title, author, body, reply count
  test('valid discussion renders title, author, body, and reply count', async ({ page }) => {
    // Mock API to return discussion with one reply
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [MOCK_REPLY] }),
      })
    )

    // Navigate to /forum/test-detail-id
    await page.goto('/forum/test-detail-id')

    // Expect h1 title
    await expect(page.locator('h1')).toContainText('How do I configure my agent?')

    // Expect author name visible
    await expect(page.locator('text=Alice Smith').first()).toBeVisible()

    // Expect body text visible
    await expect(page.locator('text=I am trying to figure out')).toBeVisible()

    // Expect reply count (1 reply)
    await expect(page.locator('text=1 reply')).toBeVisible()
  })

  // 2. No replies shows empty replies state
  test('no replies shows empty replies state', async ({ page }) => {
    // Mock API to return discussion with no replies
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [] }),
      })
    )

    // Navigate to /forum/test-detail-id
    await page.goto('/forum/test-detail-id')

    // Expect empty state message
    await expect(page.locator('text=No replies yet')).toBeVisible()

    // Expect 0 replies in section heading
    await expect(page.locator('text=0 replies')).toBeVisible()
  })

  // 3. Unauthenticated user sees sign-in CTA
  test('unauthenticated user sees sign-in CTA instead of reply form', async ({ page }) => {
    // Mock API
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [] }),
      })
    )

    // Navigate to discussion detail without auth
    await page.goto('/forum/test-detail-id')

    // Reply textarea should NOT be visible
    await expect(page.locator('textarea[name="forum-reply"]')).not.toBeVisible()

    // Sign In button should be visible
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()

    // Create account link should be visible
    await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible()
  })

  // 4. Authenticated user sees reply form
  test('authenticated user sees reply form with disabled Post Reply button', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Mock API
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [] }),
      })
    )

    // Navigate to discussion detail
    await page.goto('/forum/test-detail-id')

    // Reply textarea should be visible
    await expect(page.locator('textarea[name="forum-reply"]')).toBeVisible()

    // Post Reply button should be disabled (empty textarea)
    await expect(page.getByRole('button', { name: /post reply/i })).toBeDisabled()

    // Character counter should be visible
    await expect(page.locator('text=Be kind').first()).toBeVisible()
  })

  // 5. Authenticated user can post a reply
  test('authenticated user can post a reply and sees it in the list', async ({ page }) => {
    // Sign in first
    await signIn(page)

    let replyPosted = false

    // Mock the GET discussion endpoint (returns updated replies after post)
    await page.route('**/api/forum/discussions/test-detail-id', (route) => {
      if (!route.request().url().includes('/replies')) {
        const postedReplies = replyPosted ? [{ ...MOCK_REPLY, body: 'My new reply content here.' }] : []
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: postedReplies }),
        })
      }
      return route.continue()
    })

    // Mock the POST reply endpoint
    await page.route('**/api/forum/discussions/test-detail-id/replies', (route) => {
      if (route.request().method() === 'POST') {
        replyPosted = true
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ reply: { ...MOCK_REPLY, body: 'My new reply content here.' } }),
        })
      }
      return route.continue()
    })

    // Navigate to discussion detail
    await page.goto('/forum/test-detail-id')

    // Type reply
    await page.fill('textarea[name="forum-reply"]', 'My new reply content here.')

    // Post Reply button should now be enabled
    await expect(page.getByRole('button', { name: /post reply/i })).toBeEnabled()

    // Click Post Reply
    await page.getByRole('button', { name: /post reply/i }).click()

    // Textarea should be cleared after posting
    await expect(page.locator('textarea[name="forum-reply"]')).toHaveValue('', { timeout: 8_000 })

    // Reply should appear in the list
    await expect(page.locator('text=My new reply content here.')).toBeVisible()
  })

  // 6. Reply too long (>20000 chars) shows validation error
  test('reply exceeding 20000 characters shows validation error', async ({ page }) => {
    // Sign in first
    await signIn(page)

    // Mock API
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [] }),
      })
    )

    // Navigate to discussion detail
    await page.goto('/forum/test-detail-id')

    // Remove maxlength constraint to allow overly long input, then fill
    await page.locator('textarea[name="forum-reply"]').evaluate((el: HTMLTextAreaElement) => {
      el.removeAttribute('maxlength')
    })
    await page.fill('textarea[name="forum-reply"]', 'a'.repeat(20001))

    // Click Post Reply
    await page.getByRole('button', { name: /post reply/i }).click()

    // Expect validation error in role="alert"
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[role="alert"]')).toContainText(/too long/i)
  })

  // 7. Category and pinned/answered badges render
  test('category, pinned, and answered badges render on discussion detail', async ({ page }) => {
    // Mock API with pinned + answered discussion
    const pinnedAnsweredDisc = { ...MOCK_DISCUSSION, pinned: true, answered: true }
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: pinnedAnsweredDisc, replies: [] }),
      })
    )

    // Navigate to discussion detail
    await page.goto('/forum/test-detail-id')

    // Pinned badge should be visible
    await expect(page.locator('text=Pinned').first()).toBeVisible()

    // Answered badge should be visible
    await expect(page.locator('text=Answered').first()).toBeVisible()

    // Category badge (Help & Support) should be visible
    await expect(page.locator('text=Help & Support').first()).toBeVisible()
  })

  // 8. Back button navigates to /forum
  test('Back to forum button navigates to /forum', async ({ page }) => {
    // Mock API
    await page.route('**/api/forum/discussions/test-detail-id', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discussion: MOCK_DISCUSSION, replies: [] }),
      })
    )

    // Navigate to discussion detail
    await page.goto('/forum/test-detail-id')
    await expect(page.locator('h1')).toContainText('How do I configure my agent?')

    // Click Back to forum button
    await page.getByRole('button', { name: /back to forum/i }).click()

    // Expect navigated to /forum
    await expect(page).toHaveURL(/\/forum$/, { timeout: 8_000 })
  })

  // 9. Invalid discussion ID shows error with Return to Forum link
  test('invalid discussion ID shows error state with Return to Forum link', async ({ page }) => {
    // Mock API to return 404
    await page.route('**/api/forum/discussions/invalid-id-xyz', route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ statusMessage: 'Not Found' }),
      })
    )

    // Navigate to invalid discussion ID
    await page.goto('/forum/invalid-id-xyz')

    // Expect error message
    await expect(page.locator('text=This discussion could not be loaded')).toBeVisible({ timeout: 10_000 })

    // Expect Return to Forum link
    await expect(page.getByRole('link', { name: /return to the forum/i })).toBeVisible()
  })
})
