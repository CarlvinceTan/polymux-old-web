# Layout Components

## "New Workflow" draft entry in `SidePanel`

The sidebar's workflow list renders only persisted workflows (rows in the `workflows` table). The current in-flight "New Workflow" draft (client-only state in `useWorkflowList`'s `draft` ref) is intentionally **not** shown as a list row — it only exists to back the `/workflow/new` page (file uploads, the first-prompt commit) until the user sends their first prompt, at which point `markDraftCommitted` promotes it into the list. The following rules are load-bearing — keep them intact across refactors.

1. **The draft never renders as a list row.** The draft lives only in `useWorkflowList`'s `draft` ref (allocated by `POST /draft-sessions`, persisted to `sessionStorage`). The `SidePanel` `displaySessions` watch projects `realSessions` only and must not prepend the draft. The Workflows list is allowed to be empty (a fresh workspace with no workflows shows an empty list) — do not re-add an "ensure at least one row" path.

2. **"New Workflow" is a nav button, highlighted like the other nav items.** Pressing it navigates to `/workflow/new`; while there, the button carries the same active highlight (`font-semibold` + left bar, guarded by `!isSearchOpen`) used by Integrations/Storage/Vault — see `isNewWorkflowActive`. This is the draft's only affordance in the sidebar.

3. **Only one draft can exist at a time.** `createDraft` is idempotent: if a draft already exists in memory or `sessionStorage` for the current workspace, it returns that draft instead of allocating another. Any code path that creates drafts (the "New Workflow" button, `/workflow/new` mount, post-delete fallback navigation) must go through `createDraft` so the singleton invariant holds.

4. **Deleting the last workflow leaves an empty list.** An empty Workflows list is a valid state — "New Workflow" is the way back in. After deleting the active workflow when none remain, `runDeleteWorkflow` navigates to `/workflow/new` (whose `onMounted` re-creates the draft); it does not seed a row to keep the list non-empty. `canDeleteWorkflow` only blocks draft rows, which never render anyway.
