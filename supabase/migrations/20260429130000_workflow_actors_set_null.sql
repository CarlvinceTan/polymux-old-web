-- Workspace-owned tables (workflows, workflow_versions, workflow_runs,
-- workflow_schedules) carry an actor pointer (created_by / started_by /
-- updated_by) for audit only. Today those columns are NOT NULL with no
-- ON DELETE clause, so deleting an `auth.users` row that authored any
-- workflow blocks the cascade and the Supabase admin `deleteUser` call
-- 500s. The workflow itself belongs to the workspace, not the actor —
-- if the workspace is owned by someone else, the row must outlive the
-- account deletion.
--
-- Convert each FK to ON DELETE SET NULL and drop the NOT NULL so the
-- audit pointer becomes "was set, user since deleted". Backend reads
-- decode JSON null into Go's empty string (`*string` would be cleaner
-- long-term but isn't needed for correctness today).

alter table public.workflows
  alter column created_by drop not null;
alter table public.workflows
  drop constraint workflows_created_by_fkey,
  add  constraint workflows_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
alter table public.workflow_versions
  alter column created_by drop not null;
alter table public.workflow_versions
  drop constraint workflow_versions_created_by_fkey,
  add  constraint workflow_versions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
alter table public.workflow_runs
  alter column started_by drop not null;
alter table public.workflow_runs
  drop constraint workflow_runs_started_by_fkey,
  add  constraint workflow_runs_started_by_fkey
    foreign key (started_by) references auth.users(id) on delete set null;
alter table public.workflow_schedules
  alter column updated_by drop not null;
alter table public.workflow_schedules
  drop constraint workflow_schedules_updated_by_fkey,
  add  constraint workflow_schedules_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
