# Polymux Public & Auth Pages Test Plan

## Application Overview

Polymux is a Nuxt 4 SaaS platform for AI workflow automation. This test plan covers all public-facing and authentication-related pages: the landing/home page, sign-in, sign-up, password reset flows, email verification, account suspended state, workspace invitation acceptance, and the install-apps download page. These pages are accessible without authentication and represent the primary entry points for new and returning users.

## Test Scenarios

### 1. Landing & Home Page (/  and /landing)

**Seed:** `e2e/seed.spec.ts`

#### 1.1. Landing page renders hero section with CTA buttons

**File:** `e2e/landing.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/
    - expect: The page title reflects the landing meta title
    - expect: The hero section is visible with a headline and rotating phrase
    - expect: A primary CTA button linking to sign-up or dashboard is present
  2. Verify the page contains the features section listing Orchestration, Browser, Vault, and Marketplace feature tiles
    - expect: Four feature tiles are visible on the page
  3. Scroll down to the pricing comparison section
    - expect: A pricing table with Free, Pro, Max, and Enterprise columns is visible
    - expect: Plan comparison rows include Agents per Workspace, Monthly Tasks, Browser Sessions, and Workspace Storage
  4. Confirm the page has a navigation header with links
    - expect: Navigation header is visible with links to relevant sections or pages

#### 1.2. /landing route renders identical content to /

**File:** `e2e/landing.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/landing
    - expect: The page renders the same hero and feature content as the root /  route
    - expect: The page title matches the landing meta title

#### 1.3. Hero rotating phrases cycle through the list

**File:** `e2e/landing.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/ and observe the rotating phrase element in the hero section
    - expect: A rotating phrase is displayed in the hero headline
  2. Wait for the phrase rotation cycle to change (allow up to 5 seconds)
    - expect: The phrase displayed in the hero changes to a different entry from the rotation list

### 2. Sign-In Page (/sign-in)

**Seed:** `e2e/seed.spec.ts`

#### 2.1. Sign-in page renders all expected elements

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: The page title includes 'Sign In'
    - expect: The Polymux logo is displayed as a link to /
    - expect: The heading 'Welcome back' is visible
    - expect: A 'Continue with Google' button is present
    - expect: An email input field with id 'signin-email' is present
    - expect: A password input field with id 'signin-password' is present
    - expect: A 'Forgot password?' link pointing to /forgot-password is present
    - expect: A 'Sign In' submit button is present
    - expect: A 'Sign Up' link pointing to /sign-up is present
    - expect: A back arrow button is present in the top-left corner
    - expect: An AuthTermsFooter component is rendered at the bottom

#### 2.2. Successful sign-in with valid credentials redirects to home

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: Sign-in form is visible
  2. Enter a valid email address in the email field
    - expect: Email value is reflected in the input
  3. Enter the correct password in the password field
    - expect: Password value is masked and reflected in the input
  4. Click the 'Sign In' submit button
    - expect: The button text changes to 'Signing in...' while pending
    - expect: The button is disabled during submission
    - expect: On success the user is redirected to / or the redirect query parameter destination

#### 2.3. Sign-in with incorrect credentials shows error alert

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: Sign-in form is visible
  2. Enter a valid-format email in the email field
    - expect: Email input is populated
  3. Enter an incorrect password in the password field
    - expect: Password input is populated
  4. Click the 'Sign In' submit button
    - expect: An error alert with role='alert' is displayed inside the form
    - expect: The error message reflects the authentication failure reason (e.g. 'Invalid login credentials')
    - expect: The user remains on /sign-in

#### 2.4. Sign-in with empty fields shows no client-side error before submit but relies on server validation

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: Sign-in form is visible with no error messages
  2. Leave email and password fields empty and click the 'Sign In' submit button
    - expect: The form submits (novalidate is set)
    - expect: An error message is displayed indicating sign-in failure

#### 2.5. Redirect parameter is honoured after sign-in

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in?redirect=%2Fdashboard%2Fconsole
    - expect: Sign-in page is displayed
  2. Sign in with valid credentials
    - expect: After successful sign-in, the user is redirected to /dashboard/console rather than the default / route

#### 2.6. Back button on sign-in navigates to previous non-auth page

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/ then navigate to /sign-in
    - expect: Sign-in page is displayed
  2. Click the back arrow button in the top-left corner of the sign-in card
    - expect: The user is navigated to / or the last non-auth page stored in sessionStorage under 'polymux_auth_back'

#### 2.7. Logo link on sign-in navigates to home

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: Sign-in page is displayed
  2. Click the Polymux logo at the top of the card
    - expect: The user is navigated to /

#### 2.8. Continue with Google button initiates OAuth flow

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-in
    - expect: 'Continue with Google' button is present
  2. Click the 'Continue with Google' button
    - expect: The browser is redirected to a Google OAuth URL (accounts.google.com)
    - expect: No error message is shown prior to the redirect

### 3. Sign-Up Page (/sign-up)

**Seed:** `e2e/seed.spec.ts`

#### 3.1. Sign-up page renders all expected elements

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-up
    - expect: The page title includes 'Sign Up'
    - expect: The Polymux logo is shown as a link to /
    - expect: The heading 'Create your account' is visible
    - expect: A 'Continue with Google' button is present
    - expect: An email input with id 'signup-email' is present
    - expect: A 'Create password' input with id 'signup-password' is present
    - expect: A 'Confirm your password' input with id 'signup-password-confirm' is present
    - expect: A 'Create account' submit button is present
    - expect: A 'Sign In' link pointing to /sign-in is present
    - expect: A back arrow button is present in the top-left
    - expect: An AuthTermsFooter component is visible

#### 3.2. Successful registration with valid data shows email confirmation screen

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-up
    - expect: Sign-up form is visible
  2. Enter a unique valid email address in the email field
    - expect: Email value is reflected in the input
  3. Enter a password of at least 6 characters in the 'Create password' field
    - expect: Password value is masked in the input
  4. Enter the same password in the 'Confirm your password' field
    - expect: Confirm password value is masked in the input
  5. Click the 'Create account' button
    - expect: The button text changes to 'Creating account...' while pending
    - expect: After the API call resolves, the form is replaced by a confirmation screen
    - expect: The confirmation screen shows 'Check your email' heading
    - expect: The confirmation screen displays the submitted email address
    - expect: A 'Sign In' link is visible on the confirmation screen

#### 3.3. Mismatched passwords show validation error without API call

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-up
    - expect: Sign-up form is visible with no errors
  2. Enter a valid email, a password, and a different value in the confirm password field
    - expect: Fields are populated with different password values
  3. Click 'Create account'
    - expect: An error alert with role='alert' appears inside the form
    - expect: The error text indicates passwords do not match
    - expect: The form is not submitted to the API and the user remains on /sign-up

#### 3.4. Password shorter than 6 characters shows minimum length error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-up
    - expect: Sign-up form is visible
  2. Enter a valid email, a 5-character password in both password fields
    - expect: Both password fields have identical 5-character values
  3. Click 'Create account'
    - expect: An error alert appears indicating the password minimum length requirement (at least 6 characters)
    - expect: No API request is made

#### 3.5. Registering with an already-used email shows API error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/sign-up and fill in all fields with valid data using an email address already registered in the system
    - expect: All fields are filled with valid matching passwords of at least 6 characters
  2. Click 'Create account'
    - expect: An error message is displayed from the API response
    - expect: The user remains on the sign-up page

### 4. Forgot Password Page (/forgot-password)

**Seed:** `e2e/seed.spec.ts`

#### 4.1. Forgot password page renders correctly

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forgot-password
    - expect: The Polymux logo is displayed as a link to /
    - expect: The heading matches the forgot password title key
    - expect: A description paragraph is visible
    - expect: An email input with id 'forgot-email' is present
    - expect: A 'Send reset link' submit button is present
    - expect: A 'Back to sign in' link pointing to /sign-in is present

#### 4.2. Submitting a valid email shows the confirmation message

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forgot-password
    - expect: The email form is displayed
  2. Enter a registered email address in the email field
    - expect: Email field is populated
  3. Click the 'Send reset link' button
    - expect: The button text changes to 'Sending reset link...' while pending
    - expect: The form is replaced by a status message with role='status'
    - expect: The status message includes a confirmation heading and instructional text about checking email
    - expect: The user remains on /forgot-password

#### 4.3. Submitting an empty email field attempts submission and shows API error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forgot-password
    - expect: The email form is displayed with no errors
  2. Leave the email field empty and click 'Send reset link'
    - expect: The form is submitted (novalidate is set)
    - expect: An error alert with role='alert' appears
    - expect: The user remains on /forgot-password

#### 4.4. Back to sign in link navigates to sign-in page

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/forgot-password
    - expect: Page is displayed
  2. Click the 'Back to sign in' link
    - expect: The user is navigated to /sign-in

### 5. Reset Password Page (/reset-password)

**Seed:** `e2e/seed.spec.ts`

#### 5.1. Reset password page renders the form

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/reset-password (as if arriving from a password reset email link with a valid session token)
    - expect: The Polymux logo is displayed
    - expect: The heading 'Reset password' or equivalent is visible
    - expect: A description paragraph is present
    - expect: A 'New password' input with id 'reset-password' is present
    - expect: A 'Confirm new password' input with id 'reset-password-confirm' is present
    - expect: An 'Update password' submit button is present
    - expect: A 'Back to sign in' link pointing to /sign-in is present

#### 5.2. Mismatched passwords show validation error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/reset-password
    - expect: Reset password form is visible
  2. Enter a password of at least 6 characters in the 'New password' field and a different value in the 'Confirm new password' field
    - expect: Both fields have different values
  3. Click 'Update password'
    - expect: An error alert with role='alert' is shown indicating passwords do not match
    - expect: No API call is made
    - expect: The user remains on /reset-password

#### 5.3. Password shorter than 6 characters shows minimum length error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/reset-password and enter a 5-character password in both new password fields
    - expect: Both password fields have identical values of length 5
  2. Click 'Update password'
    - expect: An error alert appears indicating the minimum password length requirement
    - expect: No API request is made

#### 5.4. Successful password update shows confirmation and redirects to sign-in

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to /reset-password with a valid authenticated session (as provided by the email reset link), enter a new password of at least 6 characters in both fields
    - expect: Both password fields are populated with matching values
  2. Click 'Update password'
    - expect: A success status message with role='status' is shown indicating the password was updated
    - expect: The form is hidden after success
    - expect: After approximately 2 seconds the user is automatically redirected to /sign-in

### 6. Confirm Page (/confirm)

**Seed:** `e2e/seed.spec.ts`

#### 6.1. Confirm page shows loading spinner on direct navigation

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/confirm
    - expect: A loading spinner (animated div) is visible
    - expect: The text 'Signing you in' or similar is displayed
    - expect: The page background is neutral-50

#### 6.2. Confirm page with type=signup redirects to /verification-successful after signing out

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/confirm?code=VALID_CODE&type=signup (simulating the email confirmation link)
    - expect: The page briefly shows the loading spinner
  2. Wait for the redirect to complete
    - expect: The user is redirected to /verification-successful
    - expect: The user is signed out (no active session)

#### 6.3. Confirm page without code or type redirects to home

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/confirm with no query parameters
    - expect: The loading spinner is shown briefly
  2. Wait for the redirect to complete
    - expect: The user is redirected to /

#### 6.4. Confirm page with auth_redirect in sessionStorage redirects to that URL

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Set sessionStorage key 'auth_redirect' to '/dashboard/console', then navigate to http://localhost:3000/confirm
    - expect: The loading spinner is shown briefly
  2. Wait for the page to complete processing
    - expect: The user is redirected to /dashboard/console
    - expect: The 'auth_redirect' key is removed from sessionStorage

### 7. Verify Email Page (/verify-email)

**Seed:** `e2e/seed.spec.ts`

#### 7.1. Verify email without token shows missing token error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verify-email with no query parameters
    - expect: The Polymux logo is displayed as a link to /
  2. Wait for the loading state to complete
    - expect: A red error icon (circle with X) is shown
    - expect: An error heading indicating verification failed is visible
    - expect: The error message states the token is missing
    - expect: A 'Back to Blog' button linking to /blog is displayed

#### 7.2. Verify email with a valid token shows success state

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verify-email?token=VALID_TOKEN (using a real mailing list verification token)
    - expect: A loading spinner is shown initially
  2. Wait for verification to complete
    - expect: A green success icon is shown
    - expect: A success heading indicating email is verified is visible
    - expect: A success body message is shown
    - expect: A 'Back to Blog' button linking to /blog is displayed

#### 7.3. Verify email with an invalid or expired token shows error state

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verify-email?token=INVALID_OR_EXPIRED_TOKEN
    - expect: A loading spinner is shown initially
  2. Wait for the API call to complete
    - expect: A red error icon is displayed
    - expect: An error heading for verification failure is shown
    - expect: The error message from the API response is displayed in red text
    - expect: A 'Back to Blog' button is present

#### 7.4. Back to Blog button on verify-email navigates to /blog

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verify-email and wait for the error state (no token provided)
    - expect: 'Back to Blog' button is visible
  2. Click the 'Back to Blog' button
    - expect: The user is navigated to /blog

### 8. Verification Successful Page (/verification-successful)

**Seed:** `e2e/seed.spec.ts`

#### 8.1. Verification successful page renders all expected elements

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verification-successful
    - expect: The page title includes 'Verification Successful'
    - expect: The Polymux logo is displayed as a link to /
    - expect: A green check circle icon is visible
    - expect: The heading 'Verification Successful' or the i18n equivalent is displayed
    - expect: A description paragraph is shown
    - expect: A 'Return to Sign In' button linking to /sign-in is present
    - expect: An AuthTermsFooter component is rendered at the bottom

#### 8.2. Return to Sign In button navigates to /sign-in

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/verification-successful
    - expect: Page is displayed with 'Return to Sign In' button
  2. Click the 'Return to Sign In' button
    - expect: The user is navigated to /sign-in

### 9. Account Suspended Page (/account-suspended)

**Seed:** `e2e/seed.spec.ts`

#### 9.1. Account suspended page renders all expected elements

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/account-suspended
    - expect: The page title includes the account suspended title
    - expect: The page is full-height with a dark background
    - expect: A heading indicating the account is suspended is displayed
    - expect: A body paragraph with further explanation is shown
    - expect: A 'Sign Out' button is present

#### 9.2. Sign Out button on account-suspended calls signOut and redirects

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/account-suspended
    - expect: The 'Sign Out' button is visible
  2. Click the 'Sign Out' button
    - expect: The signOut composable is invoked
    - expect: The user session is cleared
    - expect: The user is navigated away from /account-suspended (typically to / or /sign-in)

### 10. Invitations Accept Page (/invitations/accept)

**Seed:** `e2e/seed.spec.ts`

#### 10.1. Visiting /invitations/accept without a token shows error state

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/invitations/accept with no query parameters while authenticated
    - expect: A loading spinner is shown briefly
  2. Wait for the page to resolve
    - expect: An error state card is displayed with a red circle icon
    - expect: The error heading 'Invitation Unavailable' or the i18n equivalent is shown
    - expect: The error message indicates the token is missing
    - expect: A 'Go to Dashboard' button is present

#### 10.2. Unauthenticated user visiting accept invitation is redirected to sign-in

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Ensure no user session is active, then navigate to http://localhost:3000/invitations/accept?token=SOME_TOKEN
    - expect: The page briefly shows a loading spinner
  2. Wait for the redirect to complete
    - expect: The user is redirected to /sign-in?redirect=%2Finvitations%2Faccept%3Ftoken%3DSOME_TOKEN
    - expect: After signing in the user is returned to the invitation accept page

#### 10.3. Valid invitation shows workspace preview with accept and decline buttons

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Sign in as an authenticated user, then navigate to /invitations/accept?token=VALID_INVITE_TOKEN
    - expect: A loading spinner is shown while the invitation is previewed
  2. Wait for the preview state to load
    - expect: An envelope icon is displayed
    - expect: The heading 'Join [Workspace Name]' is shown
    - expect: The role the user is invited as is displayed
    - expect: The invitee email address is shown
    - expect: A 'Decline' button and an 'Accept' button are both visible

#### 10.4. Accepting a valid invitation shows the accepted success state

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to /invitations/accept?token=VALID_INVITE_TOKEN as an authenticated user and wait for the preview to load
    - expect: 'Accept' and 'Decline' buttons are visible
  2. Click the 'Accept' button
    - expect: A loading spinner with 'Joining...' text is shown while accepting
  3. Wait for the acceptance to complete
    - expect: The accepted state is displayed with a green check icon
    - expect: An 'Accepted' heading is shown with the workspace name in the body
    - expect: A 'Continue to Dashboard' button is present

#### 10.5. Clicking Decline navigates to /dashboard/console

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to /invitations/accept?token=VALID_INVITE_TOKEN as an authenticated user and wait for preview state
    - expect: 'Decline' and 'Accept' buttons are visible
  2. Click the 'Decline' button
    - expect: The user is navigated to /dashboard/console
    - expect: No acceptance API call is made

#### 10.6. Expired invitation token shows expired error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to /invitations/accept?token=EXPIRED_TOKEN as an authenticated user
    - expect: Loading spinner is shown initially
  2. Wait for the error state
    - expect: An error card with red icon is displayed
    - expect: The error message indicates the invitation has expired
    - expect: A 'Go to Dashboard' button is present

#### 10.7. Already accepted invitation token shows already accepted error

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Navigate to /invitations/accept?token=ALREADY_ACCEPTED_TOKEN as an authenticated user
    - expect: Loading spinner is shown initially
  2. Wait for the error state
    - expect: An error card is shown indicating the invitation has already been accepted
    - expect: A 'Go to Dashboard' button is present

#### 10.8. Continue to Dashboard button after accepting navigates to /dashboard/console

**File:** `e2e/auth.public.spec.ts`

**Steps:**
  1. Complete the invitation acceptance flow to reach the 'accepted' state
    - expect: 'Continue to Dashboard' button is visible
  2. Click the 'Continue to Dashboard' button
    - expect: The user is navigated to /dashboard/console

### 11. Install Apps Page (/install-apps)

**Seed:** `e2e/seed.spec.ts`

#### 11.1. Install apps page renders hero section with platform detection

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps
    - expect: The page title is 'Install Apps'
    - expect: A hero section with a heading is visible
    - expect: A subtitle paragraph is shown
    - expect: A primary CTA button area is present showing the detected platform (macOS, Windows, or Linux) or a generic 'Coming Soon' state
    - expect: The CTA button is in a disabled/coming-soon state

#### 11.2. Platform switcher links change the displayed platform

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps and observe the current detected platform displayed
    - expect: A 'Also available for' line is shown with links to the other platforms (macOS, Windows, Linux minus detected)
  2. Click one of the other platform links (e.g. 'Windows' if macOS is detected)
    - expect: The primary CTA button updates to show the Windows icon and Windows platform name
    - expect: The 'Also available for' line updates to show the remaining platforms

#### 11.3. Scroll to extensions button scrolls the Browser Extension section into view

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps and locate the 'Looking for Mobile & Extensions?' button
    - expect: The button with a down arrow icon is visible in the hero section
  2. Click the 'Looking for Mobile & Extensions?' button
    - expect: The page scrolls so the #extensions-mobile section becomes visible in the viewport
    - expect: The 'Browser Extension & Mobile Apps' heading is visible after scrolling

#### 11.4. Extensions & Mobile section shows coming soon badges

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps and scroll to the 'Browser Extension & Mobile Apps' section
    - expect: A Browser Extension card is present with a puzzle-piece icon
    - expect: The extension card shows a disabled 'Coming Soon' button with Google Chrome icon
    - expect: A Mobile Apps card is present showing iOS and Android tiles
    - expect: Each mobile tile (iOS, Android) has a 'Coming Soon' badge

#### 11.5. Help section at the bottom shows documentation and contact links

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps and scroll to the bottom help section
    - expect: A 'Read Guide' link button pointing to /documentation is visible
    - expect: A 'Contact Support' link pointing to /contact is visible
  2. Click the 'Read Guide' button
    - expect: The user is navigated to /documentation

#### 11.6. Contact Support link on install apps navigates to /contact

**File:** `e2e/install-apps.public.spec.ts`

**Steps:**
  1. Navigate to http://localhost:3000/install-apps and scroll to the bottom help section
    - expect: 'Contact Support' link is visible
  2. Click 'Contact Support'
    - expect: The user is navigated to /contact
