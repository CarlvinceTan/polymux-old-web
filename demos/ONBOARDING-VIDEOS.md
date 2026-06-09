# Onboarding demo videos — planning doc

Living document for iterating on what each onboarding slide video should communicate, what data it needs, and how we record it. **Planning only** — no re-records implied by edits here.

> **Videos disabled in UI until ready.** `demos/manifest.json` → `defaults.useVideoHero: false` — onboarding shows icon+gradient heroes, not MP4s. This toggle is **not** the same as git policy: MP4s can exist locally while the UI hides them. Generated assets under `public/demos/` are **gitignored** (not committed). To ship: run `pnpm demo:record --all` locally or in CI, set `useVideoHero: true`, deploy.

**Pipeline home:** `web/demos/manifest.json` + `pnpm demo:record` (`scripts/record-demos.mts`)

**Onboarding copy source:** `web/i18n/locales/en.json` → `onboarding.*`

---

## Publishing videos in the app (toggle)

`manifest.json` → `defaults.useVideoHero` controls whether the onboarding modal plays MP4 heroes. **`false` today** — icon + gradient only; `recording` blocks are unchanged for the recorder.

| `useVideoHero` | Onboarding UI | `pnpm demo:record` |
|----------------|-----------------|-------------------|
| `false` | Icon + gradient (`slideHasRecording` → false) | Unchanged — still uses `recording` blocks |
| `true` | `<OnboardingDemo>` for slides with `recording` | Same |

**Re-enable when clips are ready:** set `"useVideoHero": true` in `demos/manifest.json`, re-record if needed (`pnpm demo:record --all`), deploy with the generated files present on the build machine (see below).

---

## Git / deploy: generated videos are not committed

| What | Policy |
|------|--------|
| `public/demos/*.mp4` | **Gitignored** — record locally or in CI before deploy |
| `public/demos/*.poster.webp` | **Gitignored** — generated alongside each MP4 |
| `public/demos/.gitkeep` | **Tracked** — keeps the output directory in git |

**Why:** While iterating on storyboards and re-recording often, keeping ~2–3 MB+ of binary assets out of git avoids noisy diffs and repo bloat. `useVideoHero: false` lets you iterate on clips locally without showing them in the UI yet.

**Before deploy (when `useVideoHero: true`):**

1. Run `pnpm demo:record --all` (or record individual slides) with demo auth configured.
2. Confirm `public/demos/{slideKey}.mp4` and `.poster.webp` exist on the machine that builds/deploys.
3. Deploy — Vercel (or CI) must receive those files as part of the build output, not from git.

**CI alternative:** Add a deploy step that runs `pnpm demo:record --all` (needs Playwright, ffmpeg, and `DEMO_RECORD_*` secrets). Not required while recording locally before deploy.

**If MP4s were previously committed:** remove them from the index without deleting local files:

```bash
git rm --cached public/demos/*.mp4 public/demos/*.poster.webp
```

---

## How to use this doc

1. Edit **Storyboard** / **Open questions** in a PR or directly — this is the back-and-forth surface.
2. When a slide is ready, update **Status** and adjust `manifest.json` `recording.steps`.
3. Re-record with `pnpm demo:record <slide-key>` (or `--all`). Outputs land in `public/demos/{slideKey}.mp4`.

---

## Global recording conventions

| Item | Current behavior |
|------|------------------|
| **Viewport** | 1200×720 (`manifest.json` → `defaults.viewport`) |
| **Auth** | Auto-login via `DEMO_RECORD_EMAIL` / `DEMO_RECORD_PASSWORD` (or `TEST_*`), or saved session at `demos/.session/user.json` |
| **Session setup** | `pnpm demo:save-session` (interactive) or auto-login on first record |
| **Beta onboarding** | `record-demos.mts` dismisses beta modal (Skip → acknowledge → Get started) before each slide |
| **App readiness** | Waits for `[data-testid=workspace-dropdown-trigger]` interactable; mocks `/health` to avoid “Server unavailable” overlay |
| **Post-process** | `playwright-recast`: speed-up, auto-zoom, synthetic cursor, ffmpeg → MP4 + poster webp |
| **Per-slide speed** | `defaults.demoRecast` overrides base `recast` (faster idle/action/network segments) |
| **Workflows prelude** | For `workflows` only: script opens first saved workflow (not “New Workflow”) before manifest steps |
| **Terms slide** | No recording — static gradient hero in modal |

**Conventions to add (recommended):**

- Settle wait after route load before first action (especially storage — see [Storage warning fix](#storage-cancellederror-warning-fix)).
- Prefer `data-testid` selectors already used in manifest.
- Target **~20–35 s** raw recording per slide (~8–15 s after recast) unless the story needs longer.
- Avoid steps that open native file pickers without `setInputFiles` (headless upload is a no-op).

---

## Demo data seeding (options)

| Approach | Pros | Cons |
|----------|------|------|
| **Manual demo workspace** | Fast to start; real UI | Easy to drift; test account currently sparse |
| **Dedicated “Demo” workspace** | Isolated from dev clutter | Needs ongoing curation |
| **API / script seed** | Repeatable (`pnpm demo:seed` — *not built yet*) | Upfront work (workflows, files, integrations, vault rows) |
| **Fixture uploads in recorder** | Real upload UX in video | Requires extending `record-demos.mts` with `setInputFiles` |
| **Pre-seeded session + storage state** | Stable auth | Doesn’t seed server-side files/workflows |

**Suggested minimum seed (all slides):**

- Workspace with a sensible name (not “Loading…”).
- ≥1 **saved workflow** with a few nodes and at least one **viewport** session worth showing.
- Storage: ≥3 files + 2 folders, one nested; optional one “Reports/” style folder for move demo.
- Integrations: marketplace catalog reachable; ≥1 installed integration for contrast (optional).
- Vault: 2–3 password entries; wallet flag on + small balance/transactions if wallet slide matters.

---

## Slide: `welcome`

**Onboarding copy** (`onboarding.welcome` in `en.json`)

- Title: “Welcome to your new workspace”
- Description: Everything lives in a workspace — switch teams/personal, invite members, keep each workspace’s workflows, files, and secrets isolated.

### Goal

In **~12–15 s after recast**, the viewer should grasp:

1. **Workspace = container** (name in sidebar header, plan + member count in menu).
2. **Context switching** lives in the workspace dropdown (switch list when available; “Add workspace” always).
3. **Isolation** — same sidebar, different data per area (at minimum **Storage** + one other “scoped” surface).

*Sign-in, beta dismiss, and `/health` mock happen in `record-demos.mts` prelude (`waitForAppReady`), not in manifest steps.*

---

### What we can show today vs what needs setup

| Beat | Works on typical demo account (often 1 workspace) | Needs setup / flags |
|------|-----------------------------------------------------|---------------------|
| Console backdrop (`/dashboard/console`) | Yes — schedules/runs if workflows exist; empty states OK | Named workspace (not “Loading…”) |
| Open workspace dropdown (`data-testid=workspace-dropdown-trigger`) | Yes — name, role line, plan label, member count, Settings, Manage members, **Add workspace** | Member count > 1 reads better for “invite” copy |
| **Other workspaces** list + live switch (`data-testid=workspace-option`) | **No** if user has only one workspace — section hidden in `SidePanel.vue` | Second workspace on demo user (personal + team, or two named sandboxes) |
| Sidebar → Storage (`/storage/files`) | Yes (route + nav link) | Populated files optional; empty folder still OK for welcome |
| Sidebar → Integrations (`/integrations/installed`) | Yes if `integrations` feature flag on | Flag off → gate/empty — prefer marketplace only when flag confirmed |
| Sidebar → Vault (`/vault/accounts`) | Yes | Account rows optional; empty list OK |
| Workflow list in sidebar | Yes | ≥1 saved workflow makes console + sidebar feel “lived-in” |
| **Manage members** modal peek | Yes (open + Escape — no submit) | — |
| **Create workspace** modal peek (name + invite rows) | Yes (open + Escape — no submit) | Avoid real `createWorkspace` in recorder |
| Actual workspace switch in video | **No** without ≥2 workspaces | Seed second workspace; manifest step: click `[data-testid=workspace-option]` |

**Recorder today:** no welcome-specific steps in `record-demos.mts` beyond shared `waitForAppReady` (workspace trigger must be clickable). All beats come from `manifest.json`.

**Current manifest (~34 s raw waits):** console hold → dropdown open/close → Storage → Integrations (installed) → dropdown open/close. Roughly **~12–14 s after `demoRecast`** — close to length target, but **under-sells** invite/isolation copy when only one workspace exists.

---

### Recommended storyboard (primary — target ~22–28 s raw → **~12–15 s after recast**)

Numbered for manifest iteration later; timings are starting points.

1. **Settle on console** (2 s) — sidebar shows workspace name + workflow list.
2. **Open workspace dropdown** (4 s) — frame name, plan, member count, **Manage members**, **Add workspace**; if seeded, show **Other workspaces** list (hold, no click yet).
3. **Switch workspace** (3 s) — *only if ≥2 workspaces:* click one `[data-testid=workspace-option]`; brief settle on new name in header. *If only one workspace, extend beat 2 to 6 s instead (see Variant A).*
4. **Storage** via sidebar link (3 s) — “files live per workspace.”
5. **Vault** via sidebar link (3 s) — “secrets per workspace” (stronger match to i18n than integrations alone).
6. **Re-open dropdown** (2 s) — land on **Add workspace** row or switch list; close (2 s).
7. **Hold on console** (2 s).

*Deferred to later slides:* workflow canvas, marketplace install, vault add-password flow.

---

### Alternative variants (when switching isn’t available)

Pick **one** as the stand-in for beat 3 if the demo account has a single workspace.

#### Variant A — Dropdown tour (no modals)

- Replace beat 3 with a **longer open dropdown** (6 s): scroll attention through Settings → Manage members → Add workspace; voice/copy carries “switch teams / personal” because the **Other workspaces** section is absent.
- Keep beats 4–5 as Storage → Vault (or Storage → Integrations if vault feels redundant with slide 5).
- Lowest risk; closest to today’s manifest.

#### Variant B — Create workspace modal peek

- After beat 2: click **Add workspace** (menu item text from `nav.addWorkspace`) → hold **Create workspace** modal showing name field + invite rows (4 s) → **Escape** (no submit).
- Then Storage → Vault sidebar tour.
- Best visual for “invite members” without a second workspace; needs manifest selector for the menu row (no `data-testid` today).

#### Variant C — Manage members modal peek

- After beat 2: open **Manage members** from dropdown (4 s) → Escape.
- Then Storage → Integrations (installed) to echo current manifest.
- Surfaces collaboration; modal content depends on member list seeding.

---

### Prerequisites checklist

Before locking manifest + re-record:

- [ ] Demo session valid (`demos/.session/user.json` or `DEMO_RECORD_*` auto-login).
- [ ] Beta onboarding dismisses cleanly (recorder handles).
- [ ] Workspace **display name** set (e.g. “Acme Demo” — not “Loading…”).
- [ ] **Optional but high value:** second workspace on demo user for switch beat.
- [ ] **Optional:** member count ≥ 2 (or manage-members list seeded) for invite story.
- [ ] **Optional:** ≥1 saved workflow so console + sidebar look active.
- [ ] Confirm **`integrations`** flag if keeping Integrations in the tour (Variant A/C).
- [ ] Nav selectors: prefer adding `data-testid` on sidebar links (`nav-storage`, `nav-vault`, …) before replacing `a[href=…]` in manifest.

---

### Current recording (`manifest.json`) — unchanged until storyboard approved

- Route: `/dashboard/console`
- Steps: dropdown toggle ×2, `a[href="/storage/files"]`, `a[href="/integrations/installed"]`, dropdown again.
- Does **not** show: switch, invite UI, vault, modals, or “Add workspace.”

### Status

**Recordable today** as a minimal pass (Variant A + current manifest). **Recommended storyboard** wants either **second workspace** or **Variant B/C** to align with i18n. **Manifest rewrite** after user answers open questions below.

### Open questions (reply to lock storyboard)

1. **Switch vs explain:** Is seeding a **second workspace** worth it for a real switch click, or is Variant A (long dropdown hold) enough for beta?
2. **Sidebar tour pair:** **Storage + Vault** (matches “files and secrets”) or keep **Storage + Integrations** (matches current manifest / slide 4)?
3. **Invite beat:** None (dropdown only), **Create workspace** modal peek (Variant B), or **Manage members** peek (Variant C)?
4. **Hero backdrop:** Stay on **console** throughout, or is it OK if the clip **ends on Storage/Vault** with console only at the start?
5. **Pace:** Hard cap **~12–15 s after recast**, or allow **~18 s** if we add a modal peek?

---

## Slide: `workflows`

**Onboarding copy**

- Title: “Build and run workflows”
- Description: Compose agent steps on a flow canvas; watch them in live browser viewports — one place.

### Goal

Viewer sees **two modes**: node canvas (build) and viewport gallery (watch agents work in browsers).

### Prerequisites

- ≥1 saved workflow (recorder skips “New Workflow” placeholder).
- Workflow should have **≥2 nodes** and ideally evidence of **viewport** activity (thumbnails or empty state that still reads as “live browsers”).
- Routes: `/workflow/{id}/agent` with flow + viewport tabs.

### Storyboard (target ~30 s raw)

1. Open saved workflow — **Flow** tab (3.5 s).
2. Switch to **Viewport** tab — scroll/hold on gallery (8 s).
3. Back to **Flow** — show canvas (5.5 s).
4. Click **Add node** — menu visible (5 s) — *currently opens menu but does not add a node*.
5. Viewport tab again (7.5 s).
6. Flow tab — hold on canvas (6 s).

### Current recording

- Implements tab switching, add-node button, viewport gallery wait.
- `record-demos.mts` pre-step: `openFirstSavedWorkflow()`.
- Does **not**: run workflow, show live browser, edit nodes, or name what a node is.

### Current issues

- Empty/new workflow → viewport gallery may be empty; canvas may look sparse.
- Add-node click doesn’t complete add — menu flash only.
- Browser/onboarding merge is **conceptual** in copy but recording doesn’t show an in-viewport browser.

### Status

**Needs seed data** (rich workflow + viewport history) · **needs manifest/storyboard revision** for clearer beats

### Open questions

- [ ] Use a **canned workflow** with recognizable nodes (e.g. “Research → Browse → Summarize”)?
- [ ] Show a **running** or **completed** viewport recording vs static thumbnails?
- [ ] Add a step to place one node (blank or integration) for a clearer “build” beat?
- [ ] Defer “run workflow” to avoid flake?

---

## Slide: `storage`

**Onboarding copy**

- Title: “Your workspace files”
- Description: Upload, organize, move files/folders; workflows read/write storage.

### Goal

Viewer sees a **populated file browser**, upload, folder creation, and ideally **move/reorder** — not an empty folder or error state.

### Prerequisites

- Connected storage backend (Drive / cloud / local) for the demo workspace.
- **Pre-seeded files** strongly recommended (test account currently empty).
- Listing fetch must succeed (see warning fix below).

### Storyboard (target ~30 s raw) — *proposed*

1. Land on `/storage/files` with seeded files visible (3 s).
2. **Upload** 1–2 fixture files via recorder `setInputFiles` (8 s) — show progress toast → success.
3. **New folder** — type name, Enter (6 s).
4. Select a file → **Move** to folder (8 s).
5. Optional: toggle icon/list view (3 s).
6. Hold on organized folder (5 s).

### Current recording

```json
waitFor upload → click upload → click new folder → click upload → …
```

- Clicks **Upload** 3× without choosing files — **no upload happens**.
- Clicks **New folder** 4× — only first opens inline row; rest ignored while pending.
- **Blur side effect:** new-folder input uses `@blur="commitPendingNewFolder"`. Clicking Upload/New folder while the inline folder row is open **commits** folder creation unintentionally.

### Current issues

1. ~~**CancelledError on screen (root cause — confirmed)**~~ **Fixed** in `useStorageFiles.listFiles` (ignores TanStack Query `CancelledError` / fetch aborts). See [Storage CancelledError warning fix](#storage-cancellederror-warning-fix).
2. Empty folder — “This folder is empty.” dominates the frame.
3. Recording doesn’t show move, rename, download, or workflow-linked storage.
4. No `setInputFiles` support in recorder.

### Status

**Needs seed data** + **needs manifest rewrite** (CancelledError app fix applied)

### Open questions

- [ ] Show **Google Drive / provider chips** (usage overlay) or keep focus on files?
- [ ] Include **share** or **settings** or too much for onboarding?
- [ ] Move vs drag-and-drop — which reads better in a short clip?
- [x] Fix CancelledError in app code vs work around in recorder only? → **App fix applied** (`useStorageFiles`).

---

## Storage `CancelledError` warning — fix

### What you see in the video

Full-page storage error UI (red “**CancelledError**” + Retry), or the same text in the error panel — not a toast titled “Warning”.

### Root cause

1. `FileBrowser` watches `[currentPath, workspaceId]` and calls `refreshFiles()` → `listFiles()` on every change (`immediate: true`).
2. `listFiles` uses TanStack Query `queryClient.fetchQuery`.
3. When a newer fetch supersedes an in-flight one (workspace hydration, cache clear on workspace switch, rapid refreshes), Query **cancels** the previous fetch and throws `CancelledError` ([`@tanstack/query-core`](../../node_modules/@tanstack/query-core/src/retryer.ts)).
4. `useStorageFiles` catch block treats all errors alike:

   ```ts
   error.value = errorMessage(err, 'Failed to list files')
   // err.message === 'CancelledError'
   ```

5. `FileBrowser` renders `storageError` as a blocking error state.

**Reproduced:** headless Playwright on `/storage/files` with demo session — `CancelledError` visible **before any manifest clicks**.

This is **not** (primarily):

- File picker cancel in Playwright (upload clicks don’t attach files; no upload toast).
- Migration toast, disconnect modal, or vault wallet “top-up cancelled” banner.
- User-facing “cancelled” i18n string in storage.

### Recommended fixes (pick one or combine)

| Layer | Fix |
|-------|-----|
| **App (best)** | ✅ **Applied:** In `useStorageFiles.listFiles`, ignore `CancelledError` / `AbortError` — don't set `error.value`. |
| **Recorder** | After `goto`, `waitFor` successful grid **and** `waitForFunction(() => !document.body.innerText.includes('CancelledError'))` with timeout + fail fast. |
| **Recorder** | Add `wait: 3000` after load to let workspace + listing settle before steps. |
| **Manifest** | Replace upload/new-folder spam with deterministic steps after seed + `setInputFiles`. |
| **Seed** | Ensure demo workspace id stable in session to reduce workspace-id flip cancellations. |

### Secondary manifest/UI interaction bug

New-folder inline input commits on **blur**. Recording steps that click elsewhere (Upload) **create folders accidentally** (`folder 1`, `folder 2`, …) and can trigger reorder/API noise. Storyboard should use explicit **Enter** on folder name or Escape to cancel before other clicks.

---

## Slide: `integrations`

**Onboarding copy**

- Title: “Connect your tools”
- Description: Install from marketplace — Slack, GitHub, databases, etc.

### Goal

Viewer sees **marketplace browse** and opening an integration’s detail/install surface.

### Prerequisites

- PostHog feature flag **`integrations`** enabled for demo user.
- Marketplace catalog loads (`[data-testid^=integration-card-]`).
- Network access to catalog API in dev/staging.

### Storyboard (target ~25 s raw)

1. Land on `/integrations/marketplace` (2.5 s).
2. Open **integration detail** modal — hold (7 s).
3. Escape — browse grid (2 s).
4. Open a **second** card (different category if possible) (8 s).
5. Escape — slow pan on grid (6 s).

*Optional:* filter/sort, show Installed tab, or install CTA — only if stable in demo env.

### Current recording

- Opens 4 cards sequentially with Escape between — reasonable for “browse & inspect”.
- Does not install, search, or filter.

### Current issues

- Wrapped in `<FeatureGate name="integrations">` — flag off → empty/blocked UI.
- All cards may look identical if catalog is small.
- Detail modal content varies — some integrations may error or show empty config.

### Status

**Needs feature flag** + **catalog availability** · storyboard **mostly ready**

### Open questions

- [ ] Show **Installed** tab instead of marketplace?
- [ ] Highlight one **recognizable** integration (GitHub, Slack) by slug/testid?
- [ ] Show **install** flow or keep read-only to avoid side effects?

---

## Slide: `vault`

**Onboarding copy**

- Title: “Passwords and wallet”
- Description: Credentials + agent wallet for sign-in and paid services.
- Extra CTA in modal: “Import from your browser” (not in video today).

### Goal

Viewer sees **password vault** (list + add flow) and **wallet** (balance / activity) as two sub-areas.

### Prerequisites

- Passwords: ≥2 seeded credentials for a non-empty list.
- Wallet: PostHog feature flag **`wallet`** enabled (`useMeFeatures.isWalletEnabled()`).
- Wallet page shows UI, not placeholder (“Wallet is not enabled”) or perpetual loading.

### Storyboard (target ~30 s raw)

1. `/vault/accounts` — list visible (2.5 s).
2. **Add account** — modal open (5 s) — show fields; Escape (no save) *or* save a demo entry.
3. **Wallet** tab (9 s) — overview/balance.
4. **Passwords** tab (6 s).
5. Repeat add-password + wallet tab for rhythm (current recording pattern).

### Current recording

- Opens add modal twice (Escape only — no fill/submit).
- Toggles Passwords ↔ Wallet tabs.
- Does not show import CTA, edit, or wallet top-up.

### Current issues

- Empty password list on test account.
- Wallet gated on **`wallet`** flag — off → placeholder slide with no wallet story.
- Add modal opens empty — doesn’t demonstrate value.

### Status

**Needs seed data** · **wallet: feature flag / defer** if flag off for most users

### Open questions

- [ ] Is wallet **ready to demo** for all beta users, or defer wallet beats?
- [ ] Show **import from browser** CTA in modal footer vs video only?
- [ ] Use **masked** fake credentials (e.g. “demo@company.com”) for list richness?
- [ ] Show wallet **transactions** or **budgets** section specifically?

---

## Slide: `terms`

No video. Static hero + bullet acceptance in modal.

---

## Summary status matrix

| Slide | Status | Main blocker |
|-------|--------|--------------|
| welcome | **Recordable today** (Variant A) · storyboard pending | Second workspace or modal peek for i18n fit |
| workflows | Needs seed + storyboard | Rich workflow/viewport content |
| storage | **Needs seed + manifest** | empty files + manifest (CancelledError fixed) |
| integrations | Mostly ready | `integrations` flag + catalog |
| vault | Needs seed data | Password rows; `wallet` flag for wallet half |
| terms | N/A | — |

---

## Next steps (suggested order)

1. ~~**Fix or suppress `CancelledError`** in `useStorageFiles` (small app fix — high impact).~~ ✅ Done.
2. **Define demo workspace seed** (manual checklist or script).
3. Revise **storage manifest** (setInputFiles + explicit folder/move beats).
4. Revisit **workflows** manifest after seeding a showcase workflow.
5. Confirm **feature flags** for demo account (`integrations`, `wallet`).
6. Re-record slides individually; review in onboarding modal at 1200×720.

---

*Last updated: planning pass — no videos re-recorded.*
