-- Stamp turn_id on agent-authored workflow_versions so edit-resend can
-- delete versions that belong to discarded orchestrator turns.
--
-- Background: when the user edits a previous user message and resends it,
-- the server already drops the original message + every reply that
-- followed it (DeleteMessagesSince) and truncates the orchestrator's
-- in-memory History (TruncateHistoryAt). Persisted workflow_versions
-- saved by the agent during the discarded turns were left in place,
-- which left the saved workflow desynced from the chat the user is
-- looking at. Stamping turn_id closes that gap: the edit-resend handler
-- collects the turn_ids of deleted messages and deletes the matching
-- versions (and their workflow_directive_traces, via FK cascade).
--
-- Nullable on purpose. User-authored saves (source = 'user') are not
-- bound to a turn and stay turn_id IS NULL — the cleanup query filters
-- on turn_id IN (...), so user saves are never collected even if they
-- happened to land between two agent turns being thrown away.

alter table public.workflow_versions
  add column if not exists turn_id uuid;

-- Cleanup query is `workflow_id = $1 AND turn_id = ANY($2)`. The partial
-- index keeps it cheap without bloating storage with the long tail of
-- user-authored rows.
create index if not exists idx_workflow_versions_workflow_turn
  on public.workflow_versions(workflow_id, turn_id)
  where turn_id is not null;
