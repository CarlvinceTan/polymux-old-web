-- Phase 1: workflow trace persistence + feedback.
--
-- Adds:
--   1. workflows.deleted_at + partial-unique-index on (workspace_id, name) so a
--      user can re-use a name after soft-deleting the previous workflow.
--   2. message_feedback table for per-(user, message) thumbs up/down ratings.
--
-- The messages.metadata jsonb column already exists. New writes will populate
-- a structured envelope:
--
--   {
--     "meta_version": 1,
--     "turn_id": "<uuid>",
--     "attachments": [{"id":..., "name":...}],          // user rows
--     "thinking": [{"action":..., "detail":..., "ts":...}],
--     "tool_calls": [{"tool":..., "args_json":..., "result":..., "duration_ms":..., "started_at":...}],
--     "browser_agent_spawns": [{"agent_id":..., "task":..., "session_name":..., "closed_reason":..., "closed_summary":...}],
--     "boundary_seq": 0,
--     "agent_id": "<browser-agent-id>",
--     "usage": {"input_tokens":..., "output_tokens":...}
--   }
--
-- Existing rows without meta_version remain valid; the frontend treats them as
-- legacy and renders text only.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. workflows.deleted_at + soft-delete-aware uniqueness.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.workflows
  add column if not exists deleted_at timestamptz;
create index if not exists idx_workflows_active
  on public.workflows (workspace_id, updated_at desc)
  where deleted_at is null;
-- Replace the (workspace_id, name) unique constraint with a partial unique
-- index that ignores soft-deleted rows. The original constraint is dropped if
-- present; idempotency comes from `if exists`.
alter table public.workflows
  drop constraint if exists workflows_workspace_id_name_key;
drop index if exists public.workflows_workspace_id_name_active;
create unique index workflows_workspace_id_name_active
  on public.workflows (workspace_id, name)
  where deleted_at is null;
-- Tighten RLS policies so users only see / mutate non-deleted workflows.
-- The Go server uses the service role for admin-side reads (which bypasses RLS).
drop policy if exists "workspace_members_read_workflows"   on public.workflows;
drop policy if exists "workspace_members_update_workflows" on public.workflows;
drop policy if exists "workspace_members_delete_workflows" on public.workflows;
create policy "workspace_members_read_workflows"
  on public.workflows for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflows.workspace_id
        and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_update_workflows"
  on public.workflows for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflows.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflows.workspace_id
        and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_delete_workflows"
  on public.workflows for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflows.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- ──────────────────────────────────────────────────────────────────────────
-- 2. message_feedback: per-(user, message) thumbs rating.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.message_feedback (
  id          uuid        primary key default gen_random_uuid(),
  message_id  uuid        not null references public.messages(id) on delete cascade,
  workflow_id uuid        not null references public.workflows(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  rating      text        not null check (rating in ('up','down')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (message_id, user_id)
);
create index if not exists idx_message_feedback_workflow
  on public.message_feedback (workflow_id);
create index if not exists idx_message_feedback_message
  on public.message_feedback (message_id);
-- Touch updated_at on update.
create or replace function public.touch_message_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists message_feedback_touch_updated_at on public.message_feedback;
create trigger message_feedback_touch_updated_at
  before update on public.message_feedback
  for each row execute function public.touch_message_feedback_updated_at();
alter table public.message_feedback enable row level security;
-- A user can read / write only their own feedback rows. The Go server reads
-- aggregates via the service role for the maintainer dashboard.
create policy "owner_read_message_feedback"
  on public.message_feedback for select
  to authenticated
  using (user_id = auth.uid());
create policy "owner_insert_message_feedback"
  on public.message_feedback for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "owner_update_message_feedback"
  on public.message_feedback for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "owner_delete_message_feedback"
  on public.message_feedback for delete
  to authenticated
  using (user_id = auth.uid());
