-- Schedule-triggered workflow runs.
--
-- Extends workflow_runs so the in-process scheduler can insert pending rows
-- for cron-driven and one-off scheduled fires. The dispatcher claims rows
-- atomically with FOR UPDATE SKIP LOCKED; the unique index on
-- (workflow_id, scheduled_for) WHERE trigger='schedule' makes the tick
-- idempotent — re-ticking the same window can't double-fire a slot.
--
-- Adds two terminal statuses:
--   skipped — quota policy declined to run this slot (visible in run history)
--   expired — claim happened too late (now - scheduled_for > maxStaleness)
-- Both end-states; neither retries.
--
-- RLS tightening: clients keep inserting manual runs through the existing
-- handler, but the new 'schedule' trigger value is reserved for the Go
-- scheduler running under the service role.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Columns.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.workflow_runs
  add column if not exists trigger       text        not null default 'manual'
    check (trigger in ('manual','schedule')),
  add column if not exists scheduled_for timestamptz,
  add column if not exists claimed_at    timestamptz,
  add column if not exists claimed_by    text;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Status enum: add 'skipped' and 'expired' as terminal scheduler states.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.workflow_runs
  drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs
  add  constraint workflow_runs_status_check
  check (status in ('pending','running','succeeded','failed','cancelled','skipped','expired'));

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Indexes.
--    uniq_workflow_runs_schedule_slot is the tick's idempotency anchor:
--    re-enumerating the same window cannot double-insert.
--    idx_workflow_runs_pending_due narrows the dispatcher's claim query.
-- ──────────────────────────────────────────────────────────────────────────

create unique index if not exists uniq_workflow_runs_schedule_slot
  on public.workflow_runs(workflow_id, scheduled_for)
  where trigger = 'schedule';
create index if not exists idx_workflow_runs_pending_due
  on public.workflow_runs(scheduled_for)
  where status = 'pending' and trigger = 'schedule';
-- ──────────────────────────────────────────────────────────────────────────
-- 4. RLS: keep manual writes open to workspace members, deny clients from
--    forging trigger='schedule' rows. The Go scheduler bypasses RLS via the
--    service-role key so this only constrains the user-JWT path.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "workspace_members_insert_runs" on public.workflow_runs;
drop policy if exists "workspace_members_insert_manual_runs" on public.workflow_runs;
create policy "workspace_members_insert_manual_runs"
  on public.workflow_runs for insert
  to authenticated
  with check (
    trigger = 'manual'
    and exists (
      select 1
        from public.workflows w
        join public.workspace_members wm
          on wm.workspace_id = w.workspace_id
       where w.id = workflow_runs.workflow_id
         and wm.user_id = auth.uid()
    )
  );
