-- Durable HTTP request log. Every polymux backend instance writes through a
-- batched COPY (see internal/analytics/store/postgres_sink.go); the maintainer
-- console reads via /admin/http/logs which is gated to maintainers.
--
-- Daily range partitions keep retention cheap: drop a partition instead of
-- DELETE-then-VACUUM. analytics.create_http_log_partitions() pre-creates a few
-- days forward; analytics.drop_http_log_partitions() drops anything older
-- than retain_days. pg_cron schedules both to run daily.
--
-- RLS is enabled with no policies: the Go writer uses service_role and
-- bypasses RLS, the console reads server-side through the maintainer-gated
-- handler — no anon/authenticated access path exists.

create schema if not exists analytics;

create table if not exists analytics.http_logs (
  ts          timestamptz       not null,
  user_id     uuid,
  session_id  uuid,
  route       text              not null,
  method      text              not null,
  status      smallint          not null,
  duration_ms double precision  not null,
  bytes_in    bigint            not null,
  bytes_out   bigint            not null,
  instance    text
) partition by range (ts);

create table if not exists analytics.http_logs_default
  partition of analytics.http_logs default;

-- Indexes attach to all current and future child partitions automatically
-- (Postgres 11+ propagates indexes declared on the partitioned parent).
create index if not exists http_logs_ts_idx
  on analytics.http_logs (ts desc);

create index if not exists http_logs_errors_ts_idx
  on analytics.http_logs (ts desc) where status >= 400;

create index if not exists http_logs_user_ts_idx
  on analytics.http_logs (user_id, ts desc) where user_id is not null;

create index if not exists http_logs_route_ts_idx
  on analytics.http_logs (route, ts desc);

alter table analytics.http_logs enable row level security;

-- Pre-create today + N forward partitions so a near-midnight insert never
-- races partition creation. forward_days=3 covers a long weekend if the
-- daily cron skips a tick.
create or replace function analytics.create_http_log_partitions(forward_days int default 3)
returns void
language plpgsql
as $$
declare
  d     date;
  pname text;
begin
  for i in 0..forward_days loop
    d := (current_date + (i || ' days')::interval)::date;
    pname := format('http_logs_%s', to_char(d, 'YYYYMMDD'));
    execute format(
      'create table if not exists analytics.%I partition of analytics.http_logs
         for values from (%L) to (%L)',
      pname, d::timestamptz, (d + 1)::timestamptz
    );
  end loop;
end
$$;

-- Drop partitions strictly older than retain_days. Returns how many tables
-- were dropped so the cron schedule's last-run output is informative.
create or replace function analytics.drop_http_log_partitions(retain_days int default 30)
returns int
language plpgsql
as $$
declare
  cutoff date := (current_date - (retain_days || ' days')::interval)::date;
  rec    record;
  n      int := 0;
begin
  for rec in
    select c.relname as name
    from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
      join pg_namespace pn on pn.oid = p.relnamespace
    where pn.nspname = 'analytics'
      and p.relname  = 'http_logs'
      and c.relname ~ '^http_logs_[0-9]{8}$'
      and to_date(substring(c.relname from 11), 'YYYYMMDD') < cutoff
  loop
    execute format('drop table analytics.%I', rec.name);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Bootstrap on apply.
select analytics.create_http_log_partitions(3);

-- pg_cron is enabled on Supabase by default. If it isn't on this project the
-- two cron.schedule calls will fail — drop them and the Go scheduler will
-- need to drive partition lifecycle instead. See cmd/api wiring.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('http_logs_partitions') where exists (
      select 1 from cron.job where jobname = 'http_logs_partitions');
    perform cron.unschedule('http_logs_retention') where exists (
      select 1 from cron.job where jobname = 'http_logs_retention');

    perform cron.schedule(
      'http_logs_partitions', '5 0 * * *',
      $job$select analytics.create_http_log_partitions(3)$job$);

    perform cron.schedule(
      'http_logs_retention', '15 0 * * *',
      $job$select analytics.drop_http_log_partitions(30)$job$);
  end if;
end
$$;
