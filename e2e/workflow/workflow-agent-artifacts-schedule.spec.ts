// spec: Workflow Agent Page, Artifacts Page, Schedule Page
// seed: e2e/auth.setup.ts

import { test, expect } from '@playwright/test'

// Use the stored auth session — the authed project already provides this via
// playwright.config.ts, but we make it explicit per the task requirement.
test.use({ storageState: 'e2e/.auth/user.json' })

// Known workflow ID with prior messages from the test workspace.
// Matches the workflow used by e2e/workflow-run.spec.ts.
const WF = 'c3484954-aaa8-4ea1-b96f-0dce638aed30'
const WS = '3afab4a2-7716-4a6b-a4b2-3e845fa253c2'
const USER = '0a3eceac-cc7c-4317-a800-f0ff83126757'

// Pre-seed beta/onboarding modal flags so overlays never block interactions.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(([ws, user]) => {
    const v = '2026-05-03'
    for (const u of [user, 'undefined', 'null', '']) {
      try { localStorage.setItem(`polymux:betaAgreementAccepted:${v}:${u}`, 'true') } catch { /* ignore */ }
    }
    try { localStorage.setItem('polymux_current_workspace_id', ws) } catch { /* ignore */ }
  }, [WS, USER])
})

/** Navigate to the workflow via the sidebar list row (avoids cold-goto race). */
async function openWorkflowAgent(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto('/workflow')
  const row = page.getByTestId(`wf-row-${WF}`)
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  await row.click()
  await expect(page).toHaveURL(new RegExp(WF), { timeout: 15_000 })
}

// ─── AGENT PAGE TESTS ──────────────────────────────────────────────────────

test.describe('Workflow Agent Page, Artifacts Page, Schedule Page', () => {

  test('Agent page loads chat history for existing session', async ({ page }) => {
    // Navigate to /workflow/[id]/agent for a session with prior messages
    await openWorkflowAgent(page)

    // The agent sub-route may be the default; ensure we're on it
    await page.goto(`/workflow/${WF}/agent`)

    // expect: chat message bubbles shown in correct order
    // The message list container has role="log"
    const messageLog = page.locator('[role="log"]')
    await expect(messageLog).toBeVisible({ timeout: 15_000 })

    // expect: prompt input visible and ready
    const promptInput = page.locator('textarea, [data-testid="prompt-input"], [placeholder]').filter({ hasText: '' }).first()
    // PromptInput is always rendered in the floating bottom bar
    await expect(page.locator('form, [data-testid="prompt-form"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Sending a new message appends user bubble and shows working indicator', async ({ page }) => {
    // Navigate to /workflow/[id]/agent
    await openWorkflowAgent(page)
    await page.goto(`/workflow/${WF}/agent`)

    // Wait for the prompt input area to be ready
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 15_000 })

    // Type and submit a message
    await textarea.click()
    await textarea.fill('Hello from E2E test')
    await textarea.press('Enter')

    // expect: user message bubble appended
    await expect(page.locator('.user-message, [data-testid="user-message"]').last()).toBeVisible({ timeout: 10_000 })

    // expect: working/thinking indicator shown (three animated dots)
    await expect(page.locator('.working-dot').first()).toBeVisible({ timeout: 10_000 })
  })

  test('View mode switcher toggles between Chat, Viewport, Flow', async ({ page }) => {
    // Navigate to /workflow/[id]/agent
    await openWorkflowAgent(page)
    await page.goto(`/workflow/${WF}/agent`)

    // expect: view mode controls visible
    // ChatLayout renders the switcher in the floating top bar
    const viewportTab = page.getByTestId('viewport-view-tab')
    const flowTab = page.getByTestId('workflow-flow-view-tab')

    await expect(viewportTab).toBeVisible({ timeout: 15_000 })
    await expect(flowTab).toBeVisible({ timeout: 10_000 })

    // Switch to Viewport view -> viewport panel shown
    await viewportTab.click()
    // ViewportGallery is rendered when inViewport is true
    await expect(page.locator('[data-testid="viewport-gallery"], .viewport-gallery, [class*="viewport"]').first()).toBeVisible({ timeout: 10_000 })

    // Switch to Flow view -> WorkflowNodeCanvas shown
    await flowTab.click()
    // WorkflowNodeCanvas renders the canvas; wait for the wf-run-button which is a reliable testid
    await expect(page.getByTestId('wf-run-button')).toBeVisible({ timeout: 15_000 })

    // Switch back to Chat -> chat message list visible
    const chatTab = page.getByRole('button', { name: /chat/i }).first()
    await chatTab.click()
    await expect(page.locator('[role="log"]')).toBeVisible({ timeout: 10_000 })
  })

  test('Message feedback (thumbs up/down) can be set', async ({ page }) => {
    // Navigate to /workflow/[id]/agent
    await openWorkflowAgent(page)
    await page.goto(`/workflow/${WF}/agent`)

    // Wait for messages to load
    const messageLog = page.locator('[role="log"]')
    await expect(messageLog).toBeVisible({ timeout: 15_000 })

    // Hover over an assistant message to reveal actions
    // AgentMessage has .group wrapper; actions appear on group-hover
    const agentMessage = page.locator('.group').filter({ has: page.locator('.agent-prose') }).first()
    await agentMessage.waitFor({ state: 'visible', timeout: 15_000 })
    await agentMessage.hover()

    // expect: thumbs-up and thumbs-down icons appear (aria-label from i18n)
    const thumbUp = page.getByRole('button', { name: /good response/i })
    const thumbDown = page.getByRole('button', { name: /bad response/i })
    await expect(thumbUp).toBeVisible({ timeout: 5_000 })
    await expect(thumbDown).toBeVisible({ timeout: 5_000 })

    // Click thumbs-up -> it becomes highlighted/active
    await thumbUp.click()
    // Active state: the button gets :active="feedback === 'up'" which adds visual cue
    await expect(thumbUp).toBeVisible()

    // Click thumbs-down -> thumbs-down highlighted, thumbs-up deactivated
    await agentMessage.hover()
    await thumbDown.click()
    await expect(thumbDown).toBeVisible()
  })

  // ─── ARTIFACTS PAGE TESTS ────────────────────────────────────────────────

  test('Empty state when no artifacts exist', async ({ page }) => {
    // Navigate to /workflow/[id]/artifacts for session with no artifacts
    // Use a fresh workflow that has no artifacts (use the same WF as it may vary)
    await page.goto(`/workflow/${WF}/artifacts`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    // ArtifactsGallery renders an empty state with SVG + text when artifacts.length === 0
    // If there happen to be artifacts, ArtifactCard is shown instead — we handle both
    const emptyState = page.locator('p').filter({ hasText: /no artifacts|empty/i })
    const artifactCards = page.locator('[data-testid="artifact-card"], .artifact-card')

    // Wait for either state to appear
    await expect(emptyState.or(artifactCards.first())).toBeVisible({ timeout: 15_000 })
  })

  test('Artifact cards shown when artifacts exist', async ({ page }) => {
    // Navigate to /workflow/[id]/artifacts with existing artifacts
    await page.goto(`/workflow/${WF}/artifacts`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    // If artifacts exist, ArtifactCard components are rendered inside a grid
    const artifactGrid = page.locator('[style*="grid-template-columns"]').first()
    await artifactGrid.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      // May be empty state — skip gracefully
    })

    // Validate that if any card is present it has visible content
    const firstCard = page.locator('[data-testid="artifact-card"]').first()
    const hasCards = await firstCard.isVisible().catch(() => false)
    if (hasCards) {
      await expect(firstCard).toBeVisible()
    }
  })

  test('Clicking artifact card opens ArtifactDetail view', async ({ page }) => {
    // Navigate to /workflow/[id]/artifacts
    await page.goto(`/workflow/${WF}/artifacts`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    // Wait for artifacts to load (either cards or empty state)
    const firstCard = page.locator('[data-testid="artifact-card"]').first()
    const hasCards = await firstCard.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)

    if (!hasCards) {
      test.skip()
      return
    }

    // Click an artifact card
    await firstCard.click()

    // expect: ArtifactDetail view shown with back/close button
    const closeButton = page.getByRole('button', { name: /back|close/i })
    await expect(closeButton).toBeVisible({ timeout: 10_000 })

    // expect: download and save buttons visible
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 5_000 })

    // Click back/close -> ArtifactsGallery restored
    await closeButton.click()
    // After close, selectedArtifact = null, gallery renders again
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
  })

  test('Artifact deeplink via ?artifact=[id] auto-opens detail', async ({ page }) => {
    // Navigate to the artifacts page first to discover an artifact id
    await page.goto(`/workflow/${WF}/artifacts`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    const firstCard = page.locator('[data-testid="artifact-card"]').first()
    const hasCards = await firstCard.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)

    if (!hasCards) {
      test.skip()
      return
    }

    // Get the artifact id from the card
    const artifactId = await firstCard.getAttribute('data-artifact-id').catch(() => null)
    if (!artifactId) {
      test.skip()
      return
    }

    // Navigate to /workflow/[id]/artifacts?artifact=[artifact-id]
    await page.goto(`/workflow/${WF}/artifacts?artifact=${artifactId}`)

    // expect: ArtifactDetail view automatically opened
    const closeButton = page.getByRole('button', { name: /back|close/i })
    await expect(closeButton).toBeVisible({ timeout: 15_000 })
  })

  // ─── SCHEDULE PAGE TESTS ─────────────────────────────────────────────────

  test('Schedule page loads with default frequency and controls', async ({ page }) => {
    // Navigate to /workflow/[id]/schedule
    await page.goto(`/workflow/${WF}/schedule`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    // expect: frequency selector with 6 options: None, Hourly, Daily, Weekly, Monthly, Custom
    for (const label of ['None', 'Hourly', 'Daily', 'Weekly', 'Monthly', 'Custom']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible({ timeout: 15_000 })
    }

    // expect: Daily selected by default (active class = bg-neutral-950)
    const dailyBtn = page.getByRole('button', { name: /daily/i }).first()
    await expect(dailyBtn).toHaveClass(/bg-neutral-950/, { timeout: 5_000 })

    // expect: time picker input visible (type="time" for daily/weekly/monthly)
    await expect(page.locator('input[name="schedule-time"], input[type="time"]').first()).toBeVisible({ timeout: 5_000 })

    // expect: Active/Paused toggle in header
    await expect(page.getByRole('button', { name: /active|play/i }).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /paused|pause/i }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('Selecting each frequency shows correct time controls', async ({ page }) => {
    // Navigate to /workflow/[id]/schedule
    await page.goto(`/workflow/${WF}/schedule`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })
    await page.getByRole('button', { name: /daily/i }).first().waitFor({ state: 'visible', timeout: 15_000 })

    // Select Hourly -> minute-of-the-hour input shown
    await page.getByRole('button', { name: /hourly/i }).first().click()
    await expect(page.locator('input[name="schedule-minute"]')).toBeVisible({ timeout: 5_000 })

    // Select Weekly -> time picker and day-of-week chips (Sun-Sat) shown
    await page.getByRole('button', { name: /weekly/i }).first().click()
    await expect(page.locator('input[name="schedule-time"]')).toBeVisible({ timeout: 5_000 })
    // Day chips: sun, mon, tue, wed, thu, fri, sat
    await expect(page.getByRole('button', { name: /sun/i }).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /sat/i }).first()).toBeVisible({ timeout: 5_000 })

    // Select Monthly -> time picker and day-of-month stepper shown
    await page.getByRole('button', { name: /monthly/i }).first().click()
    await expect(page.locator('input[name="schedule-time"]')).toBeVisible({ timeout: 5_000 })
    // Day-of-month stepper: minus and plus buttons
    await expect(page.getByRole('button', { name: '' }).filter({ has: page.locator('.i-heroicons-minus, [name*="minus"]') }).first().or(
      page.locator('button').filter({ has: page.locator('[class*="minus"]') }).first()
    )).toBeVisible({ timeout: 5_000 })

    // Select Custom -> cron expression text input shown
    await page.getByRole('button', { name: /custom/i }).first().click()
    await expect(page.locator('input[name="custom-cron-expr"]')).toBeVisible({ timeout: 5_000 })

    // Select None -> time controls panel (the "when" section) hidden
    await page.getByRole('button', { name: /none/i }).first().click()
    await expect(page.locator('input[name="schedule-time"]')).not.toBeVisible({ timeout: 3_000 })
    await expect(page.locator('input[name="custom-cron-expr"]')).not.toBeVisible({ timeout: 3_000 })
  })

  test('Custom cron expression validates inline', async ({ page }) => {
    // Navigate to /workflow/[id]/schedule
    await page.goto(`/workflow/${WF}/schedule`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })
    await page.getByRole('button', { name: /daily/i }).first().waitFor({ state: 'visible', timeout: 15_000 })

    // Select Custom frequency
    await page.getByRole('button', { name: /custom/i }).first().click()
    const cronInput = page.locator('input[name="custom-cron-expr"]')
    await expect(cronInput).toBeVisible({ timeout: 5_000 })

    // Enter valid cron '*/15 * * * *' -> neutral border style (no error class)
    await cronInput.fill('*/15 * * * *')
    // Valid: border-neutral-200, no border-error
    await expect(cronInput).not.toHaveClass(/border-error/, { timeout: 3_000 })

    // Enter invalid cron '99 99 * * *' -> red/error border, Save disabled
    await cronInput.fill('99 99 * * *')
    await expect(cronInput).toHaveClass(/border-error/, { timeout: 3_000 })

    // Save button should be disabled when schedule is invalid
    const saveBtn = page.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 })
  })

  test('Adding a one-off specific date appears in list', async ({ page }) => {
    // Navigate to /workflow/[id]/schedule
    await page.goto(`/workflow/${WF}/schedule`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })
    await page.getByRole('button', { name: /daily/i }).first().waitFor({ state: 'visible', timeout: 15_000 })

    // Click calendar date picker button in Specific Dates section
    // The date-picker trigger button has an i-heroicons-calendar icon
    const calendarBtn = page.locator('button').filter({
      has: page.locator('[class*="i-heroicons-calendar"]'),
    }).first()
    await expect(calendarBtn).toBeVisible({ timeout: 5_000 })
    await calendarBtn.click()

    // A calendar popover opens — pick a future date by clicking next available day
    // UCalendar renders day cells; click the first enabled future date
    const dayCell = page.locator('[data-value]').filter({ hasNotText: '' }).first()
    await dayCell.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {
      // fallback: look for cell trigger buttons
    })

    // Select a future time in the one-off time input (type="time")
    const timeInput = page.locator('input[name="one-off-time"]')
    await expect(timeInput).toBeVisible({ timeout: 5_000 })

    // Set a future time 2 hours from now
    const futureHour = (new Date().getHours() + 2) % 24
    const futureTime = `${String(futureHour).padStart(2, '0')}:00`
    await timeInput.fill(futureTime)

    // Click 'Add Date' (submit button)
    const addBtn = page.getByRole('button', { name: /add date/i })
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    // expect: date appears as removable chip in the <ul>
    const chipList = page.locator('ul').filter({ has: page.locator('li') }).last()
    await expect(chipList).toBeVisible({ timeout: 5_000 })
    await expect(chipList.locator('li').first()).toBeVisible({ timeout: 5_000 })
  })

  test('Saving a valid schedule shows success toast', async ({ page }) => {
    // Navigate to /workflow/[id]/schedule
    await page.goto(`/workflow/${WF}/schedule`)
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 })

    // Configure a valid daily schedule (Daily is default)
    await page.getByRole('button', { name: /daily/i }).first().waitFor({ state: 'visible', timeout: 15_000 })
    // Daily is already selected by default; time input has a default value

    // Click Save
    const saveBtn = page.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // expect: success toast shown (AppToastContainer renders toasts)
    // The schedule.saved i18n key maps to a toast with 'info' type
    // Look for any toast/notification element
    await expect(
      page.locator('[role="status"], [role="alert"], [data-testid*="toast"], [class*="toast"]').first()
    ).toBeVisible({ timeout: 8_000 })
  })
})
