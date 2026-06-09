# Polymux Web App — Comprehensive Test Plan

## Application Overview

Polymux is a Nuxt 4 SaaS platform for AI workflow automation. Users can create and run AI-powered workflows (chat-based agent sessions), schedule them to run automatically, view artifacts produced by runs, and monitor active/scheduled runs from a central dashboard console. The app uses Supabase for auth, has a persistent SidePanel sidebar, PageHeader tabs, and routes protected behind sign-in.

## Test Scenarios

### 1. Authentication

**Seed:** `e2e/auth.setup.ts`

#### 1.1. Unauthenticated access redirects to sign-in

**File:** `tests/auth/redirect-unauthenticated.spec.ts`

**Steps:**
  1. Open a fresh browser (no stored session) and navigate to /dashboard
    - expect: The browser is redirected to /sign-in
    - expect: The sign-in form is displayed with email and password fields
  2. Navigate directly to /workflow
    - expect: The browser is redirected to /sign-in
  3. Navigate directly to /vault
    - expect: The browser is redirected to /sign-in

#### 1.2. Sign in with valid credentials

**File:** `tests/auth/sign-in-valid.spec.ts`

**Steps:**
  1. Navigate to /sign-in
    - expect: The sign-in page loads with fields for email (#signin-email) and password (#signin-password) and a submit button
  2. Enter valid credentials (TEST_USERNAME / TEST_PASSWORD) and click the submit button
    - expect: The page redirects away from /sign-in
    - expect: The persistent SidePanel is visible
    - expect: The user is on an authenticated page (e.g. /dashboard/console)

#### 1.3. Sign in with invalid credentials shows error

**File:** `tests/auth/sign-in-invalid.spec.ts`

**Steps:**
  1. Navigate to /sign-in
    - expect: The sign-in form is displayed
  2. Enter an invalid email address (e.g. notauser@example.com) and password (wrongpassword) then click submit
    - expect: The URL remains /sign-in
    - expect: A [role=alert] error message is visible explaining the authentication failure

#### 1.4. Sign in with empty fields shows validation

**File:** `tests/auth/sign-in-empty.spec.ts`

**Steps:**
  1. Navigate to /sign-in and click the submit button without entering any credentials
    - expect: The form does not submit
    - expect: Validation feedback (HTML5 required or inline error) is shown on the empty fields

### 2. Dashboard — Console (/dashboard/console)

**Seed:** `e2e/auth.setup.ts`

#### 2.1. /dashboard redirects to /dashboard/console

**File:** `tests/dashboard/redirect.spec.ts`

**Steps:**
  1. Sign in and navigate to /dashboard
    - expect: The browser redirects to /dashboard/console without a 404 or error page

#### 2.2. Console page loads all three stat cards

**File:** `tests/dashboard/stat-cards.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console as an authenticated user
    - expect: The page heading 'Console' (or i18n equivalent) is visible
  2. Observe the stat strip at the top of the page
    - expect: Three stat cards are rendered: 'Active Runs', 'Schedules', and 'Runs/mo'
    - expect: Each card displays a numeric value (0 or greater) in a monospace font

#### 2.3. Active runs section shows empty state when no runs are live

**File:** `tests/dashboard/active-runs-empty.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console with no actively-running workflows
    - expect: The 'Active Runs' section is visible
    - expect: A dashed-border empty state with a bolt icon and 'No active runs' message is shown
    - expect: The live badge reads '0 live'

#### 2.4. Active run row links to /workflow/[id]/agent

**File:** `tests/dashboard/active-run-link.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console when at least one workflow is actively running
    - expect: The active run appears as a list row with a green spinner/progress icon, a title, and a kind label (Chat or Workflow)
  2. Click the active run row
    - expect: The browser navigates to /workflow/[id]/agent for that run

#### 2.5. Schedules section shows empty state when no schedules exist

**File:** `tests/dashboard/schedules-empty.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console with no active schedules configured
    - expect: The 'Schedules' section is visible
    - expect: A dashed-border empty state with a calendar icon and 'No schedules' message is shown
    - expect: The badge reads '0 active'

#### 2.6. Schedule row links to /workflow/[id]/schedule

**File:** `tests/dashboard/schedule-row-link.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console when at least one workflow has an active schedule
    - expect: A schedule row is shown with the workflow name, frequency label (e.g. Daily), runs/mo count, timezone, and next-run time
  2. Click the workflow name link in the schedule row
    - expect: The browser navigates to /workflow/[id]/schedule for that workflow

#### 2.7. Recent runs section shows up to 10 non-draft sessions

**File:** `tests/dashboard/recent-runs.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console as a user with prior workflow runs
    - expect: The 'Recent Runs' section is visible
    - expect: Up to 10 rows appear, each showing a title, a coloured status dot (green = running, grey = stopped), and a relative timestamp
  2. Click a recent run row
    - expect: The browser navigates to /workflow/[id]/agent for that session

#### 2.8. View All button navigates to /workflow

**File:** `tests/dashboard/view-all.spec.ts`

**Steps:**
  1. Navigate to /dashboard/console and click the 'View All' button in the Recent Runs section header
    - expect: The browser navigates to /workflow (or is redirected to the last-viewed workflow or draft)

### 3. Workflow List / Index (/workflow)

**Seed:** `e2e/auth.setup.ts`

#### 3.1. /workflow redirects to the last-viewed session or draft

**File:** `tests/workflow/index-redirect.spec.ts`

**Steps:**
  1. Sign in and navigate to /workflow in a fresh browser tab (no sessionStorage entry for TAB_LAST_WORKFLOW_KEY)
    - expect: The page redirects to /workflow/new (draft) if no prior session is stored, showing the new workflow welcome screen
  2. Open a real workflow session, then navigate back to /workflow in the same tab
    - expect: The page redirects to /workflow/[id]/agent for the previously-visited session (restored from sessionStorage)

### 4. New Workflow (/workflow/new)

**Seed:** `e2e/auth.setup.ts`

#### 4.1. New workflow page shows welcome ChatLayout with prompt input

**File:** `tests/workflow/new-welcome.spec.ts`

**Steps:**
  1. Navigate to /workflow/new as an authenticated user
    - expect: The page header shows a single 'Agent' tab
    - expect: A welcome message or prompt area is visible
    - expect: A PromptInput composer (text area and send button) is visible at the bottom

#### 4.2. Sending a prompt from /workflow/new creates a session and navigates to agent page

**File:** `tests/workflow/new-send-prompt.spec.ts`

**Steps:**
  1. Navigate to /workflow/new
    - expect: The prompt input is present and enabled
  2. Type a non-empty prompt (e.g. 'Hello, what can you do?') into the prompt input and press Enter or click Send
    - expect: A new session ID is allocated
    - expect: The browser navigates to /workflow/[new-id]/agent
    - expect: A user message bubble with the typed prompt is visible in the chat
    - expect: A working/thinking indicator appears while the agent processes the request

#### 4.3. Welcome suggestion button sends preset prompt

**File:** `tests/workflow/new-welcome-suggestion.spec.ts`

**Steps:**
  1. Navigate to /workflow/new and click the welcome suggestion button (e.g. 'Show me something cool')
    - expect: The preset prompt is sent
    - expect: The browser navigates to /workflow/[id]/agent
    - expect: A user message bubble for the preset prompt is displayed

#### 4.4. Empty prompt cannot be submitted

**File:** `tests/workflow/new-empty-prompt.spec.ts`

**Steps:**
  1. Navigate to /workflow/new and attempt to submit an empty or whitespace-only prompt
    - expect: No navigation occurs
    - expect: No session is created
    - expect: The user remains on /workflow/new

### 5. Workflow Detail Layout (/workflow/[id])

**Seed:** `e2e/auth.setup.ts`

#### 5.1. Stale or unknown workflow ID redirects to /workflow/new

**File:** `tests/workflow/detail-stale-id.spec.ts`

**Steps:**
  1. Navigate to /workflow/00000000-0000-0000-0000-000000000000/agent (a non-existent ID) as an authenticated user
    - expect: Once the session list loads, the browser redirects to /workflow/new

#### 5.2. Page header shows Agent, Schedule, and Artifacts tabs for a valid workflow

**File:** `tests/workflow/detail-tabs.spec.ts`

**Steps:**
  1. Navigate to /workflow/[valid-id]/agent for an existing session
    - expect: The PageHeader displays three tabs: Agent, Schedule, and Artifacts
  2. Click the 'Schedule' tab
    - expect: The URL changes to /workflow/[id]/schedule
    - expect: The schedule editor panel is visible
  3. Click the 'Artifacts' tab
    - expect: The URL changes to /workflow/[id]/artifacts
    - expect: The artifacts gallery (or empty state) is visible
  4. Click the 'Agent' tab
    - expect: The URL changes back to /workflow/[id]/agent
    - expect: The chat interface is visible and the conversation history is preserved (keepalive)

#### 5.3. Workflow title can be renamed inline

**File:** `tests/workflow/detail-rename.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/agent for a session with a title
    - expect: The workflow title is displayed in the header
  2. Click the title to enter rename mode and type a new name, then confirm (press Enter or click away)
    - expect: The title is updated in the header
    - expect: A rename API call is made for the session

### 6. Workflow Agent Page (/workflow/[id]/agent)

**Seed:** `e2e/auth.setup.ts`

#### 6.1. Agent page loads chat history for an existing session

**File:** `tests/workflow/agent-load-history.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/agent for a session that has prior messages
    - expect: Chat message bubbles for prior user and assistant messages are displayed in the correct order
    - expect: The prompt input is visible and ready for a new message

#### 6.2. Sending a new message appends user bubble and shows working indicator

**File:** `tests/workflow/agent-send-message.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/agent and type a message in the prompt input
    - expect: The send button is enabled
  2. Submit the message (press Enter or click Send)
    - expect: A user message bubble with the entered text is appended to the chat
    - expect: A working/thinking indicator (spinner, dots, or animated icon) is shown while the agent processes
    - expect: An assistant response bubble eventually appears

#### 6.3. View mode switcher toggles between Chat, Viewport, and Flow views

**File:** `tests/workflow/agent-view-modes.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/agent
    - expect: View mode controls are visible in the ChatLayout toolbar (unless hide-view-switch is set)
  2. Switch to Viewport view
    - expect: The viewport panel (browser screenshots / screencast) is shown instead of the chat panel
  3. Switch to Flow view
    - expect: The WorkflowNodeCanvas (node graph) is shown
  4. Switch back to Chat view
    - expect: The chat message list is visible again

#### 6.4. Message feedback (thumbs up/down) can be set and updated

**File:** `tests/workflow/agent-message-feedback.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/agent and hover over an assistant message bubble
    - expect: Thumbs-up and thumbs-down feedback icons appear
  2. Click the thumbs-up icon
    - expect: The thumbs-up icon is highlighted/active
    - expect: The rating is persisted via the API
  3. Click the thumbs-down icon on the same message
    - expect: The thumbs-down icon is highlighted and thumbs-up is deactivated
  4. Click the active thumbs-down icon again to clear the rating
    - expect: Both icons return to inactive state and the rating is cleared

### 7. Workflow Artifacts Page (/workflow/[id]/artifacts)

**Seed:** `e2e/auth.setup.ts`

#### 7.1. Artifacts gallery shows empty state when no artifacts exist

**File:** `tests/workflow/artifacts-empty.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts for a session with no produced artifacts
    - expect: The ArtifactsGallery renders an empty state (icon + descriptive message)

#### 7.2. Artifact cards are shown when artifacts exist

**File:** `tests/workflow/artifacts-list.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts for a session that produced artifacts
    - expect: ArtifactCard components are rendered, each showing a filename/title and action icons

#### 7.3. Clicking an artifact card opens the ArtifactDetail view

**File:** `tests/workflow/artifacts-detail.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts and click an artifact card
    - expect: The ArtifactDetail view replaces the gallery
    - expect: A back button is visible
    - expect: The artifact's name and content (or preview) are displayed
    - expect: Download and Save (promote) action buttons are visible
  2. Click the back/close button
    - expect: The ArtifactsGallery is restored

#### 7.4. Downloading an artifact triggers a browser download

**File:** `tests/workflow/artifacts-download.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts and click the download icon on an artifact card (or in the detail view)
    - expect: A browser file download is initiated for that artifact
    - expect: No error toast is shown

#### 7.5. Saving (promoting) an artifact to storage opens the promote modal

**File:** `tests/workflow/artifacts-promote.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts and click the save/promote icon on an artifact
    - expect: The ArtifactPromoteModal opens with a path input field
  2. Enter a valid storage path and click Confirm
    - expect: The modal closes
    - expect: A success toast 'Promoted to [path]' appears
  3. Open the promote modal again and click Cancel or close the modal
    - expect: The modal closes without promoting the artifact and no toast is shown

#### 7.6. Deleting an artifact removes it from the gallery

**File:** `tests/workflow/artifacts-delete.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts and click the delete icon on an artifact card
    - expect: A confirmation is requested (if applicable) or the artifact is immediately removed
  2. Confirm the deletion
    - expect: The artifact card disappears from the gallery
    - expect: No error toast is shown

#### 7.7. Artifact deeplink via ?artifact=[id] query parameter auto-opens detail view

**File:** `tests/workflow/artifacts-deeplink.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/artifacts?artifact=[artifact-id] for an existing artifact
    - expect: Once the artifact list loads, the ArtifactDetail view is automatically opened for the specified artifact

### 8. Workflow Schedule Page (/workflow/[id]/schedule)

**Seed:** `e2e/auth.setup.ts`

#### 8.1. Schedule page loads with default frequency (Daily) and controls

**File:** `tests/workflow/schedule-default.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule for a workflow with no saved schedule
    - expect: The frequency selector shows 6 options: None, Hourly, Daily, Weekly, Monthly, Custom
    - expect: Daily is selected by default
    - expect: A time picker input is visible
    - expect: An Active/Paused toggle is visible in the header
    - expect: A Save button is visible (disabled until a valid schedule is set or a one-off date is added)

#### 8.2. Selecting each frequency shows the correct time controls

**File:** `tests/workflow/schedule-frequency-controls.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule and click the 'Hourly' frequency option
    - expect: A minute-of-the-hour text input is shown (e.g. ':00')
  2. Click the 'Weekly' frequency option
    - expect: A time picker and 7 day-of-week chips (Sun through Sat) are shown
    - expect: Mon–Fri are selected by default
  3. Click the 'Monthly' frequency option
    - expect: A time picker and a day-of-month stepper (1–31) are shown
  4. Click the 'Custom' frequency option
    - expect: A cron expression text input is shown with a default value (e.g. '0 9 * * *')
  5. Click the 'None' frequency option
    - expect: The time controls panel is hidden

#### 8.3. Custom cron expression validates inline

**File:** `tests/workflow/schedule-cron-validation.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule and select 'Custom' frequency
    - expect: The cron input is shown
  2. Enter a valid cron expression (e.g. '*/15 * * * *')
    - expect: The input has a neutral/valid border style
    - expect: The timeline updates to show next/past run times matching the expression
  3. Clear the input and enter an invalid cron expression (e.g. '99 99 * * *')
    - expect: The input border turns red/error colour
    - expect: The Save button remains disabled

#### 8.4. Timezone selector opens, filters, and applies a timezone

**File:** `tests/workflow/schedule-timezone.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule and click the timezone button in the header
    - expect: A dropdown panel opens showing pinned timezones (local TZ + UTC) and a full list
    - expect: A search input is present
  2. Type 'Tokyo' in the timezone search input
    - expect: The list filters to show Asia/Tokyo
  3. Click Asia/Tokyo
    - expect: The panel closes
    - expect: The timezone button label updates to 'Tokyo' with the UTC offset
    - expect: The timeline run times reflect the selected timezone

#### 8.5. Adding a one-off specific date appends it to the chip list and timeline

**File:** `tests/workflow/schedule-one-off-add.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule and click the calendar date picker button in the Specific Dates section
    - expect: A UCalendar popover opens showing the current month
  2. Select a future date (at least tomorrow) from the calendar
    - expect: The calendar closes
    - expect: The chosen date is displayed in the date picker button label
  3. Set a future time in the time input, then click 'Add Date'
    - expect: The date appears as a removable chip in the specific-dates list
    - expect: The timeline scrolls to show the newly added date

#### 8.6. Removing a one-off date deletes it from the list

**File:** `tests/workflow/schedule-one-off-remove.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule, add a one-off date (see previous test), then click the X button on the chip
    - expect: The chip is removed from the specific-dates list
    - expect: The timeline no longer shows that date as a removable entry

#### 8.7. Cannot add a one-off date in the past

**File:** `tests/workflow/schedule-one-off-past.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule and attempt to set a time that is in the past for today's date in the date picker
    - expect: The time input automatically bumps to the next valid minute in the future
    - expect: The 'Add Date' button remains disabled until a valid future time is selected

#### 8.8. Activating a schedule on a workflow without a saved version shows a warning

**File:** `tests/workflow/schedule-activate-no-version.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule for a workflow that has never been saved as a version (a fresh draft or new session)
    - expect: The Active toggle is not available or is disabled
  2. Attempt to click the Active (play) button
    - expect: A warning toast is shown: the workflow must have a saved version before the schedule can be activated
    - expect: The schedule remains in Paused state

#### 8.9. Saving a valid schedule persists it and shows a success toast

**File:** `tests/workflow/schedule-save.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule for a workflow with a saved version, configure a valid daily schedule, and click Save
    - expect: A success toast 'Saved' (or i18n equivalent) is shown
    - expect: The schedule is persisted and visible on the dashboard console

#### 8.10. Timeline recenter button scrolls the 'now' marker into view

**File:** `tests/workflow/schedule-timeline-recenter.spec.ts`

**Steps:**
  1. Navigate to /workflow/[id]/schedule with a configured schedule that produces a visible timeline
    - expect: The timeline panel shows past and future run items with a green 'now' dot
  2. Scroll the timeline list away from center, then click the 'Recenter' button
    - expect: The timeline scrolls smoothly back so the next upcoming run (or 'now' marker) is centered in the viewport
