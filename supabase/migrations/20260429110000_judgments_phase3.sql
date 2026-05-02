-- Phase 3: LLM judge + maintainer review.
--
-- Adds:
--   1. session_judgments — per-workflow LLM-judge classifications, with claim
--      columns for multi-instance safety and review columns for the
--      maintainer's verdict.
--   2. workspace_settings — per-workspace toggles. Today: auto_judge.
--
-- Both tables are server-only (service role bypasses RLS). The maintainer
-- middleware in the Go server is the access boundary.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. session_judgments
-- ──────────────────────────────────────────────────────────────────────────

create table public.session_judgments (
  id                          uuid        primary key default gen_random_uuid(),
  workflow_id                 uuid        not null references public.workflows(id) on delete cascade,
  judge_model                 text        not null,
  directives_version          text        not null,
  status                      text        not null default 'pending'
                                check (status in ('pending','running','succeeded','failed')),
  score                       numeric,
  classifications             jsonb,
  reasoning                   text,
  error                       text,
  -- Worker-claim columns. The partial unique index below makes claim
  -- contention race-free across multiple Go instances:
  claimed_by                  text,
  claimed_at                  timestamptz,
  -- Maintainer review fields. Populated when a human confirms or overrides
  -- the judge's classification.
  review_status               text        default 'pending'
                                check (review_status in ('pending','approved','rejected','corrected')),
  reviewed_by                 uuid,
  reviewed_at                 timestamptz,
  review_notes                text,
  corrected_classifications   jsonb,
  created_at                  timestamptz not null default now()
);
-- One in-flight (pending or running) judgement per workflow at a time.
-- Inserts attempting to start a second concurrent judgement collide on this
-- index, so the first instance wins and the second instance treats the
-- collision as "already claimed" and bows out.
create unique index session_judgments_one_inflight_per_workflow
  on public.session_judgments (workflow_id)
  where status in ('pending','running');
create index idx_session_judgments_workflow on public.session_judgments (workflow_id, created_at desc);
create index idx_session_judgments_review   on public.session_judgments (review_status, created_at desc);
create index idx_session_judgments_status   on public.session_judgments (status, claimed_at)
  where status in ('pending','running');
alter table public.session_judgments enable row level security;
-- No client-side policies: only the service-role-key Go server reads / writes
-- these rows. Without explicit policies, RLS denies authenticated access by
-- default — the service role bypasses RLS entirely.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. workspace_settings
-- ──────────────────────────────────────────────────────────────────────────

create table public.workspace_settings (
  workspace_id uuid        primary key references public.workspaces(id) on delete cascade,
  auto_judge   boolean     not null default false,
  judge_model  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid        references auth.users(id)
);
create or replace function public.touch_workspace_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists workspace_settings_touch_updated_at on public.workspace_settings;
create trigger workspace_settings_touch_updated_at
  before update on public.workspace_settings
  for each row execute function public.touch_workspace_settings_updated_at();
alter table public.workspace_settings enable row level security;
-- Members of the workspace can read the settings (so the chat UI can show
-- "auto-judge enabled" badges).
create policy "workspace_members_read_settings"
  on public.workspace_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_settings.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- Writes are server-only via the service role. No insert/update/delete
-- policies for end users — the maintainer surface in the Go server owns
-- mutations.;
