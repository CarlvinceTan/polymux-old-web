-- Maintenance windows: operator-scheduled service-downtime broadcasts.
--
-- The polymux Go api is single-instance in dev/beta; restarting it kills every
-- websocket and interrupts every scheduled tick. This table lets a maintainer
-- declare a downtime window ahead of time from the console. On insert/cancel,
-- the Go backend fans out an email + per-user inbox notification; the web app
-- subscribes to this table and renders a sticky banner during the 72h envelope
-- ending at ends_at. RLS enforces that envelope server-side so the banner
-- cannot leak a far-future entry into the client cache.
--
-- The advisory-only scope is deliberate: the api is itself what's being taken
-- down, so it cannot enforce its own downtime. Users see information;
-- operators perform the restart externally.
--
-- Writes are service-role only (no insert/update/delete policies). The
-- console proxies through polymux's /admin/maintenance routes which run under
-- the maintainerOnly gate.

create table if not exists public.maintenance_windows (
  id                          uuid        primary key default gen_random_uuid(),
  title                       text        not null check (char_length(title) between 1 and 200),
  description                 text        not null default '',
  starts_at                   timestamptz not null,
  ends_at                     timestamptz not null,
  created_by                  uuid        references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  cancelled_at                timestamptz,
  initial_email_sent_at       timestamptz,
  cancellation_email_sent_at  timestamptz,
  constraint mw_range_valid check (ends_at > starts_at)
);

-- Newest-first listing in the console.
create index if not exists mw_starts_at_desc
  on public.maintenance_windows (starts_at desc);

-- Cheap lookup for the banner's "is anything visible right now" path.
create index if not exists mw_active_idx
  on public.maintenance_windows (starts_at, ends_at)
  where cancelled_at is null;

alter table public.maintenance_windows enable row level security;

-- Authenticated users can read a window only when it's in the 72h-before
-- envelope through end-of-window. The banner subscription therefore cannot
-- leak a window scheduled more than 72h out — both Postgres SELECT and
-- realtime postgres_changes events respect this. Cancelled windows are
-- hidden so the banner disappears on cancel without an explicit client
-- refetch.
create policy "mw_read_visible" on public.maintenance_windows
  for select to authenticated
  using (
    cancelled_at is null
    and now() >= starts_at - interval '72 hours'
    and now() <= ends_at
  );

-- No insert/update/delete policies for end users — the polymux backend writes
-- with the service-role key.

-- Fan changes out to subscribed web clients. The publication-level grant lets
-- realtime emit INSERT/UPDATE/DELETE events; RLS still gates which clients
-- receive them.
alter publication supabase_realtime add table public.maintenance_windows;
