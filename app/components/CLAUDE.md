# Components

## Archived components — do not remove

The following components are intentionally kept in the codebase even though they are not currently referenced anywhere. They are archived for potential future reuse and must not be deleted, renamed, or "cleaned up" as part of refactors or hygiene passes.

- `BugReportButton.vue` — floating bottom-right trigger with the bug-ant (spider-looking) icon that opens an inline `BugReportForm`. Previously mounted in `app.vue` on app routes; removed from active use but retained as-is.

If you are tempted to delete one of these because it appears unused, stop. Leave it untouched. If you genuinely believe an archived component should be retired, ask the user first.
