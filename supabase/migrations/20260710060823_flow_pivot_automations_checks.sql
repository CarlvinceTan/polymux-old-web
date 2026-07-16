-- Flow pivot: automations, trigger events, check results, typed artifacts.
--
-- This migration deliberately keeps the historical workflow_* tables in place
-- while adding the Flow-facing runtime model. Existing application code can
-- continue reading workflows during the compatibility window; new automation
-- code uses flow_automations and flow_trigger_events.

create table if not exists public.flow_automations (
  id                 uuid        primary key default gen_random_uuid(),
  workspace_id       uuid        not null references public.workspaces(id) on delete cascade,
  flow_id            uuid        not null references public.workflows(id) on delete cascade,
  name               text        not null default 'Automation',
  active             boolean     not null default false,
  trigger_type       text        not null default 'schedule'
    check (trigger_type in ('schedule','integration','webhook')),

  -- Schedule trigger config. Kept in flat columns so the existing calendar and
  -- Go scheduler can project runs without reparsing arbitrary JSON.
  frequency          text        not null default 'none'
    check (frequency in ('none','hourly','daily','weekly','monthly','custom')),
  cron_expression    text        not null default '',
  weekdays           int[]       not null default '{}',
  timezone           text        not null default 'UTC',
  one_off_ms         bigint[]    not null default '{}',

  integration_config jsonb       not null default '{}'::jsonb,
  webhook_config     jsonb       not null default '{}'::jsonb,
  runner_config      jsonb       not null default '{"platform":"web"}'::jsonb,
  updated_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_flow_automations_workspace
  on public.flow_automations(workspace_id, updated_at desc);
create index if not exists idx_flow_automations_flow
  on public.flow_automations(flow_id, updated_at desc);
create index if not exists idx_flow_automations_active_schedule
  on public.flow_automations(workspace_id)
  where active and trigger_type = 'schedule';
create index if not exists idx_flow_automations_integration_provider
  on public.flow_automations((integration_config->>'provider'))
  where active and trigger_type = 'integration';
create unique index if not exists uniq_flow_automations_webhook_secret
  on public.flow_automations((webhook_config->>'secret'))
  where trigger_type = 'webhook' and nullif(webhook_config->>'secret', '') is not null;

create or replace function public.touch_flow_automations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists flow_automations_touch_updated_at on public.flow_automations;
create trigger flow_automations_touch_updated_at
  before update on public.flow_automations
  for each row execute function public.touch_flow_automations_updated_at();

alter table public.flow_automations enable row level security;
grant select, insert, update, delete on public.flow_automations to authenticated;

drop policy if exists "workspace_members_read_flow_automations" on public.flow_automations;
create policy "workspace_members_read_flow_automations"
  on public.flow_automations for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_automations.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_insert_flow_automations" on public.flow_automations;
create policy "workspace_members_insert_flow_automations"
  on public.flow_automations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_automations.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_update_flow_automations" on public.flow_automations;
create policy "workspace_members_update_flow_automations"
  on public.flow_automations for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_automations.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_automations.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_delete_flow_automations" on public.flow_automations;
create policy "workspace_members_delete_flow_automations"
  on public.flow_automations for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_automations.workspace_id
        and wm.user_id = auth.uid()
    )
  );

insert into public.flow_automations (
  workspace_id, flow_id, name, active, trigger_type,
  frequency, cron_expression, weekdays, timezone, one_off_ms, updated_by,
  created_at, updated_at
)
select
  ws.workspace_id,
  ws.workflow_id,
  'Scheduled flow',
  ws.active,
  'schedule',
  ws.frequency,
  ws.cron_expression,
  ws.weekdays,
  ws.timezone,
  ws.one_off_ms,
  ws.updated_by,
  ws.created_at,
  ws.updated_at
from public.workflow_schedules ws
where not exists (
  select 1
  from public.flow_automations fa
  where fa.flow_id = ws.workflow_id
    and fa.trigger_type = 'schedule'
    and fa.frequency = ws.frequency
    and fa.cron_expression = ws.cron_expression
);

create table if not exists public.flow_trigger_events (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  flow_id         uuid        not null references public.workflows(id) on delete cascade,
  automation_id   uuid        references public.flow_automations(id) on delete set null,
  provider        text        not null,
  event_type      text        not null,
  idempotency_key text        not null,
  status          text        not null default 'queued'
    check (status in ('received','queued','ignored','failed')),
  summary         jsonb       not null default '{}'::jsonb,
  run_id          uuid,
  received_at     timestamptz not null default now(),
  error           text
);

create unique index if not exists uniq_flow_trigger_events_idempotency
  on public.flow_trigger_events(provider, idempotency_key);
create index if not exists idx_flow_trigger_events_automation
  on public.flow_trigger_events(automation_id, received_at desc);
create index if not exists idx_flow_trigger_events_flow
  on public.flow_trigger_events(flow_id, received_at desc);

alter table public.flow_trigger_events enable row level security;
grant select on public.flow_trigger_events to authenticated;

drop policy if exists "workspace_members_read_flow_trigger_events" on public.flow_trigger_events;
create policy "workspace_members_read_flow_trigger_events"
  on public.flow_trigger_events for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = flow_trigger_events.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "no_client_writes_flow_trigger_events_insert" on public.flow_trigger_events;
create policy "no_client_writes_flow_trigger_events_insert"
  on public.flow_trigger_events for insert
  to authenticated
  with check (false);
drop policy if exists "no_client_writes_flow_trigger_events_update" on public.flow_trigger_events;
create policy "no_client_writes_flow_trigger_events_update"
  on public.flow_trigger_events for update
  to authenticated
  using (false)
  with check (false);
drop policy if exists "no_client_writes_flow_trigger_events_delete" on public.flow_trigger_events;
create policy "no_client_writes_flow_trigger_events_delete"
  on public.flow_trigger_events for delete
  to authenticated
  using (false);

alter table public.workflow_runs
  add column if not exists automation_id uuid references public.flow_automations(id) on delete set null,
  add column if not exists trigger_event_id uuid references public.flow_trigger_events(id) on delete set null,
  add column if not exists external_event jsonb not null default '{}'::jsonb;

alter table public.workflow_runs
  drop constraint if exists workflow_runs_trigger_check;
alter table public.workflow_runs
  add constraint workflow_runs_trigger_check
  check (trigger in ('manual','schedule','integration','webhook'));

drop index if exists public.uniq_workflow_runs_schedule_slot;
create unique index if not exists uniq_workflow_runs_automation_slot
  on public.workflow_runs(automation_id, scheduled_for)
  where trigger = 'schedule' and automation_id is not null;

drop index if exists public.idx_workflow_runs_pending_due;
create index if not exists idx_workflow_runs_pending_due
  on public.workflow_runs(scheduled_for)
  where status = 'pending' and trigger in ('schedule','integration','webhook');

alter table public.flow_trigger_events
  drop constraint if exists flow_trigger_events_run_id_fkey;
alter table public.flow_trigger_events
  add constraint flow_trigger_events_run_id_fkey
  foreign key (run_id) references public.workflow_runs(id) on delete set null;

alter table public.artifacts
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists artifact_type text not null default 'other'
    check (artifact_type in ('screenshot','video','diff','trace','log','download','other'));

create index if not exists idx_artifacts_workflow_run
  on public.artifacts(workflow_run_id, created_at desc);

create table if not exists public.flow_check_results (
  id                  uuid        primary key default gen_random_uuid(),
  flow_run_id         uuid        not null references public.workflow_runs(id) on delete cascade,
  flow_version_id     uuid        references public.workflow_versions(id) on delete set null,
  node_id             text        not null,
  check_id            text        not null,
  label               text        not null,
  status              text        not null
    check (status in ('passed','failed','changed','needs_review','approved','rejected','skipped')),
  mode                text        not null default 'auto'
    check (mode in ('auto','comparison','review')),
  message             text,
  artifact_ids        uuid[]      not null default '{}',
  created_at          timestamptz not null default now()
);

create index if not exists idx_flow_check_results_run
  on public.flow_check_results(flow_run_id, created_at desc);

alter table public.flow_check_results enable row level security;
grant select on public.flow_check_results to authenticated;

drop policy if exists "workspace_members_read_flow_check_results" on public.flow_check_results;
create policy "workspace_members_read_flow_check_results"
  on public.flow_check_results for select
  to authenticated
  using (
    exists (
      select 1
        from public.workflow_runs wr
        join public.workflows w on w.id = wr.workflow_id
        join public.workspace_members wm on wm.workspace_id = w.workspace_id
       where wr.id = flow_check_results.flow_run_id
         and wm.user_id = auth.uid()
    )
  );

drop policy if exists "no_client_writes_flow_check_results_insert" on public.flow_check_results;
create policy "no_client_writes_flow_check_results_insert"
  on public.flow_check_results for insert
  to authenticated
  with check (false);
drop policy if exists "no_client_writes_flow_check_results_update" on public.flow_check_results;
create policy "no_client_writes_flow_check_results_update"
  on public.flow_check_results for update
  to authenticated
  using (false)
  with check (false);
drop policy if exists "no_client_writes_flow_check_results_delete" on public.flow_check_results;
create policy "no_client_writes_flow_check_results_delete"
  on public.flow_check_results for delete
  to authenticated
  using (false);

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
  update public.workflow_runs r
     set status     = 'running',
         claimed_at = p_now,
         claimed_by = p_instance
    from public.workflows w
   where r.id in (
     select wr.id
       from public.workflow_runs wr
      where wr.status        = 'pending'
        and wr.trigger       in ('schedule','integration','webhook')
        and wr.scheduled_for is not null
        and wr.scheduled_for <= p_now
      order by wr.scheduled_for asc
       limit p_limit
       for update skip locked
   )
     and w.id = r.workflow_id
  returning r.id, r.workflow_id, r.workflow_version_id,
    w.workspace_id,
    r.scheduled_for
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
           error       = 'automation dispatcher startup sweep: stale before claim'
     where status        = 'pending'
       and trigger       in ('schedule','integration','webhook')
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
