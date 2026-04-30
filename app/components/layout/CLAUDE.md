# Layout Components

## "New Workflow" draft entry in `SidePanel`

The sidebar's workflow list mixes persisted workflows (rows in the `workflows` table) with the current in-flight "New Workflow" draft (client-only state in `useWorkflowList`'s `draft` ref). The draft must behave like a workflow row in the list while it exists, even though it has no DB row until the user sends their first prompt. The following rules are load-bearing — keep them intact across refactors.

1. **Always renders despite having no DB row.** The draft lives only in `useWorkflowList`'s `draft` ref (allocated by `POST /draft-sessions`, persisted to `sessionStorage`). When non-null, the `SidePanel` `displaySessions` watch must prepend it to the rendered list. Filtering the workflow list to "rows the server returned" is wrong — the draft will never satisfy that predicate.

2. **Pinned at the top; never displaceable by drag.** Other workflow rows can be reordered freely, but no row may move above the draft. SortableJS enforces this via `filter: '.wf-draft'` (the draft itself isn't draggable) and `onDragMove` rejects any drop whose `related` carries the `.wf-draft` class.

3. **Only one draft can exist at a time.** `createDraft` is idempotent: if a draft already exists in memory or `sessionStorage` for the current workspace, it returns that draft instead of allocating another. Any code path that creates drafts (the "+ New Workflow" button, `/workflow/new` mount, `ensureAtLeastOneWorkflow`, post-delete fallback) must go through `createDraft` so the singleton invariant holds.

4. **Deleting the sole draft is a no-op.** When the draft is the only entry in the list, the delete action is disabled (`canDeleteWorkflow` returns `false`) — the list must never be empty, and there's no real workflow to fall back to. Deletion is allowed when other workflows exist alongside the draft.
