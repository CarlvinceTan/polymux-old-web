-- Workflow runtime state
-- Each execution of a workflow_version is a workflow_runs row. The executor
-- updates node_states in-place as directives complete. current_node_path is the
-- active cursor (array of node IDs, innermost last) so the UI can flash the node.

create table if not exists public.workflow_runs (
  id                  uuid        primary key default gen_random_uuid(),
  workflow_id         uuid        not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid        not null references public.workflow_versions(id) on delete cascade,
  session_id          uuid                 references public.sessions(id) on delete set null,
  status              text        not null default 'pending'
                         check (status in ('pending','running','succeeded','failed','cancelled')),
  current_node_path   text[]      not null default '{}',
  node_states         jsonb       not null default '{}'::jsonb,
  error               text,
  started_by          uuid        not null references auth.users(id),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index if not exists idx_workflow_runs_workflow
  on public.workflow_runs(workflow_id, started_at desc);
create index if not exists idx_workflow_runs_session
  on public.workflow_runs(session_id)
  where session_id is not null;
create index if not exists idx_workflow_runs_status
  on public.workflow_runs(status)
  where status in ('pending','running');
alter table public.workflow_runs enable row level security;
-- Any workspace member can read runs for workflows in their workspace.
create policy "workspace_members_read_runs"
  on public.workflow_runs for select
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_runs.workflow_id
         and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_insert_runs"
  on public.workflow_runs for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_runs.workflow_id
         and wm.user_id = auth.uid()
    )
  );
create policy "workspace_members_update_runs"
  on public.workflow_runs for update
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_runs.workflow_id
         and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_runs.workflow_id
         and wm.user_id = auth.uid()
    )
  );
