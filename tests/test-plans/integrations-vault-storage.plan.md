# Polymux Web — Integrations, Vault, and Storage Test Plan

## Application Overview

Polymux is a Nuxt 4 SaaS platform for AI-powered browser automation workflows. This test plan covers the Integrations section (Installed, Marketplace, Publish, and custom pages), the Vault section (Accounts and Wallet), and the Storage section (Files and Settings). All tests assume a fresh authenticated session as a workspace Owner on the Free plan. The app redirects /integrations to /integrations/installed and /vault to /vault/accounts. Each test assumes the onboarding modal has already been dismissed and the beta agreement accepted, unless the test explicitly covers those flows.

## Test Scenarios

### 1. Integrations — Installed

**Seed:** `e2e/auth.setup.ts`

#### 1.1. Redirects /integrations to /integrations/installed

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/integrations
    - expect: The browser URL becomes /integrations/installed
    - expect: The Installed tab in the top navigation is active

#### 1.2. Installed page renders correctly with installed integrations

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/integrations/installed
    - expect: The page header shows three navigation tabs: Installed, Marketplace, Publish
    - expect: A search box with placeholder 'Search installed…' is visible
    - expect: A 'Filter by' button and a 'Sort by' button are visible
    - expect: At least one integration card is shown (e.g. Google Drive)

#### 1.3. Search filters installed integrations

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to /integrations/installed
    - expect: The installed integrations list is visible
  2. Type 'Google' into the 'Search installed…' text box
    - expect: Only integrations whose name contains 'Google' remain visible
    - expect: Integrations not matching the query are hidden
  3. Clear the search box
    - expect: All previously visible integrations are restored

#### 1.4. Search with no results shows empty state

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to /integrations/installed
    - expect: The installed integrations list is visible
  2. Type a string that matches no integration, e.g. 'xyznotexist'
    - expect: No integration cards are shown
    - expect: An empty state message or visual indicator is displayed

#### 1.5. Opens integration detail dialog on card click

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to /integrations/installed
    - expect: Integration cards are visible
  2. Click the Google Drive integration card
    - expect: A dialog titled 'Google Drive' appears
    - expect: The dialog shows an About section with the description
    - expect: The dialog shows a Status section indicating 'Active' and the connected email
    - expect: The dialog shows a Settings section
    - expect: A 'Disconnect' button is visible in the dialog header
    - expect: Category tags (Files, Storage, Cloud) are shown in the dialog banner

#### 1.6. Closes integration detail dialog

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Click the Google Drive integration card to open its dialog
    - expect: The dialog is open
  2. Click the Close button (X) on the dialog
    - expect: The dialog closes
    - expect: The main installed integrations list is visible again

#### 1.7. Filter by button opens a filter menu

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to /integrations/installed
    - expect: The toolbar with Filter by button is visible
  2. Click the 'Filter by' button
    - expect: A dropdown or popover with filter options appears

#### 1.8. Sort by button opens a sort menu

**File:** `tests/integrations/installed.spec.ts`

**Steps:**
  1. Navigate to /integrations/installed
    - expect: The toolbar with Sort by button is visible
  2. Click the 'Sort by' button
    - expect: A dropdown or popover with sort options appears

### 2. Integrations — Marketplace

**Seed:** `e2e/auth.setup.ts`

#### 2.1. Marketplace page renders correctly

**File:** `tests/integrations/marketplace.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/integrations/marketplace
    - expect: The Marketplace tab in the top navigation is active
    - expect: A search box with placeholder 'Search marketplace…' is visible
    - expect: A 'Filter by' button and a 'Sort by' button are visible
    - expect: Integration cards are shown

#### 2.2. Search filters marketplace integrations

**File:** `tests/integrations/marketplace.spec.ts`

**Steps:**
  1. Navigate to /integrations/marketplace
    - expect: Integration cards are visible
  2. Type 'Google' into the search box
    - expect: Only matching integrations remain visible
  3. Clear the search input
    - expect: All integrations are restored

#### 2.3. Clicking an already-installed card opens its detail dialog

**File:** `tests/integrations/marketplace.spec.ts`

**Steps:**
  1. Navigate to /integrations/marketplace
    - expect: Integration cards are displayed
  2. Click an integration card for an already-installed integration (e.g. Google Drive)
    - expect: A detail dialog opens
    - expect: The dialog has a 'Disconnect' button since the integration is already installed

#### 2.4. Clicking an uninstalled card shows Install option

**File:** `tests/integrations/marketplace.spec.ts`

**Steps:**
  1. Navigate to /integrations/marketplace
    - expect: Integration cards are displayed
  2. Click an integration that is not yet installed
    - expect: A detail dialog opens
    - expect: An 'Install' or 'Connect' button is visible instead of 'Disconnect'

#### 2.5. Navigation tabs switch between Installed and Marketplace

**File:** `tests/integrations/marketplace.spec.ts`

**Steps:**
  1. Navigate to /integrations/marketplace
    - expect: The Marketplace tab is active
  2. Click the 'Installed' tab link
    - expect: The browser navigates to /integrations/installed
    - expect: The Installed tab becomes active

### 3. Integrations — Publish (listing page)

**Seed:** `e2e/auth.setup.ts`

#### 3.1. Publish page renders correctly with empty state

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/integrations/publish
    - expect: The Publish tab in the top navigation is active
    - expect: A search box with placeholder 'Search your listings…' is visible
    - expect: A 'New' button, 'Filter by' button, and 'Sort by' button are visible
    - expect: A 'Documentation' link to /documentation/plugin-overview is shown in the header
    - expect: An empty state paragraph reads 'Nothing published yet' with instructions to click New

#### 3.2. Clicking New button opens the type selection dialog

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish
    - expect: The page is loaded
  2. Click the 'New' button
    - expect: A dialog titled 'What kind of thing are you publishing?' appears
    - expect: Three options are displayed: Connection (Code-based), Workflow, and Plugin

#### 3.3. Selecting Connection from dialog opens Connection form

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Click the 'New' button to open the type selection dialog
    - expect: The type selection dialog is open
  2. Click the 'Connection' option
    - expect: The dialog content changes to a Connection form
    - expect: A 'Manifest URL' text field with placeholder 'https://github.com/you/repo/raw/main/polymux.json' is shown
    - expect: A 'Publish' button is present and disabled
    - expect: A 'Back' button is present to return to type selection

#### 3.4. Selecting Workflow from dialog opens Workflow form

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Click the 'New' button and then click 'Workflow'
    - expect: A Workflow form is shown
    - expect: A 'Workflow' combobox for selecting an existing workflow is present
    - expect: Name, Description, Tags, and Icon URL text fields are visible
    - expect: A Slug field shows 'author/name' auto-generated format
    - expect: The 'Publish' button is disabled until required fields are filled

#### 3.5. Selecting Plugin from dialog opens Plugin form

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Click 'New' and then click 'Plugin'
    - expect: A Plugin form is shown with Name, Description, Tags, and Icon URL fields
    - expect: A 'Bundle items' section with empty state 'No items in this bundle yet.' is visible
    - expect: The 'Publish' button is disabled

#### 3.6. Connection Publish button stays disabled when Manifest URL is empty

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Open the Connection form via the New button
    - expect: The Manifest URL field is empty
  2. Leave the Manifest URL field empty
    - expect: The 'Publish' button remains disabled

#### 3.7. Connection Publish button enables when Manifest URL is filled

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Open the Connection form via the New button
    - expect: The Manifest URL field is visible
  2. Type a URL into the Manifest URL field, e.g. 'https://example.com/polymux.json'
    - expect: The 'Publish' button becomes enabled

#### 3.8. Closing the type selection dialog returns to the listing

**File:** `tests/integrations/publish.spec.ts`

**Steps:**
  1. Click New to open the dialog
    - expect: The dialog is open
  2. Click the Close (X) button on the dialog
    - expect: The dialog closes
    - expect: The user is back on the publish listing page

### 4. Integrations — Publish New (standalone page)

**Seed:** `e2e/auth.setup.ts`

#### 4.1. Publish/new page shows all four publishing type options

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/integrations/publish/new
    - expect: The heading 'What kind of thing are you publishing?' is shown
    - expect: Four option buttons are visible: Connection, Workflow, Plugin, Layout
    - expect: A Back link points to /integrations/publish

#### 4.2. Back link on publish/new returns to publish listing

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new
    - expect: The page is loaded
  2. Click the 'Back' link
    - expect: The browser navigates to /integrations/publish

#### 4.3. Clicking Connection navigates to the Connection form page

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new and click 'Connection'
    - expect: The browser navigates to /integrations/publish/new/integration
    - expect: Heading reads 'Connection'
    - expect: A Manifest URL field is shown
    - expect: A Back link pointing to /integrations/publish/new is present

#### 4.4. Clicking Workflow navigates to the Workflow form page

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new and click 'Workflow'
    - expect: The browser navigates to /integrations/publish/new/workflow
    - expect: Heading reads 'Workflow'
    - expect: Fields for Workflow, Name, Slug, Description, Tags, and Icon URL are visible

#### 4.5. Clicking Plugin navigates to the Plugin form page

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new and click 'Plugin'
    - expect: The browser navigates to /integrations/publish/new/plugin
    - expect: Heading reads 'Plugin'
    - expect: Fields for Name, Slug, Description, Tags, Icon URL, and Bundle items are visible

#### 4.6. Clicking Layout navigates to the Layout form page

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new and click 'Layout'
    - expect: The browser navigates to /integrations/publish/new/layout
    - expect: Heading reads 'Layout'
    - expect: Fields for Name, Slug, Section (combobox), Body (HTML editor), Description, Tags, and Icon URL are visible
    - expect: The Section combobox has options: Integrations, Storage, Vault, Dashboard

#### 4.7. Layout form Section dropdown has all expected options

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new/layout
    - expect: The Section field is visible
  2. Click the Section dropdown
    - expect: Four options are shown: Integrations, Storage, Vault, Dashboard

#### 4.8. Layout Publish button is disabled with empty Name

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new/layout
    - expect: Name field is empty
  2. Leave the Name field empty
    - expect: The 'Publish' button is disabled

#### 4.9. Workflow Publish form requires workflow selection

**File:** `tests/integrations/publish-new.spec.ts`

**Steps:**
  1. Navigate to /integrations/publish/new/workflow
    - expect: The Workflow combobox is shown with a disabled default option '—'
  2. Leave Workflow combobox on the default option and fill in the Name field
    - expect: The Publish button remains disabled because no workflow is selected

### 5. Vault — Accounts

**Seed:** `e2e/auth.setup.ts`

#### 5.1. Redirects /vault to /vault/accounts

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/vault
    - expect: The browser URL becomes /vault/accounts
    - expect: The Accounts tab is active in the top navigation

#### 5.2. Accounts page renders correctly with existing accounts

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to /vault/accounts
    - expect: The header shows two tabs: Accounts and Wallet
    - expect: A 'Search accounts…' text box is visible
    - expect: An 'Add account' button is visible
    - expect: A 'Filter by' and 'Sort by' button are visible
    - expect: At least one account card is shown

#### 5.3. Account card displays name, URL, and username

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to /vault/accounts
    - expect: Each account card displays the account label, the site URL, and the username or email

#### 5.4. Add account dialog opens on button click

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to /vault/accounts and click the 'Add account' button
    - expect: A dialog titled 'Add account' appears
    - expect: Two tabs are present: Manual and 'Import from browser'
    - expect: Manual form fields are shown: URL, Username or email, Password (with show/hide toggle), Authenticator key (optional)
    - expect: The 'Save' button is initially disabled
    - expect: A 'Cancel' button is present

#### 5.5. Add account Save button remains disabled until required fields are filled

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Open the Add account dialog
    - expect: The Save button is disabled
  2. Fill in only the URL field
    - expect: The Save button remains disabled
  3. Fill in the Username or email field
    - expect: The Save button remains disabled
  4. Fill in the Password field
    - expect: The Save button becomes enabled

#### 5.6. Password field toggles visibility

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Open the Add account dialog and type a password in the Password field
    - expect: The password input is masked by default
  2. Click the show/hide toggle button next to the Password field
    - expect: The password becomes visible as plain text
  3. Click the toggle button again
    - expect: The password is masked again

#### 5.7. Cancel closes the Add account dialog without saving

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Open the Add account dialog
    - expect: The dialog is open
  2. Fill in URL, username, and password fields, then click 'Cancel'
    - expect: The dialog closes
    - expect: No new account card is added to the list

#### 5.8. Add account saves and appears in the list

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Open the Add account dialog
    - expect: The dialog is open
  2. Enter URL 'https://test.example.com', username 'testuser@example.com', and password 'TestPass123!'
    - expect: All fields are filled
  3. Click the 'Save' button
    - expect: The dialog closes
    - expect: A new account card for test.example.com / testuser@example.com appears in the list

#### 5.9. Search filters account cards

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to /vault/accounts with at least one existing account
    - expect: Account cards are visible
  2. Type part of an account name or URL in the search box
    - expect: Only matching accounts are displayed
  3. Clear the search box
    - expect: All accounts are shown again

#### 5.10. Clicking an account card opens its detail view or action menu

**File:** `tests/vault/accounts.spec.ts`

**Steps:**
  1. Navigate to /vault/accounts and click an existing account card
    - expect: A detail view or action menu for that account opens
    - expect: Options for viewing, editing, or deleting the account are available

### 6. Vault — Wallet

**Seed:** `e2e/auth.setup.ts`

#### 6.1. Wallet page renders coming-soon state

**File:** `tests/vault/wallet.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/vault/wallet
    - expect: The Wallet tab is active
    - expect: A heading 'Wallet — Coming soon' is shown
    - expect: A paragraph describes upcoming features: workspace credits, budgets, and spending insights

#### 6.2. Tab navigation between Accounts and Wallet works

**File:** `tests/vault/wallet.spec.ts`

**Steps:**
  1. Navigate to /vault/wallet
    - expect: The Wallet tab is active
  2. Click the 'Accounts' tab
    - expect: The browser navigates to /vault/accounts
    - expect: Account cards are shown

### 7. Storage — Files

**Seed:** `e2e/auth.setup.ts`

#### 7.1. Redirects /storage to /storage/files

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/storage
    - expect: The browser URL becomes /storage/files
    - expect: The Files tab is active

#### 7.2. Files page renders correctly with empty folder

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files
    - expect: The header shows two tabs: Files and Settings
    - expect: A 'Files' heading is shown in the toolbar
    - expect: Icon view and List view toggle buttons are visible
    - expect: New folder, Upload, and Filter buttons are present
    - expect: A search input with placeholder 'Search...' is visible
    - expect: Storage provider indicators are shown (Google Drive, Local)
    - expect: An empty state message 'This folder is empty.' is displayed when the folder has no files

#### 7.3. Toggle between icon view and list view

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files
    - expect: The view mode is set to one of icon or list view
  2. Click the 'List view' button
    - expect: The file browser switches to list/table view layout
  3. Click the 'Icon view' button
    - expect: The file browser switches back to icon/grid view layout

#### 7.4. New folder button opens folder creation UI

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files and click the 'New folder' button
    - expect: An input or dialog for entering the new folder name appears

#### 7.5. Upload button opens file chooser

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files and click the 'Upload' button
    - expect: A file chooser dialog opens (native OS file picker or custom upload UI appears)

#### 7.6. Search filters files

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files with at least one existing file
    - expect: Files are displayed
  2. Type a filename in the search input
    - expect: Only files matching the query are shown
  3. Clear the search input
    - expect: All files are shown again

#### 7.7. Storage provider badges show usage percentage

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files
    - expect: Google Drive and Local storage indicators are displayed at the bottom of the file browser
    - expect: Each provider shows its usage percentage as a tooltip on hover

#### 7.8. Filter button opens filter options

**File:** `tests/storage/files.spec.ts`

**Steps:**
  1. Navigate to /storage/files and click the 'Filter files' button
    - expect: A filter panel or dropdown opens with file type or date filter options

### 8. Storage — Settings

**Seed:** `e2e/auth.setup.ts`

#### 8.1. Storage Settings page renders correctly

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/storage/settings
    - expect: The Settings tab is active
    - expect: A heading 'Storage settings' is displayed
    - expect: A sub-heading 'Storage providers' is shown
    - expect: A description explains file-save order and drag-to-reorder behaviour
    - expect: The connected providers list shows at minimum Google Drive (Primary) and Local
    - expect: An 'All available providers are already connected' disabled button is shown when no more providers can be added

#### 8.2. Each provider row shows its status and controls

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to /storage/settings
    - expect: The Google Drive row shows position number 1, 'Primary' label, 'Available' status, a 'Disconnect' button, and a disabled 'Move up' button
    - expect: The Local row shows position number 2, 'Available' status, a 'Move up' button, and a disabled 'Move down' button

#### 8.3. Move up reorders providers

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to /storage/settings with two providers where the second one has a 'Move up' button enabled
    - expect: Google Drive is at position 1, Local is at position 2
  2. Click the 'Move up' button on the Local row
    - expect: Local moves to position 1
    - expect: Google Drive moves to position 2
    - expect: Local row's 'Move up' button becomes disabled
    - expect: Google Drive row's 'Move down' button becomes disabled

#### 8.4. Locked/upgrade provider shows Upgrade button

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to /storage/settings
    - expect: A locked provider (Cloud storage) is shown with a 'Locked' badge and an 'Upgrade' button for paid plans

#### 8.5. Disconnect removes a provider

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to /storage/settings
    - expect: Google Drive provider is connected
  2. Click the 'Disconnect' button on the Google Drive row
    - expect: A confirmation prompt or immediate removal occurs
    - expect: If confirmed, the Google Drive row is removed from the list
    - expect: An option to add a new provider becomes available

#### 8.6. Tab navigation between Files and Settings works

**File:** `tests/storage/settings.spec.ts`

**Steps:**
  1. Navigate to /storage/settings
    - expect: The Settings tab is active
  2. Click the 'Files' tab
    - expect: The browser navigates to /storage/files
    - expect: The Files tab becomes active

### 9. Global Layout — Sidebar and Header

**Seed:** `e2e/auth.setup.ts`

#### 9.1. Sidebar is visible and contains main navigation links

**File:** `tests/layout/sidebar.spec.ts`

**Steps:**
  1. Navigate to any authenticated page (e.g. /integrations/installed)
    - expect: The left sidebar is visible
    - expect: Navigation items include: New Workflow, Search, Integrations (links to /integrations/installed), Storage (links to /storage/files), Vault (links to /vault/accounts)
    - expect: A 'Workflows' section lists recent workflows
    - expect: A user profile button showing username and plan is at the bottom of the sidebar

#### 9.2. Toggle sidebar button collapses and expands the sidebar

**File:** `tests/layout/sidebar.spec.ts`

**Steps:**
  1. Navigate to any authenticated page
    - expect: The sidebar is visible in its expanded state
  2. Click the 'Toggle sidebar' button
    - expect: The sidebar collapses or enters a compact state
  3. Click the toggle again
    - expect: The sidebar re-expands to full width

#### 9.3. Notifications button opens the notifications panel

**File:** `tests/layout/sidebar.spec.ts`

**Steps:**
  1. Navigate to any authenticated page
    - expect: The Notifications button is visible in the page header
  2. Click the Notifications button (or press F8)
    - expect: A notifications panel or drawer opens

#### 9.4. New Workflow button creates a new workflow

**File:** `tests/layout/sidebar.spec.ts`

**Steps:**
  1. Click the 'New Workflow' button in the sidebar
    - expect: A new workflow is created and the user is navigated to the workflow editor page

### 10. Onboarding — Modal flow

**Seed:** `e2e/auth.setup.ts`

#### 10.1. Onboarding modal appears on first visit

**File:** `tests/onboarding/onboarding-modal.spec.ts`

**Steps:**
  1. Log in with a fresh account that has not completed onboarding, then navigate to /integrations/installed
    - expect: A dialog titled 'Welcome to your new workspace' appears
    - expect: Six step indicator buttons are shown (Step 1 of 6 through Step 6 of 6)
    - expect: A 'Next' button is visible
    - expect: A 'Skip' button is visible

#### 10.2. Skip button dismisses the onboarding modal

**File:** `tests/onboarding/onboarding-modal.spec.ts`

**Steps:**
  1. When the onboarding modal is open, click the 'Skip' button
    - expect: The onboarding modal closes

#### 10.3. Beta agreement dialog appears after skipping onboarding

**File:** `tests/onboarding/onboarding-modal.spec.ts`

**Steps:**
  1. Click Skip on the onboarding modal
    - expect: A dialog titled 'A few things to know' appears
    - expect: The dialog lists four beta disclaimer bullet points
    - expect: Links to Terms of Service and Privacy Policy are present
    - expect: A consent checkbox is shown
    - expect: A 'Get started' button is visible but initially disabled
    - expect: A 'Back' button is visible

#### 10.4. Get started button is disabled until consent is checked

**File:** `tests/onboarding/onboarding-modal.spec.ts`

**Steps:**
  1. On the beta agreement dialog, inspect the 'Get started' button before checking the checkbox
    - expect: The 'Get started' button is disabled
  2. Check the consent checkbox
    - expect: The 'Get started' button becomes enabled

#### 10.5. Accepting beta agreement closes the dialog

**File:** `tests/onboarding/onboarding-modal.spec.ts`

**Steps:**
  1. Check the consent checkbox and click 'Get started'
    - expect: The dialog closes
    - expect: The user can interact with the main page content normally
