-- Phase 5: benchmark runs + results tables.
--
-- Adds bench_runs and bench_results so a maintainer can launch and track
-- benchmark sweeps from the admin UI. The CLI tool at cmd/benchmark continues
-- to emit JSONL to disk; the HTTP path additionally streams per-attempt rows
-- into bench_results so the UI can render live progress.
--
-- Service-role-only: no RLS policies for end users. The maintainer middleware
-- in the Go server gates all reads/writes.

create table public.bench_runs (
  id                    uuid        primary key default gen_random_uuid(),
  workspace_id          uuid        references public.workspaces(id) on delete set null,
  created_by            uuid        not null references auth.users(id),
  status                text        not null default 'queued'
                          check (status in ('queued','running','completed','failed','aborted')),
  mode                  text        not null check (mode in ('single','multi','all')),
  parallel              integer     not null default 1,
  retries               integer     not null default 0,
  timeout_seconds       integer     not null,
  rpm                   integer,
  prompts               jsonb       not null,
  config_overrides      jsonb,
  assigned_instance_id  text,
  started_at            timestamptz,
  completed_at          timestamptz,
  summary               jsonb,
  error                 text,
  created_at            timestamptz not null default now()
);
create index idx_bench_runs_status on public.bench_runs (status, created_at desc);
create index idx_bench_runs_workspace on public.bench_runs (workspace_id, created_at desc);
create table public.bench_results (
  id            uuid        primary key default gen_random_uuid(),
  run_id        uuid        not null references public.bench_runs(id) on delete cascade,
  idx           integer     not null,
  prompt        text        not null,
  attempt       integer     not null,
  pass          boolean     not null,
  duration_ms   bigint,
  spawned_count integer,
  spawned_ids   jsonb,
  reply_bytes   integer,
  reply_tail    text,
  trace         jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  unique (run_id, idx, attempt)
);
create index idx_bench_results_run on public.bench_results (run_id, idx, attempt);
alter table public.bench_runs enable row level security;
alter table public.bench_results enable row level security;
-- No client-facing policies: service-role only.;
