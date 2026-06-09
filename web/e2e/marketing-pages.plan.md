# Polymux Marketing & Content Pages Test Plan

## Application Overview

Polymux is a Nuxt 4 SaaS platform for AI agent orchestration. This test plan covers the public-facing marketing and content pages: /pricing, /about-us, /contact, /community, /blog (index and post detail), /forum (index, new discussion, discussion detail), /documentation/[slug], /api-reference, /privacy-policy, /terms-of-service, /cookie-policy, and /unsubscribed. All pages use the landing layout. The forum pages are wrapped in a FeatureGate component that may hide content based on a feature flag. Tests should be run as unauthenticated (anonymous) users unless otherwise noted. All pages are covered by the "public" Playwright project (testMatch: *.public.spec.ts).

## Test Scenarios

### 1. Pricing Page (/pricing)

**Seed:** `e2e/home.public.spec.ts`

#### 1.1. Displays all four plan cards on initial load

**File:** `e2e/pricing/pricing-plans.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing
    - expect: Page title contains 'Pricing'
    - expect: Four plan cards are visible: Free, Pro, Max, Enterprise
    - expect: Price values are displayed (or loading placeholder '—' while the /api/prices fetch is in-flight)
  2. Wait for price data to load (prices fetch resolves from /api/prices)
    - expect: Each card shows a price value with a '/mo' period suffix where applicable
    - expect: Free plan shows '$0' or equivalent
    - expect: Enterprise card shows a 'Contact' label or no numeric price

#### 1.2. Billing period toggle switches between Annual and Monthly prices

**File:** `e2e/pricing/pricing-billing-toggle.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing and wait for prices to load
    - expect: Annual billing toggle button is active by default (aria-pressed='true')
  2. Click the 'Monthly' billing toggle button
    - expect: Monthly button becomes active (aria-pressed='true')
    - expect: Pro and Max cards update to show monthly prices
    - expect: Annual button is no longer active
  3. Click the 'Annual' billing toggle button
    - expect: Annual button becomes active again
    - expect: Pro and Max cards revert to annual per-month prices
    - expect: A compare-at (strikethrough) monthly price may appear on Pro and Max cards

#### 1.3. Selecting a plan card highlights it and shows the Purchase Now button

**File:** `e2e/pricing/pricing-plan-selection.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing as an unauthenticated user
    - expect: Page loads without error
  2. Click the Pro plan card
    - expect: Pro plan card is marked as selected (aria-pressed or selected styling applies)
    - expect: A 'Purchase Now' button appears below the plan grid
  3. Click the Max plan card
    - expect: Max plan card becomes selected
    - expect: Pro plan card is deselected
    - expect: 'Purchase Now' button remains visible
  4. Click the Free plan card
    - expect: Free plan card is selected
    - expect: Purchase Now button is hidden (Free plan shows no purchase CTA)

#### 1.4. Clicking Enterprise plan card navigates to /contact with from=enterprise-plan query param

**File:** `e2e/pricing/pricing-enterprise-redirect.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing
    - expect: Page loads
  2. Click the Enterprise plan card CTA button
    - expect: Browser navigates to /contact?from=enterprise-plan

#### 1.5. Back button navigates to previous page or home

**File:** `e2e/pricing/pricing-back-button.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/ then navigate to http://localhost:3000/pricing
    - expect: Pricing page loads
  2. Click the back arrow button in the page header
    - expect: Browser navigates back to the previous page (/)

#### 1.6. Feature comparison table shows correct per-plan values

**File:** `e2e/pricing/pricing-feature-table.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing and wait for prices to load
    - expect: Each plan card lists feature rows such as Agents per Workspace, Weekly Token Budget, Monthly Workflow Runs, Cloud Storage, Workspace Members
  2. Inspect feature values for the Free plan card
    - expect: Agents: 2
    - expect: Weekly token budget: 100K
    - expect: Monthly workflow runs: 50
    - expect: BYOK: included (checkmark)
    - expect: Custom Workflows: not included
    - expect: Priority Support: not included
  3. Inspect feature values for the Enterprise plan card
    - expect: Agents: 50
    - expect: Weekly token budget: Unlimited
    - expect: Custom Workflows: included
    - expect: Priority Support: included
    - expect: Workspace Members: Custom

#### 1.7. Workspace picker appears when user has multiple workspaces (authenticated)

**File:** `e2e/pricing/pricing-workspace-picker.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/pricing as an authenticated user who has more than one workspace
    - expect: A workspace picker dropdown button is visible in the header area showing the current workspace name and plan
  2. Click the workspace picker button
    - expect: A dropdown opens listing all workspaces
    - expect: Each row shows workspace name and plan label
  3. Click a different workspace in the dropdown
    - expect: Dropdown closes
    - expect: Workspace picker updates to reflect the newly selected workspace
    - expect: Selected plan key updates to the next tier above the new workspace's current plan

### 2. About Us Page (/about-us)

**Seed:** `e2e/home.public.spec.ts`

#### 2.1. Page renders content from the about-us doc slug

**File:** `e2e/about-us/about-us-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/about-us
    - expect: Page title is 'About Us'
    - expect: A heading and subtitle from the i18n keys legalDocs.about.title and legalDocs.about.subtitle are visible
    - expect: The main body content is rendered inside the LegalDocPage component

#### 2.2. Meta description is set correctly

**File:** `e2e/about-us/about-us-meta.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/about-us
    - expect: The <meta name='description'> tag content contains 'Polymux builds the orchestration layer for AI agents'

### 3. Contact Page (/contact)

**Seed:** `e2e/home.public.spec.ts`

#### 3.1. Form displays all three fields and a submit button

**File:** `e2e/contact/contact-form-display.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: A heading 'Contact' is visible
    - expect: A subtitle paragraph is visible
    - expect: Three form fields are present: Subject/Title (text input), Email (email input), Message/Content (textarea)
    - expect: A 'Send' submit button is visible and enabled

#### 3.2. Submitting empty form shows validation error for the title field

**File:** `e2e/contact/contact-validation-empty-title.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: Page loads
  2. Leave all fields empty and click the 'Send' button
    - expect: An error message appears indicating the title/subject field is required (from i18n key contact.errorTitle)
    - expect: Form is not submitted (no success message)

#### 3.3. Submitting form with invalid email shows email validation error

**File:** `e2e/contact/contact-validation-invalid-email.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: Page loads
  2. Fill in the title field with 'Test Subject'
    - expect: Title field contains the text
  3. Fill in the email field with 'not-an-email' (invalid format)
    - expect: Email field contains the text
  4. Click the 'Send' button
    - expect: An error message appears indicating the email is invalid (from i18n key contact.errorEmail)
    - expect: Form is not submitted

#### 3.4. Submitting form with empty message shows content validation error

**File:** `e2e/contact/contact-validation-empty-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: Page loads
  2. Fill in title with 'Test Subject' and email with 'test@example.com', leave message empty
    - expect: Title and email fields are filled
  3. Click the 'Send' button
    - expect: An error message appears indicating the message/content field is required (from i18n key contact.errorContent)

#### 3.5. Successful form submission shows success state

**File:** `e2e/contact/contact-form-success.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: Page loads
  2. Fill in all three fields: Title='Hello', Email='test@example.com', Content='This is a test message'
    - expect: All fields are filled
  3. Click the 'Send' button
    - expect: Button text changes to 'Sending...' while the API call is in flight
    - expect: On API success, a green success message appears (from i18n key contact.success)
    - expect: Form fields are cleared after successful submission

#### 3.6. Enterprise plan prefill populates title when arriving from /pricing

**File:** `e2e/contact/contact-enterprise-prefill.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact?from=enterprise-plan
    - expect: Page loads
    - expect: The title/subject field is pre-filled with the enterprise inquiry text (from i18n key contact.enterprisePrefill)

#### 3.7. Submitting the form disables all fields during submission

**File:** `e2e/contact/contact-form-disabled-during-submit.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/contact
    - expect: Page loads
  2. Fill in all three fields with valid data and click 'Send'
    - expect: While the request is pending, all form inputs and the submit button are disabled
    - expect: Submit button shows 'Sending...' text

### 4. Community Hub (/community)

**Seed:** `e2e/home.public.spec.ts`

#### 4.1. Page displays hero section and three community tiles

**File:** `e2e/community/community-tiles.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page title contains the community meta title
    - expect: A heading and subtitle are visible in the hero section
    - expect: Three tile cards are visible: Blog, Documentation, Forum
    - expect: Each tile has an icon, heading, description, and an 'Explore' link with a right arrow

#### 4.2. Clicking Blog tile navigates to /blog

**File:** `e2e/community/community-blog-tile.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page loads
  2. Click the Blog tile card
    - expect: Browser navigates to /blog

#### 4.3. Clicking Documentation tile navigates to /documentation

**File:** `e2e/community/community-docs-tile.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page loads
  2. Click the Documentation tile card
    - expect: Browser navigates to /documentation (or /documentation/[default-slug])

#### 4.4. Clicking Forum tile navigates to /forum

**File:** `e2e/community/community-forum-tile.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page loads
  2. Click the Forum tile card
    - expect: Browser navigates to /forum

#### 4.5. Search bar with fewer than 2 characters does not open results panel

**File:** `e2e/community/community-search-min-chars.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page loads
  2. Click the search input and type a single character 'a'
    - expect: No search results panel opens

#### 4.6. Search with 2+ characters triggers API call and shows results panel

**File:** `e2e/community/community-search-results.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community
    - expect: Page loads
  2. Click the search input and type 'ag' (two or more characters)
    - expect: After a 200ms debounce, a search panel opens below the input
    - expect: Either a list of hits is shown (each with a title, source badge, and snippet) or a 'No results' message
    - expect: Hits are linkable — each is a NuxtLink to the result URL

#### 4.7. Pressing Escape closes the search panel and clears the query

**File:** `e2e/community/community-search-escape.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community and type 'agent' in the search bar
    - expect: Search panel opens
  2. Press the Escape key
    - expect: Search panel closes
    - expect: Search input is cleared

#### 4.8. Clicking outside the search container closes the results panel

**File:** `e2e/community/community-search-click-outside.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/community and type 'workflow' in the search bar to open the results panel
    - expect: Search panel opens
  2. Click anywhere outside the search container (e.g. the page heading)
    - expect: Search panel closes

### 5. Blog Index (/blog)

**Seed:** `e2e/home.public.spec.ts`

#### 5.1. Page renders heading and subtitle

**File:** `e2e/blog/blog-index-heading.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog
    - expect: Page title contains the blog meta title
    - expect: A main heading is visible
    - expect: A subtitle paragraph is visible

#### 5.2. Shows empty state message when no posts are published

**File:** `e2e/blog/blog-index-empty.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog when the Supabase blog_posts table has no published rows
    - expect: The empty state message is shown (from i18n key blog.empty)
    - expect: No article cards are rendered

#### 5.3. Published posts are listed with title, date, category, excerpt, and cover image

**File:** `e2e/blog/blog-index-posts.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog when at least one published post exists
    - expect: At least one article card is visible
    - expect: Each card shows the formatted publication date (e.g. 'Jun 8')
    - expect: Post title is a link to /blog/[slug]
    - expect: If present, the category label is displayed beside the date
    - expect: If present, a cover image or gradient placeholder is rendered

#### 5.4. Clicking a post title navigates to the post detail page

**File:** `e2e/blog/blog-index-post-link.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog when at least one post exists
    - expect: Post list is visible
  2. Click the title link of the first post
    - expect: Browser navigates to /blog/[the-post-slug]

#### 5.5. Unauthenticated visitor sees a sign-in link for newsletter subscription

**File:** `e2e/blog/blog-index-subscribe-anon.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog as an unauthenticated user
    - expect: A subscription hint line is visible with a 'Subscribe' link
    - expect: The Subscribe link points to /sign-in?redirect=/blog

#### 5.6. Authenticated non-subscribed visitor sees a scroll-to-newsletter button

**File:** `e2e/blog/blog-index-subscribe-auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog as an authenticated user who has not subscribed to the blog newsletter
    - expect: A subscription hint line is visible with a 'Subscribe' button (not a link)
    - expect: Clicking 'Subscribe' scrolls the page to the BlogSubscribeWidget section at the bottom (#blog-newsletter)

#### 5.7. Authenticated subscribed user does not see newsletter subscription prompt

**File:** `e2e/blog/blog-index-subscribed.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog as an authenticated user whose settings.blog_newsletter_subscribed is true
    - expect: The subscription hint line is not shown
    - expect: The BlogSubscribeWidget is not rendered at the bottom of the post list

### 6. Blog Post Detail (/blog/[slug])

**Seed:** `e2e/home.public.spec.ts`

#### 6.1. Valid published post renders title, date, category, cover image, and body

**File:** `e2e/blog/blog-post-detail.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog/[a-valid-published-slug]
    - expect: Page title contains the post title and '— Polymux Blog'
    - expect: Post heading (h1) displays the post title
    - expect: Publication date and category (if set) are shown in the header
    - expect: The cover image or gradient placeholder is rendered in a 16:9 ratio box
    - expect: The markdown body is rendered as HTML (paragraphs, headings, code blocks, lists, etc.)

#### 6.2. Back link navigates to /blog

**File:** `e2e/blog/blog-post-back-link.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog/[a-valid-slug]
    - expect: A '← All posts' link is visible at the top of the article
  2. Click '← All posts'
    - expect: Browser navigates to /blog

#### 6.3. Invalid or unpublished slug returns a 404 error page

**File:** `e2e/blog/blog-post-404.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog/this-slug-does-not-exist
    - expect: A Nuxt error page is rendered with statusCode 404
    - expect: The error message 'Post not found' or a standard 404 message is visible

#### 6.4. Code blocks in the body have a copy button

**File:** `e2e/blog/blog-post-code-copy.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog/[a-slug-whose-body-contains-a-code-block]
    - expect: A code block element is rendered with the agent-codeblock class structure
    - expect: A copy button is present inside the code block header
  2. Hover over the code block to reveal the copy button and click it
    - expect: The copy icon changes to a check icon briefly (is-copied state)
    - expect: After ~1.4 seconds the icon reverts to the copy icon

#### 6.5. OG meta tags are set from post data

**File:** `e2e/blog/blog-post-og-meta.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/blog/[a-valid-slug]
    - expect: <meta property='og:title'> matches the post title
    - expect: <meta property='og:description'> matches the post excerpt
    - expect: <meta property='og:type'> is 'article'
    - expect: If the post has a cover image, <meta property='og:image'> is set to the cover image URL
    - expect: If the post has a published_at date, <meta property='article:published_time'> is set

### 7. Forum Index (/forum)

**Seed:** `e2e/home.public.spec.ts`

#### 7.1. Page renders heading, subtitle, search bar, and Start Discussion button

**File:** `e2e/forum/forum-index-display.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum
    - expect: Page title is the forum page title
    - expect: A main heading is visible
    - expect: A subtitle paragraph is visible
    - expect: A search input is visible
    - expect: A 'Start Discussion' button/link is visible
    - expect: A 'Read guidelines' anchor link is visible

#### 7.2. Unauthenticated user is redirected to sign-in when clicking Start Discussion

**File:** `e2e/forum/forum-start-discussion-anon.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum as an unauthenticated user
    - expect: 'Start Discussion' is present
  2. Click 'Start Discussion'
    - expect: Browser navigates to /sign-in?redirect=/forum/new

#### 7.3. Category filter buttons filter the discussion list

**File:** `e2e/forum/forum-category-filter.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum
    - expect: 'All Posts' category button is active
    - expect: All discussions are shown
  2. Click a specific category button (e.g. 'Questions')
    - expect: The selected category button becomes active (filled dark style)
    - expect: 'All Posts' button becomes inactive
    - expect: The discussion list refreshes and shows only threads in that category (or empty state if none)

#### 7.4. Sort tabs (Latest / Top / Unanswered) change the sort order

**File:** `e2e/forum/forum-sort-tabs.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum
    - expect: 'Latest' tab is active by default with an underline indicator
  2. Click the 'Top' tab
    - expect: 'Top' tab becomes active
    - expect: Discussion list reloads from the API with sort=top
  3. Click the 'Unanswered' tab
    - expect: 'Unanswered' tab becomes active
    - expect: Discussion list reloads with sort=unanswered

#### 7.5. Search input filters discussions

**File:** `e2e/forum/forum-search.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum
    - expect: Discussion list loads
  2. Type a search term in the search input (e.g. 'workflow')
    - expect: Discussion list reloads with the search query applied
    - expect: Discussion count updates to reflect the filtered results

#### 7.6. Reset Filters button appears when filters are active and clears them

**File:** `e2e/forum/forum-reset-filters.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum and click a category filter
    - expect: Active filter is set
    - expect: A 'Reset Filters' button appears in the header area of the category section
  2. Click 'Reset Filters'
    - expect: Category reverts to 'All Posts'
    - expect: Search input is cleared
    - expect: Sort reverts to 'Latest'
    - expect: 'Reset Filters' button disappears

#### 7.7. Error state shows retry button when API request fails

**File:** `e2e/forum/forum-error-state.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum while the /api/forum/discussions endpoint is unavailable (simulate network error)
    - expect: An error icon and error message are displayed in the discussion list area
    - expect: A 'Try again' / 'Retry' button is visible
  2. Click the retry button
    - expect: The API request is retried
    - expect: If the retry succeeds, discussions load normally

#### 7.8. Pinned and answered badges show on discussion cards

**File:** `e2e/forum/forum-badges.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum when a pinned discussion exists
    - expect: The pinned discussion card shows a 'Pinned' badge
  2. When an answered discussion exists
    - expect: The answered discussion card shows a green 'Answered' badge

#### 7.9. Clicking a discussion card navigates to the discussion detail page

**File:** `e2e/forum/forum-discussion-link.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum when at least one discussion exists
    - expect: Discussion list is visible with at least one card
  2. Click the first discussion card
    - expect: Browser navigates to /forum/[discussion-id]

#### 7.10. Guidelines section is reachable via the anchor link

**File:** `e2e/forum/forum-guidelines.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum
    - expect: Page loads
  2. Click the 'Read guidelines' anchor link
    - expect: Page scrolls to the #guidelines section
    - expect: The guidelines section heading 'Before you post' (or i18n equivalent) is visible
    - expect: Three guideline cards are shown each with an icon, title, and description

### 8. New Forum Discussion (/forum/new)

**Seed:** `e2e/home.public.spec.ts`

#### 8.1. Unauthenticated user is redirected to sign-in

**File:** `e2e/forum/forum-new-anon-redirect.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an unauthenticated user
    - expect: Browser immediately redirects to /sign-in?redirect=/forum/new

#### 8.2. Authenticated user sees the new discussion form

**File:** `e2e/forum/forum-new-form-display.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: Page heading 'Start a Discussion' is visible
    - expect: A category selection fieldset is visible with multiple radio-style category labels
    - expect: A title input field is visible with a character count hint
    - expect: A body textarea is visible with a character count hint
    - expect: A 'Cancel' button and a 'Publish' button are visible

#### 8.3. Publish button is disabled until minimum requirements are met

**File:** `e2e/forum/forum-new-publish-disabled.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: Publish button is disabled (no category selected, no title, no body)
  2. Select a category
    - expect: Publish button is still disabled
  3. Type a title with at least 3 characters
    - expect: Publish button is still disabled (body not filled)
  4. Type a body with at least 10 characters
    - expect: Publish button becomes enabled

#### 8.4. Category radio selection highlights selected category card

**File:** `e2e/forum/forum-new-category-select.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: All category labels are unselected (border-neutral-200 style)
  2. Click a category label (e.g. 'Questions')
    - expect: The selected label gets the active border style (border-neutral-950 bg-neutral-50)
    - expect: The hidden radio input for that category is checked
    - expect: Other category labels remain unselected

#### 8.5. Title character count hint updates as user types

**File:** `e2e/forum/forum-new-title-counter.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: Title character count shows 0
  2. Type 'Hello World' in the title input
    - expect: Character count hint updates to show 11 (the length of 'Hello World')

#### 8.6. Back button navigates to /forum

**File:** `e2e/forum/forum-new-back.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: A '← Back to Forum' button is visible in the header
  2. Click '← Back to Forum'
    - expect: Browser navigates back (either browser history or to /forum if no history)

#### 8.7. Successfully submitting the form redirects to the new discussion page

**File:** `e2e/forum/forum-new-submit.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user
    - expect: Form is displayed
  2. Select a category, fill in a title (at least 3 chars), fill in a body (at least 10 chars), and click Publish
    - expect: Publish button text changes to 'Publishing...' and is disabled during submission
    - expect: On success, browser redirects to /forum/[new-discussion-id]

#### 8.8. API error during publish shows an inline error message

**File:** `e2e/forum/forum-new-submit-error.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/new as an authenticated user, fill in all required fields, and submit while the API is set to return an error
    - expect: An error message appears below the form fields in red
    - expect: Publish button is re-enabled after the error

### 9. Forum Discussion Detail (/forum/[id])

**Seed:** `e2e/home.public.spec.ts`

#### 9.1. Valid discussion renders title, author, body, and reply count

**File:** `e2e/forum/forum-detail-display.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-discussion-id]
    - expect: Discussion title is shown as an h1
    - expect: Author name and initials avatar are displayed
    - expect: Author initials are shown in a circular avatar
    - expect: Relative time stamp and view count are shown
    - expect: Discussion body text is rendered (whitespace-pre-wrap)
    - expect: Reply count section header is visible

#### 9.2. Discussion with no replies shows empty replies state

**File:** `e2e/forum/forum-detail-no-replies.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-discussion-with-no-replies]
    - expect: The replies section shows '0 Replies' or '0 replies' heading
    - expect: A dashed empty state box is shown with text indicating no replies yet

#### 9.3. Unauthenticated user sees sign-in CTA in the reply section

**File:** `e2e/forum/forum-detail-anon-reply.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-id] as an unauthenticated user
    - expect: The reply form textarea is NOT shown
    - expect: A sign-in prompt is shown with a 'Sign In' button and a 'Create account' link
    - expect: Sign In button links to /sign-in?redirect=/forum/[id]
    - expect: Create account link links to /sign-up?redirect=/forum/[id]

#### 9.4. Authenticated user sees the reply form

**File:** `e2e/forum/forum-detail-auth-reply-form.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-id] as an authenticated user
    - expect: A 'Your Reply' heading is visible
    - expect: A reply textarea is visible
    - expect: A character counter is visible below the textarea
    - expect: A 'Post Reply' button is visible and initially disabled (empty textarea)

#### 9.5. Authenticated user can post a reply

**File:** `e2e/forum/forum-detail-post-reply.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-id] as an authenticated user
    - expect: Reply form is visible
  2. Type a reply in the textarea and click 'Post Reply'
    - expect: Button changes to 'Posting...' while the request is in-flight
    - expect: On success, the textarea is cleared
    - expect: The replies list refreshes to include the new reply
    - expect: Page scrolls to the reply anchor (#forum-reply-anchor)

#### 9.6. Reply too long (over 20000 chars) shows validation error

**File:** `e2e/forum/forum-detail-reply-too-long.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-id] as an authenticated user
    - expect: Reply form is visible
  2. Fill the reply textarea with more than 20000 characters and click 'Post Reply'
    - expect: An error message appears (from i18n key forum.replyTooLong)
    - expect: No API request is made

#### 9.7. Category and pinned/answered badges render on the detail page

**File:** `e2e/forum/forum-detail-badges.public.spec.ts`

**Steps:**
  1. Navigate to a discussion that is pinned and answered
    - expect: A 'Pinned' badge is shown
    - expect: An 'Answered' badge in green is shown
    - expect: The category badge with the appropriate icon and label is shown

#### 9.8. Back button navigates to /forum

**File:** `e2e/forum/forum-detail-back.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/[a-valid-id]
    - expect: A '← Back to Forum' button is visible
  2. Click the back button
    - expect: Browser navigates back (browser history or to /forum)

#### 9.9. Error state provides a Return to Forum link

**File:** `e2e/forum/forum-detail-error.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forum/nonexistent-discussion-id
    - expect: An error panel is shown with an exclamation icon and error message
    - expect: A 'Return to Forum' link is present and navigates to /forum

### 10. Documentation (/documentation/[slug])

**Seed:** `e2e/home.public.spec.ts`

#### 10.1. Page renders with three-column layout on desktop (sidebar, content, ToC)

**File:** `e2e/docs/docs-layout.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-doc-slug] on a desktop viewport (1280px wide)
    - expect: A sticky top bar is visible with the Polymux logo/Docs link, a centered search bar, and a language picker in the top right
    - expect: A left sidebar is visible with collapsible section groups and nav links
    - expect: The main content area renders the markdown as HTML
    - expect: A right rail 'On This Page' ToC is visible for docs with multiple headings

#### 10.2. Left sidebar navigation links navigate to correct doc pages

**File:** `e2e/docs/docs-sidebar-nav.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[any-valid-slug]
    - expect: Left sidebar shows section headings and entry links
  2. Click a different documentation entry link in the sidebar
    - expect: Browser navigates to /documentation/[clicked-slug]
    - expect: The clicked entry is highlighted as active in the sidebar
    - expect: Main content area updates to the new page content

#### 10.3. Collapsible sidebar sections expand and collapse

**File:** `e2e/docs/docs-sidebar-collapse.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug] on desktop
    - expect: All sidebar sections are expanded by default (chevron rotated 90 degrees)
  2. Click a section heading in the sidebar
    - expect: That section collapses (chevron rotates back to 0 degrees)
    - expect: The entry links for that section are hidden
  3. Click the same section heading again
    - expect: Section expands again
    - expect: Entry links become visible

#### 10.4. Search bar opens results for a valid query

**File:** `e2e/docs/docs-search.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug]
    - expect: Search bar is visible in the top bar
  2. Click the search bar and type 'agent'
    - expect: A dropdown panel opens below the search bar
    - expect: Either search results are shown (title, section label, snippet with highlighted terms) or an empty message if no results
  3. Click a search result
    - expect: Search dropdown closes and search query clears
    - expect: Browser navigates to /documentation/[result-slug]

#### 10.5. Keyboard shortcut Ctrl+K or / opens the search bar

**File:** `e2e/docs/docs-search-shortcut.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug] and press Ctrl+K (or Cmd+K on Mac)
    - expect: The search input receives focus
  2. Press Escape
    - expect: Search dropdown closes and query is cleared
  3. Press / while the active element is not an input or textarea
    - expect: The search input receives focus

#### 10.6. Language picker changes locale and reloads content

**File:** `e2e/docs/docs-locale-picker.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug]
    - expect: Language picker button shows the current locale label (e.g. 'English')
  2. Click the language picker button
    - expect: A dropdown opens with all 8 available locales (English, Korean, Chinese, Japanese, German, French, Spanish, Portuguese)
  3. Select a different locale (e.g. 'French')
    - expect: Dropdown closes
    - expect: Language picker updates to show 'French'
    - expect: Documentation content reloads from the API with the new locale

#### 10.7. Right rail ToC highlights the currently visible heading on scroll

**File:** `e2e/docs/docs-toc-active.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-doc-with-multiple-headings] on a wide viewport
    - expect: Right rail ToC shows h2 and h3 headings
    - expect: First heading is highlighted (font-medium text-neutral-950 style)
  2. Scroll down in the docs content area past the first h2 heading
    - expect: The next h2 heading becomes the active entry in the right rail (highlighted style)

#### 10.8. Clicking a ToC entry scrolls to that heading

**File:** `e2e/docs/docs-toc-click.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-doc-with-multiple-headings] on a wide viewport
    - expect: Right rail ToC is visible
  2. Click a heading entry in the ToC
    - expect: The page scrolls smoothly to that heading
    - expect: The URL hash updates to #[heading-id]
    - expect: The clicked heading becomes active in the ToC

#### 10.9. Previous and Next navigation links appear and navigate correctly

**File:** `e2e/docs/docs-prev-next.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-middle-doc-slug] (a page with both a prev and next neighbour)
    - expect: A 'Previous' link and a 'Next' link are visible below the article body
    - expect: Each link shows the neighbour's title
  2. Click the 'Next' link
    - expect: Browser navigates to /documentation/[next-slug]

#### 10.10. Footer in the docs content shows Contact, Forum, and Privacy Policy links

**File:** `e2e/docs/docs-footer-links.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug] and scroll to the bottom of the content area
    - expect: A footer strip is visible showing the copyright year
    - expect: Links to /contact, /forum, and /privacy-policy are present

#### 10.11. Mobile sidebar toggle opens and closes the overlay sidebar

**File:** `e2e/docs/docs-mobile-sidebar.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-valid-slug] on a mobile viewport (375px)
    - expect: A hamburger menu icon button is visible in the top bar
    - expect: The desktop left sidebar is not visible
  2. Click the hamburger button
    - expect: A mobile sidebar slides in from the left
    - expect: A backdrop overlay appears
    - expect: The hamburger icon changes to an X close icon
  3. Click the backdrop overlay
    - expect: The mobile sidebar closes
    - expect: The backdrop disappears
    - expect: The icon reverts to hamburger

#### 10.12. Code block copy button in doc body copies code to clipboard

**File:** `e2e/docs/docs-code-copy.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/documentation/[a-slug-with-code-blocks]
    - expect: At least one code block is visible
  2. Hover over the code block to reveal the copy button and click it
    - expect: The button enters is-copied state (check icon shown, copy icon hidden)
    - expect: After ~1.4 seconds the state reverts to the copy icon

### 11. API Reference (/api-reference)

**Seed:** `e2e/home.public.spec.ts`

#### 11.1. Page renders heading, subtitle, and API reference content

**File:** `e2e/api-reference/api-ref-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/api-reference
    - expect: Page title is 'API Reference'
    - expect: The page heading from i18n key legalDocs.apiReference.title is visible
    - expect: The subtitle from i18n key legalDocs.apiReference.subtitle is visible
    - expect: The LegalDocPage component renders the doc-slug='api-reference' content

#### 11.2. Meta description is set correctly

**File:** `e2e/api-reference/api-ref-meta.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/api-reference
    - expect: <meta name='description'> contains 'Polymux REST API reference'

### 12. Privacy Policy (/privacy-policy)

**Seed:** `e2e/home.public.spec.ts`

#### 12.1. Page renders Privacy Policy content via LegalDocPage

**File:** `e2e/legal/privacy-policy-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/privacy-policy
    - expect: Page title is 'Privacy Policy'
    - expect: The heading from i18n key legalDocs.privacy.title is visible
    - expect: The subtitle from i18n key legalDocs.privacy.subtitle is visible
    - expect: The doc body content is rendered

#### 12.2. Meta description is set correctly

**File:** `e2e/legal/privacy-policy-meta.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/privacy-policy
    - expect: <meta name='description'> mentions personal information collection and user rights

### 13. Terms of Service (/terms-of-service)

**Seed:** `e2e/home.public.spec.ts`

#### 13.1. Page renders Terms of Service content via LegalDocPage

**File:** `e2e/legal/terms-of-service-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/terms-of-service
    - expect: Page title is 'Terms of Service' or equivalent
    - expect: A heading and subtitle are visible
    - expect: The LegalDocPage renders the doc-slug='terms-of-service' content body

### 14. Cookie Policy (/cookie-policy)

**Seed:** `e2e/home.public.spec.ts`

#### 14.1. Page renders Cookie Policy content via LegalDocPage

**File:** `e2e/legal/cookie-policy-content.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/cookie-policy
    - expect: Page title is 'Cookie Policy' or equivalent
    - expect: A heading and subtitle are visible
    - expect: The LegalDocPage renders the doc-slug='cookie-policy' content body

### 15. Unsubscribe Page (/unsubscribed)

**Seed:** `e2e/home.public.spec.ts`

#### 15.1. Without a token query param shows invalid state

**File:** `e2e/unsubscribed/unsubscribed-no-token.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed (no query params)
    - expect: An amber warning icon is shown
    - expect: An 'Invalid link' heading (from i18n key unsubscribe.invalidTitle) is visible
    - expect: A body message (unsubscribe.invalidBody) is visible
    - expect: No success state or resubscribe button is shown

#### 15.2. With a valid token shows processing then success state

**File:** `e2e/unsubscribed/unsubscribed-valid-token.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=[a-valid-unsubscribe-token]
    - expect: Initially a 'Processing...' loading message is shown (status=pending)
  2. Wait for the /api/mailing-list/unsubscribe POST to complete successfully
    - expect: A green check circle icon is shown
    - expect: A success heading (unsubscribe.successTitle) is visible
    - expect: A body message including the unsubscribed email address is shown
    - expect: A 'Resubscribe' button is visible and enabled
    - expect: A 'Go to Home' link is visible pointing to /

#### 15.3. With an invalid or expired token shows error state

**File:** `e2e/unsubscribed/unsubscribed-invalid-token.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=invalid-token-value
    - expect: API returns a 400 status
    - expect: An amber warning icon is shown
    - expect: The 'Invalid link' heading is visible (same as no-token state)

#### 15.4. API server error shows generic error state

**File:** `e2e/unsubscribed/unsubscribed-server-error.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=[any-token] while the unsubscribe API returns a 500 error
    - expect: A red error circle icon is shown
    - expect: An error heading (unsubscribe.errorTitle) is visible
    - expect: An error body message (unsubscribe.errorBody) is visible

#### 15.5. Resubscribe button triggers subscribe API and redirects to /blog#blog-newsletter

**File:** `e2e/unsubscribed/unsubscribed-resubscribe.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=[a-valid-token] and wait for success state to appear
    - expect: Resubscribe button is visible and enabled
  2. Click the 'Resubscribe' button
    - expect: Button text changes to 'Resubscribing...' and button is disabled
    - expect: On success, browser navigates to /blog#blog-newsletter

#### 15.6. Resubscribe API error shows inline error message

**File:** `e2e/unsubscribed/unsubscribed-resubscribe-error.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=[a-valid-token] and reach the success state
    - expect: Resubscribe button is visible
  2. Click 'Resubscribe' while the /api/mailing-list/subscribe endpoint returns an error
    - expect: An inline red error message appears above the buttons
    - expect: Button is re-enabled after the error

#### 15.7. Home link on success state navigates to /

**File:** `e2e/unsubscribed/unsubscribed-home-link.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/unsubscribed?token=[a-valid-token] and reach the success state
    - expect: A 'Go to Home' or equivalent link is visible
  2. Click the Home link
    - expect: Browser navigates to http://localhost:3000/
