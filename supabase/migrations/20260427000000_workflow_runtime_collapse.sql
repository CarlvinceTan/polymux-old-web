-- Collapse session ↔ workflow into a single durable entity.
--
-- Before this migration: `public.sessions` was the durable runtime row owning
-- chat history (`messages.session_id`), artifacts, schedules, and viewport-URL
-- snapshots. The frontend at /workflow/[id] already reused the route param as
-- both workflow_id and session_id.
--
-- After this migration: `public.workflows` owns all durable state. A "session"
-- is a purely in-memory execution context held by the Go backend (orchestrator
-- agent, browser sub-agents, sandbox dir) — it has no DB row. Tables that used
-- to key off session_id now key off workflow_id directly.
--
-- Concurrency model: at most one in-memory session per workflow per workspace.
-- Concurrent users in the same workspace share that session.
--
-- Clean cutover (no backfill): existing data in sessions/messages/artifacts/
-- workflow_schedules is destroyed.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Drop old triggers + the sessions table (CASCADE clears dependent FKs).
-- ──────────────────────────────────────────────────────────────────────────

drop trigger  if exists trg_notify_session_edit on public.sessions;
drop function if exists public.notify_session_edit();

-- Drop tables that key off sessions; we recreate them below with workflow_id.
drop table if exists public.workflow_schedules cascade;
drop table if exists public.artifacts          cascade;
drop table if exists public.messages           cascade;

-- Now the sessions table itself. CASCADE removes any remaining FK references
-- (e.g. workflow_runs.session_id) along with the table.
drop table if exists public.sessions cascade;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. workflows: own the durable runtime snapshot fields.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.workflows
  add column if not exists last_viewport_urls jsonb not null default '[]'::jsonb;

alter table public.workflows
  drop constraint if exists workflows_last_viewport_urls_is_array;
alter table public.workflows
  add  constraint workflows_last_viewport_urls_is_array
  check (jsonb_typeof(last_viewport_urls) = 'array');

-- ──────────────────────────────────────────────────────────────────────────
-- 3. workflow_runs: drop the now-meaningless session_id column.
--    Runs are pure history and never reference live runtime.
-- ──────────────────────────────────────────────────────────────────────────

drop index if exists public.idx_workflow_runs_session;
alter table public.workflow_runs drop column if exists session_id;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. messages: rebuilt with workflow_id key.
-- ──────────────────────────────────────────────────────────────────────────

create table public.messages (
  id          uuid        primary key default gen_random_uuid(),
  workflow_id uuid        not null references public.workflows(id) on delete cascade,
  agent_id    text,
  role        text        not null check (role in ('user','assistant','system','tool')),
  content     text        not null,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_messages_workflow_agent_created
  on public.messages (workflow_id, agent_id, created_at);

alter table public.messages enable row level security;

create policy "workspace_members_read_messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = messages.workflow_id
         and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_insert_messages"
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = messages.workflow_id
         and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_delete_messages"
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = messages.workflow_id
         and wm.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 5. artifacts: workflow-scoped persistent. Workflow delete → artifacts gone.
-- ──────────────────────────────────────────────────────────────────────────

create table public.artifacts (
  id                  uuid        primary key default gen_random_uuid(),
  workflow_id         uuid        not null references public.workflows(id) on delete cascade,
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  name                text        not null,
  mime_type           text,
  size_bytes          bigint      not null default 0,
  storage_path        text,
  content             text,
  created_by_agent_id text,
  created_at          timestamptz not null default now()
);

create index idx_artifacts_workflow  on public.artifacts(workflow_id, created_at desc);
create index idx_artifacts_workspace on public.artifacts(workspace_id);

alter table public.artifacts enable row level security;

create policy "workspace_members_read_artifacts"
  on public.artifacts for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = artifacts.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- No direct client writes; service role / Go backend only.
create policy "no_client_writes_artifacts_insert"
  on public.artifacts for insert to authenticated with check (false);
create policy "no_client_writes_artifacts_update"
  on public.artifacts for update to authenticated using (false) with check (false);
create policy "no_client_writes_artifacts_delete"
  on public.artifacts for delete to authenticated using (false);

-- ──────────────────────────────────────────────────────────────────────────
-- 6. workflow_schedules: PK is workflow_id (one schedule per workflow).
-- ──────────────────────────────────────────────────────────────────────────

create table public.workflow_schedules (
  workflow_id     uuid        primary key references public.workflows(id) on delete cascade,
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  active          boolean     not null default false,
  frequency       text        not null default 'none'
                     check (frequency in ('none','hourly','daily','weekly','monthly','custom')),
  cron_expression text        not null default '',
  weekdays        integer[]   not null default '{}',
  timezone        text        not null default 'UTC',
  one_off_ms      bigint[]    not null default '{}',
  updated_by      uuid        not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_workflow_schedules_workspace_active
  on public.workflow_schedules(workspace_id)
  where active = true;

drop trigger  if exists workflow_schedules_touch_updated_at on public.workflow_schedules;
create trigger workflow_schedules_touch_updated_at
  before update on public.workflow_schedules
  for each row execute function public.touch_workflow_schedule_updated_at();

alter table public.workflow_schedules enable row level security;

create policy "workspace_members_read_schedules"
  on public.workflow_schedules for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflow_schedules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_insert_schedules"
  on public.workflow_schedules for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflow_schedules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_update_schedules"
  on public.workflow_schedules for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflow_schedules.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflow_schedules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_delete_schedules"
  on public.workflow_schedules for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflow_schedules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 7. Notifications: replace notify_session_edit with workflow-scoped triggers.
--    Renames fan out via UPDATE; deletions fan out via BEFORE DELETE so the
--    workflow row is still readable when the notification is composed.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.notify_workflow_renamed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if new.name is distinct from old.name then
    insert into public.user_notifications (user_id, type, title, description, metadata)
    select wm.user_id,
           'workflow_renamed',
           'Workflow renamed',
           'Renamed to "' || new.name || '"',
           jsonb_build_object(
             'workflow_id',  new.id,
             'workspace_id', new.workspace_id,
             'actor_id',     v_actor_id,
             'new_name',     new.name,
             'old_name',     old.name
           )
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and (v_actor_id is null or wm.user_id <> v_actor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_workflow_renamed on public.workflows;
create trigger trg_notify_workflow_renamed
  after update on public.workflows
  for each row execute function public.notify_workflow_renamed();

create or replace function public.notify_workflow_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
begin
  insert into public.user_notifications (user_id, type, title, description, metadata)
  select wm.user_id,
         'workflow_deleted',
         'Workflow deleted',
         'Workflow "' || old.name || '" was deleted',
         jsonb_build_object(
           'workflow_id',  old.id,
           'workspace_id', old.workspace_id,
           'actor_id',     v_actor_id,
           'name',         old.name
         )
  from public.workspace_members wm
  where wm.workspace_id = old.workspace_id
    and (v_actor_id is null or wm.user_id <> v_actor_id);
  return old;
end;
$$;

drop trigger if exists trg_notify_workflow_deleted on public.workflows;
create trigger trg_notify_workflow_deleted
  before delete on public.workflows
  for each row execute function public.notify_workflow_deleted();
