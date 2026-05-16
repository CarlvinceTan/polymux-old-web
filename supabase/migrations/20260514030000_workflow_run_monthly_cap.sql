-- Workflow run monthly cap support: extend the scheduler RPC to surface the
-- claimed run's workspace_id (so the Go quota policy can apply per-plan caps
-- without an extra round-trip) and expose a helper that returns the current
-- calendar-month run count for a workspace.
--
-- Caps are NOT enforced in SQL — we keep policy in Go so admin-overrides and
-- "skipped" status messages stay easy to evolve. The SQL surface is purely
-- "give Go the numbers it needs".

-- 1. claim_due_scheduled_runs now returns workspace_id alongside the existing
--    columns. Implementation is otherwise unchanged from
--    20260510180000_workflow_run_scheduling_rpcs.sql — same SKIP LOCKED claim,
--    same idempotency guarantees. The added column comes from a JOIN to
--    workflows; workflow_id is a FK there, so the join is always satisfiable.
drop function if exists public.claim_due_scheduled_runs(text, timestamptz, int);

create or replace function public.claim_due_scheduled_runs(
  p_instance text,
  p_now      timestamptz,
  p_limit    int
)
returns table (
  id                  uuid,
  workflow_id         uuid,
  workflow_version_id uuid,
  workspace_id        uuid,
  scheduled_for       timestamptz
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.workflow_runs r
       set status     = 'running',
           claimed_at = p_now,
           claimed_by = p_instance
     where r.id in (
       select wr.id
         from public.workflow_runs wr
        where wr.status        = 'pending'
          and wr.trigger       = 'schedule'
          and wr.scheduled_for is not null
          and wr.scheduled_for <= p_now
        order by wr.scheduled_for asc
        limit p_limit
        for update skip locked
     )
    returning r.id, r.workflow_id, r.workflow_version_id, r.scheduled_for
  )
  select c.id, c.workflow_id, c.workflow_version_id, w.workspace_id, c.scheduled_for
    from claimed c
    join public.workflows w on w.id = c.workflow_id;
$$;

revoke all on function public.claim_due_scheduled_runs(text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_runs(text, timestamptz, int) to service_role;

-- 2. count_workspace_workflow_runs_this_month: returns the number of
--    workflow_runs rows for a workspace whose started_at lies in the current
--    UTC calendar month. The quota policy calls this on every Admit decision
--    (caching the result for ~5min to keep the read rate sane on heavy
--    workspaces).
--
--    Excludes 'skipped' status: a run that was already turned away by the
--    quota policy shouldn't count toward the next month boundary.
--
--    Counts ALL triggers (schedule, online/manual) because the plan budget
--    is "monthly workflow runs", not "monthly scheduled runs".
create or replace function public.count_workspace_workflow_runs_this_month(
  p_workspace_id uuid
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint
    from public.workflow_runs r
    join public.workflows w on w.id = r.workflow_id
   where w.workspace_id = p_workspace_id
     and r.status <> 'skipped'
     and r.started_at >= date_trunc('month', now() at time zone 'utc');
$$;

revoke all on function public.count_workspace_workflow_runs_this_month(uuid) from public, anon, authenticated;
grant execute on function public.count_workspace_workflow_runs_this_month(uuid) to service_role;
-- Authenticated callers need this for the API path that gates UI-triggered runs.
grant execute on function public.count_workspace_workflow_runs_this_month(uuid) to authenticated;
