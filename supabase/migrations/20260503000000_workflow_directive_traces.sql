-- Per-directive action traces.
--
-- Captures the ordered sequence of low-level browser tool calls a sub-agent
-- issued while satisfying one directive node of a workflow_version. Used by
-- the runner to short-circuit subsequent runs of the same directive: instead
-- of paying for an LLM round-trip per Playwright primitive, the runner can
-- replay the recorded actions deterministically and only fall back to the
-- LLM-driven agent when replay drifts.
--
-- Keying: (workflow_version_id, node_id) is the natural key — a directive's
-- "recipe" is owned by the workflow version that defined it, so editing the
-- workflow (which creates a new version) auto-invalidates stale traces via
-- the FK cascade. node_id is the WorkflowStep.ID assigned by the executor.
--
-- Writes are server-side only (the Go runner observes the agent and persists
-- on success). Workspace members can read for diagnostics; no client writes.

create table if not exists public.workflow_directive_traces (
  workflow_version_id uuid        not null references public.workflow_versions(id) on delete cascade,
  node_id             text        not null,
  workflow_id         uuid        not null references public.workflows(id) on delete cascade,
  actions             jsonb       not null,
  recorded_at         timestamptz not null default now(),
  recorded_by_run_id  uuid                 references public.workflow_runs(id) on delete set null,
  primary key (workflow_version_id, node_id)
);
create index if not exists idx_workflow_directive_traces_workflow
  on public.workflow_directive_traces(workflow_id);
alter table public.workflow_directive_traces enable row level security;
-- Workspace members can read traces for diagnostics (e.g. an "actions" panel
-- on a directive in the workflow editor).
create policy "workspace_members_read_directive_traces"
  on public.workflow_directive_traces for select
  to authenticated
  using (
    exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_directive_traces.workflow_id
         and wm.user_id = auth.uid()
    )
  );
-- No client writes — the Go runner uses the service role to upsert traces
-- when a directive completes successfully.
create policy "no_client_writes_directive_traces_insert"
  on public.workflow_directive_traces for insert to authenticated with check (false);
create policy "no_client_writes_directive_traces_update"
  on public.workflow_directive_traces for update to authenticated using (false) with check (false);
create policy "no_client_writes_directive_traces_delete"
  on public.workflow_directive_traces for delete to authenticated using (false);
