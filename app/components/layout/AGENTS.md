# Layout Components

## "New Workflow" draft entry + workflow list in `Sidebar`

Each workflow has its own orchestrator chat (`/workflow/[id]/agent`). The sidebar **Chat** tab opens standalone general-assistant chats under `/chat/[id]`; do not reintroduce `/dashboard/console` as the default workspace home. The sidebar's Workflows list renders only persisted workflows (rows in the `workflows` table). The following rules are load-bearing — keep them intact across refactors.

- ✓ Use `/workflow/new` as the no-workflow-selected browse home.
- ✗ Do not point login, checkout, or workspace cleanup paths at `/dashboard/console`.

1. **The draft never renders as a list row.** The in-flight "New Workflow" draft lives only in `useWorkflowList`'s `draft` ref (allocated by `POST /draft-sessions`, persisted to `sessionStorage`). `displaySessions` projects `realSessions` only and must not prepend the draft. The Workflows list may be empty (a fresh workspace, or after deleting the last workflow) — do not re-add an "ensure at least one row" path.

2. **"New Workflow" is a nav button** (edit-pad icon), highlighted like the other nav items via `isNewWorkflowActive` while on `/workflow/new`. Pressing it calls `createWorkflow` → `createDraft` → navigates to `/workflow/${DRAFT_WORKFLOW_ID}` (`/workflow/new`), where the first prompt commits the draft into a real workflow with its own orchestrator. This button is the draft's only sidebar affordance.

3. **Only one draft at a time.** `createDraft` is idempotent: an existing in-memory / `sessionStorage` draft for the current workspace is reused. Any path that creates drafts must go through `createDraft`.

4. **Deleting the last workflow leaves an empty list.** An empty Workflows list is valid — "New Workflow" is the way back in. After deleting the active workflow when none remain, `runDeleteWorkflow` navigates to `/workflow/${DRAFT_WORKFLOW_ID}` (its `onMounted` re-creates the draft); it does not seed a row.
