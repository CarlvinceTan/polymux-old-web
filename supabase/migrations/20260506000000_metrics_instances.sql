-- Metrics instances: every running polymux backend self-registers a row at
-- startup, refreshes last_heartbeat every ~10s, and deletes its row on
-- clean shutdown. The aggregating instance reads this table at the
-- /admin/metrics/stream tick to fan-in from peers via /internal/metrics/snapshot.
--
-- Service-role only — RLS denies anon/authenticated access. The console never
-- queries this table directly; only the polymux backend does, server-side.
-- Stale rows (heartbeat older than 30s) are filtered out at read time;
-- crashed instances age out without operator action.

create table if not exists public.instances (
  instance_id    text         primary key,
  internal_url   text         not null,
  hostname       text         not null,
  version        text         not null,
  started_at     timestamptz  not null,
  last_heartbeat timestamptz  not null default now()
);

create index if not exists instances_alive_idx
  on public.instances (last_heartbeat desc);

alter table public.instances enable row level security;
-- No policies: service-role only.
