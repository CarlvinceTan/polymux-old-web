-- Multi-instance-safe scheduler RPCs.
--
-- Two functions:
--
--   claim_due_scheduled_runs(p_instance, p_now, p_limit)
--     Atomically claims up to p_limit pending+due scheduled runs by setting
--     status='running', claimed_at=p_now, claimed_by=p_instance, and returns
--     the claimed rows. Uses FOR UPDATE SKIP LOCKED on the inner SELECT so
--     concurrent dispatchers in different cmd/api processes get disjoint
--     subsets — no double-dispatch. The previous PostgREST PATCH+LIMIT
--     approach didn't take row locks during selection, which let two
--     instances claim the same row before either committed.
--
--   expire_stale_scheduled_runs(p_now, p_max_staleness)
--     Bulk-marks every pending+schedule-triggered row whose scheduled_for
--     is older than p_now - p_max_staleness as 'expired'. Returns the
--     count for logging. Called once on scheduler startup so a long outage
--     doesn't trickle stale rows through the dispatcher one batch at a time.
--
-- Both run as SECURITY DEFINER. Only service_role has EXECUTE — the user-JWT
-- code path has no business invoking either.

create or replace function public.claim_due_scheduled_runs(
  p_instance text,
  p_now      timestamptz,
  p_limit    int
)
returns table (
  id                  uuid,
  workflow_id         uuid,
  workflow_version_id uuid,
  scheduled_for       timestamptz
)
language sql
security definer
set search_path = public
as $$
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
  returning r.id, r.workflow_id, r.workflow_version_id, r.scheduled_for;
$$;

create or replace function public.expire_stale_scheduled_runs(
  p_now           timestamptz,
  p_max_staleness interval
)
returns bigint
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.workflow_runs
       set status      = 'expired',
           finished_at = p_now,
           error       = 'scheduler startup sweep: stale before claim'
     where status        = 'pending'
       and trigger       = 'schedule'
       and scheduled_for is not null
       and (p_now - scheduled_for) > p_max_staleness
    returning 1
  )
  select count(*)::bigint from expired;
$$;

revoke all on function public.claim_due_scheduled_runs(text, timestamptz, int) from public, anon, authenticated;
revoke all on function public.expire_stale_scheduled_runs(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_runs(text, timestamptz, int) to service_role;
grant execute on function public.expire_stale_scheduled_runs(timestamptz, interval) to service_role;
