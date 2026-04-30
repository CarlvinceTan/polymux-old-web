-- Maintain `integrations.install_count` from `workspace_integrations`.
--
-- Previously the Marketplace catalog endpoint (`/api/marketplace/integrations`)
-- recomputed install counts per request by scanning every row in
-- `workspace_integrations` under service role. That scan grew with workspaces
-- × installed integrations and dominated catalog latency.
--
-- This migration replaces the per-request scan with a maintained counter:
--   - bump on insert
--   - decrement on delete
--   - re-target if a row's `provider` is ever changed
--
-- The trigger uses the `integrations.slug` ↔ `workspace_integrations.provider`
-- relationship (same convention used everywhere else in the app). If a
-- connection's provider doesn't match a catalog row (e.g. an orphaned legacy
-- row), the update silently no-ops — `install_count` simply doesn't move.

create or replace function public.bump_integration_install_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.integrations
       set install_count = install_count + 1
     where slug = new.provider;
    return new;
  elsif tg_op = 'DELETE' then
    update public.integrations
       set install_count = greatest(install_count - 1, 0)
     where slug = old.provider;
    return old;
  elsif tg_op = 'UPDATE' and new.provider is distinct from old.provider then
    update public.integrations
       set install_count = greatest(install_count - 1, 0)
     where slug = old.provider;
    update public.integrations
       set install_count = install_count + 1
     where slug = new.provider;
    return new;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_workspace_integrations_install_count
  on public.workspace_integrations;
create trigger trg_workspace_integrations_install_count
  after insert or update of provider or delete on public.workspace_integrations
  for each row execute function public.bump_integration_install_count();

-- Backfill: align the counter with the current state of the world.
update public.integrations i
   set install_count = coalesce(c.n, 0)
  from (
    select provider, count(*)::bigint as n
      from public.workspace_integrations
     group by provider
  ) c
 where c.provider = i.slug
   and i.install_count is distinct from c.n;

-- Reset rows with no current connections to 0 (in case a previously
-- non-zero counter is now stale).
update public.integrations i
   set install_count = 0
 where i.install_count <> 0
   and not exists (
     select 1 from public.workspace_integrations wi
      where wi.provider = i.slug
   );
