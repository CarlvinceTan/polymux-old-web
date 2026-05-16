## Package Management

Use npm (`npm install`, `npm install <pkg>`, `npm uninstall <pkg>`) for all dependency changes. Do not manually edit `package.json` or `package-lock.json` unless strictly necessary—request approval and provide justification before doing so.

## Environment Variables

* `web/.env` (gitignored) is the single local source of truth. All local dev reads from it. New required vars must be added to `web/.env.example` so a fresh checkout boots from a clear template.
* Use `vercel env pull` ONLY to inspect what's currently set on Vercel — never as the runtime source. It writes to `.env.local`, which Nuxt loads after `.env` and silently overrides it. After running it, copy across whatever you needed to check, then **delete `.env.local`**.
* When a value should also exist on Vercel (Production / Preview / Development), mirror it via the dashboard or `vercel env add` after editing `.env`. Don't round-trip through `vercel env pull`.

## Test Credentials

Test account credentials are stored in `CLAUDE.local.md` (gitignored). Use these for login flows and manual testing:
- `TEST_USERNAME` / `TEST_PASSWORD`

## Project Structure

* The `SidePanel` is persistently fixed on the left across all pages.
* Maintain a clean, consistent directory structure aligned with routing.

## Routing

* Use `index.vue` strictly for default routing.
* Do not embed default page logic inside `index.vue`; delegate to explicit routes.

## Styling

* All colours must be defined in `main.css`.
* When introducing new colours, add them to `main.css` and maintain a consistent, standardised palette.
* For visual/interaction patterns, hover states, component styling conventions, and all design decisions, consult `DESIGN.md`.

## Components

* Extract reusable UI into components when:

  * It appears multiple times, or
  * It is not tightly coupled to a single page’s structure.
* Prefer consistency: reuse or mirror existing components (e.g. dropdowns) rather than introducing new styles.

## Internationalisation

* When making UI changes that add, modify, or remove user-facing text, always update all locale files under `i18n/locales/` — not just `en.json`.
* After editing any locale JSON, verify the change across all 8 locale files: `en`, `ko`, `zh`, `ja`, `de`, `fr`, `es`, `pt`.
* The `@` symbol is a special character in vue-i18n (linked messages). Always escape it as `{'@'}` in locale JSON values. Failure to do so causes a build error (`Invalid linked format`, error code 10).
  * Example: `"usernamePlaceholder": "you{'@'}example.com"` instead of `"usernamePlaceholder": "you@example.com"`
* New i18n keys follow the pattern of the nearest existing keys in the `settings` object (e.g. `settings.responseCompletions`).

## Refactoring & Hygiene

* Remove unused files, components, and directories after refactoring.
* Update all references (routing, imports, filenames) to reflect structural changes.

## Conventions

* Shorthand references:

  * `workflow/agent` → `app/pages/workflow/[id]/agent.vue` (chat + viewport + flow in one ChatLayout)
  * `workflow/schedule` → `app/pages/workflow/[id]/schedule.vue`
  * `workflow/artifacts` → `app/pages/workflow/[id]/artifacts.vue`
  * `dashboard/console` → `app/pages/dashboard/console.vue`
  * `integrations/installed` → `app/pages/integrations/installed.vue`
  * `integrations/marketplace` → `app/pages/integrations/marketplace.vue`
  * `vault/wallet` → `app/pages/vault/wallet.vue`
  * `vault/passwords` → `app/pages/vault/passwords.vue`
  * `storage/files` → `app/pages/storage/files.vue`
  * `storage/settings` → `app/pages/storage/settings.vue`
* Key reusable components:
  * `FileBrowser` — self-contained file browser (search, view toggle, filter, icon/list grid); drop it anywhere users need to access files
  * `SettingsSection` / `SettingsSectionRow` / `SettingsDropdown` / `SettingsToggle` — composable settings UI primitives
  * `TabPanel` — scrollable tab content container
  * `PageHeader` — top navigation with tabs
  * `SidePanel` — persistent left sidebar
  * `ChatLayout` / `ChatMessages` / `PromptInput` — chat page composition (ChatLayout embeds ViewportGallery and WorkflowNodeCanvas via its view-mode switcher)
  * `ArtifactCard` / `ArtifactDetail` / `ArtifactsGallery` — artifact display
  * `Menu` / `MenuItem` — anchored menu surface (opens up or down) with row items
  * `SearchModal` — global search overlay
  * `AppToastContainer` — toast notifications (renders `useAppToast` queue)
* Before creating new UI elements, check for existing implementations and align with their design and behaviour.
