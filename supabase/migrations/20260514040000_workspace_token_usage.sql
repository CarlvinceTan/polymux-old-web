-- Workspace token usage: one row per (workspace, ISO-week) tracking the
-- running sum of tokens spent against the plan's weekly budget. The Go
-- model.budgetLimitedModel wrapper flushes deltas here every few seconds so
-- a process restart doesn't lose mid-week usage and so multi-instance
-- deployments converge to the same view of "tokens spent this week".
--
-- week_start is the Monday 00:00 UTC at the start of the week containing
-- the usage. We use Monday-based weeks so the reset cadence aligns with the
-- pricing-page promise ("Monday's reset"). date_trunc('week', …) in
-- Postgres returns the Monday of the week containing the timestamp, which
-- matches the Go tracker's clock arithmetic.
--
-- Rows persist forever for usage analytics; the tracker only ever reads the
-- current-week row. A periodic prune job can drop weeks older than (say)
-- 90 days if storage becomes a concern.

create table if not exists public.workspace_token_usage (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  week_start   timestamptz not null,
  tokens_used  bigint      not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, week_start)
);

create index if not exists idx_workspace_token_usage_week
  on public.workspace_token_usage (week_start desc);

alter table public.workspace_token_usage enable row level security;

-- Workspace members can read their own usage row so the UI can render a
-- "tokens used this week / cap" widget without going through the server.
create policy "workspace_members_read_token_usage"
  on public.workspace_token_usage for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_token_usage.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Writes happen exclusively via the increment RPC below (SECURITY DEFINER),
-- so no INSERT/UPDATE policies are granted to authenticated. Service-role
-- bypasses RLS entirely.

-- increment_workspace_token_usage:
--   Atomically upserts the (workspace, week_start) row by adding p_delta to
--   tokens_used. Returns the new tokens_used so the caller can compare
--   against the cap in a single round-trip when refreshing its in-memory
--   counter. p_week_start is provided by the caller (Go) so all instances
--   agree on the week boundary without each parsing the locale.
create or replace function public.increment_workspace_token_usage(
  p_workspace_id uuid,
  p_week_start   timestamptz,
  p_delta        bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new bigint;
begin
  insert into public.workspace_token_usage as wtu
         (workspace_id, week_start, tokens_used, updated_at)
  values (p_workspace_id, p_week_start, greatest(p_delta, 0), now())
  on conflict (workspace_id, week_start) do update
    set tokens_used = wtu.tokens_used + greatest(p_delta, 0),
        updated_at  = now()
  returning tokens_used into v_new;
  return v_new;
end;
$$;

revoke all on function public.increment_workspace_token_usage(uuid, timestamptz, bigint) from public, anon, authenticated;
grant execute on function public.increment_workspace_token_usage(uuid, timestamptz, bigint) to service_role;

-- get_workspace_token_usage:
--   Returns the current-week tokens_used for a workspace (0 if no row exists
--   yet). Authenticated callers may read their own workspace via the SELECT
--   policy above; this RPC exists so the budget tracker can refresh from
--   service-role context without a full table scan / extra joins.
create or replace function public.get_workspace_token_usage(
  p_workspace_id uuid,
  p_week_start   timestamptz
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select tokens_used
       from public.workspace_token_usage
      where workspace_id = p_workspace_id
        and week_start   = p_week_start),
    0
  )::bigint;
$$;

revoke all on function public.get_workspace_token_usage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_workspace_token_usage(uuid, timestamptz) to service_role;
grant execute on function public.get_workspace_token_usage(uuid, timestamptz) to authenticated;
