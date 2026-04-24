-- Cross-device persistence for workflow schedules
-- The Schedule tab under /workflow/[id] saves here; the dashboard usage page
-- reads active rows to project recurring cost. `session_id` is the primary
-- key because /workflow/[id] routes by session id — in this app a "workflow"
-- in the UI is backed by one session row (see app/pages/workflow/[id].vue).
-- workspace_id is denormalized so RLS and list queries don't have to join.

create table if not exists public.workflow_schedules (
  session_id      uuid        primary key references public.sessions(id) on delete cascade,
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

create index if not exists idx_workflow_schedules_workspace_active
  on public.workflow_schedules(workspace_id)
  where active = true;

-- Bump updated_at on any mutation.
create or replace function public.touch_workflow_schedule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workflow_schedules_touch_updated_at on public.workflow_schedules;
create trigger workflow_schedules_touch_updated_at
  before update on public.workflow_schedules
  for each row execute function public.touch_workflow_schedule_updated_at();

alter table public.workflow_schedules enable row level security;

-- RLS: any workspace member can read/write schedules for their workspace.
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
