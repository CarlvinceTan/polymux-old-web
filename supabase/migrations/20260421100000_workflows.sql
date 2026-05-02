-- Workflow tracking & user-tagging
-- Two tables: workflows (metadata per workspace) and workflow_versions (append-only history).
-- Every edit creates a new workflow_versions row; optimistic locking via version numbers.

create table if not exists public.workflows (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  name         text        not null,
  description  text,
  created_by   uuid        not null references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create table if not exists public.workflow_versions (
  id                  uuid        primary key default gen_random_uuid(),
  workflow_id         uuid        not null references public.workflows(id) on delete cascade,
  version             integer     not null,
  steps               jsonb       not null,
  source              text        not null default 'agent' check (source in ('user','agent')),
  change_summary      text,
  impact_level        text        not null default 'preference'
                         check (impact_level in ('trivial','preference','significant','fundamental')),
  agent_concern       text,
  tags                text[]      not null default '{}',
  locked_step_indices integer[]   not null default '{}',
  client_nonce        text,
  created_by          uuid        not null references auth.users(id),
  created_at          timestamptz not null default now(),
  unique (workflow_id, version),
  unique (workflow_id, client_nonce)
);
create index if not exists idx_workflows_workspace
  on public.workflows(workspace_id);
create index if not exists idx_workflow_versions_workflow
  on public.workflow_versions(workflow_id, version desc);
-- Keep workflows.updated_at in sync whenever metadata changes.
create or replace function public.touch_workflow_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists workflows_touch_updated_at on public.workflows;
create trigger workflows_touch_updated_at
  before update on public.workflows
  for each row execute function public.touch_workflow_updated_at();
-- Also bump workflows.updated_at whenever a new version is inserted for it.
create or replace function public.bump_workflow_on_version_insert()
returns trigger
language plpgsql
as $$
begin
  update public.workflows
     set updated_at = now()
   where id = new.workflow_id;
  return new;
end;
$$;
drop trigger if exists workflow_versions_bump_parent on public.workflow_versions;
create trigger workflow_versions_bump_parent
  after insert on public.workflow_versions
  for each row execute function public.bump_workflow_on_version_insert();
alter table public.workflows         enable row level security;
alter table public.workflow_versions enable row level security;
-- RLS: any workspace member can read/write workflows in their workspace.
create policy "workspace_members_read_workflows"
  on public.workflows for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workflows.workspace_id
        and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_insert_workflows"
  on public.workflows for insert
  to authenticated
  with check (
    exists (
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
create policy "workspace_members_read_versions"
  on public.workflow_versions for select
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_versions.workflow_id
         and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_insert_versions"
  on public.workflow_versions for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_versions.workflow_id
         and wm.user_id = auth.uid()
    )
  );
-- Versions are append-only: no update/delete policies. Deleting a workflow
-- cascades to its versions via the FK.;
