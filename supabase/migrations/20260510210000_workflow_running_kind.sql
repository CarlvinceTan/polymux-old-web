-- Distinguish chat-driven activity from workflow_run engine activity for the
-- workflow-list spinner. `is_running` is a coarse "something is happening"
-- bool; the SidePanel needs to pick between two visually distinct indicators
-- and was previously inferring the kind only for the currently-open workflow.
-- Background workflows fell back to the workflow_run progress arc, even when
-- the running activity was actually orchestrator-spawned browser agents from
-- a chat that hasn't finished — misrepresenting them as scheduled/run-from-
-- node executions.
--
-- Values:
--   'chat'     — orchestrator / browser sub-agent driven by a chat turn.
--   'workflow' — a workflow_run is in flight (manual run-from-dock OR
--                scheduled cron). Read-only against the workflow definition.
--   NULL       — nothing running (mirrors is_running = false).

alter table public.workflows
  add column if not exists running_kind text;

alter table public.workflows
  drop constraint if exists workflows_running_kind_valid;
alter table public.workflows
  add  constraint workflows_running_kind_valid
  check (running_kind is null or running_kind in ('chat', 'workflow'));
