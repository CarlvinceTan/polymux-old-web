-- Reconcile source/remote drift in the cross-workspace file-share schema.
--
-- Background: an earlier version of `20260419000000_workspace_file_shares.sql`
-- declared a `workspace_file_shares` table with an `updated_at` column, but
-- the live remote schema settled on `file_shares` with no `updated_at`. The
-- trigger function defined in `20260423030000_notify_file_migrated_to_local.sql`
-- referenced the stale name, so on the remote it has been silently failing
-- whenever a file migrates to local — see the comment in
-- `20260429140000_workspace_actors_set_null.sql`.
--
-- This migration:
--   1. Renames any stale `workspace_file_shares` to `file_shares` (covers
--      local DBs that applied the old source verbatim).
--   2. Drops the obsolete `updated_at` column if a stale local DB still has it.
--   3. Recreates the `notify_file_migrated_to_local` function with the correct
--      table reference, fixing the broken trigger on the remote.
-- Every step is idempotent — re-running on an already-canonical DB is a no-op.

-- 1. Rename `workspace_file_shares` to `file_shares` if needed.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'workspace_file_shares' and n.nspname = 'public'
  ) and not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'file_shares' and n.nspname = 'public'
  ) then
    alter table public.workspace_file_shares rename to file_shares;
  end if;
end $$;

-- 2. Drop the legacy `updated_at` column if a stale local DB still has it.
alter table if exists public.file_shares drop column if exists updated_at;

-- 3. Repair the migrated-to-local trigger function. The body referenced the
--    old table name and silently failed on every fire on the remote. CREATE
--    OR REPLACE is idempotent — local DBs that already had the correct
--    version are unaffected.
create or replace function public.notify_file_migrated_to_local() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if new.backend = 'local' and (old.backend is distinct from 'local') then
    insert into public.user_notifications (user_id, type, title, description, metadata)
    select recipient_id,
           'file_migrated_to_local',
           'A workspace file moved to a teammate''s device',
           '"' || new.path || '" is no longer available from the workspace — it now lives only on the device of the person who moved it.',
           jsonb_build_object(
             'file_id',      new.id,
             'file_path',    new.path,
             'workspace_id', new.workspace_id,
             'actor_id',     v_actor_id
           )
    from (
      select wm.user_id as recipient_id
      from public.workspace_members wm
      where wm.workspace_id = new.workspace_id
        and (v_actor_id is null or wm.user_id <> v_actor_id)
      union
      select wm.user_id as recipient_id
      from public.file_shares s
      join public.workspace_members wm
        on wm.workspace_id = s.shared_with_workspace_id
      where s.workspace_id = new.workspace_id
        and (new.path = s.file_path or new.path like s.file_path || '/%')
        and (v_actor_id is null or wm.user_id <> v_actor_id)
    ) recipients;
  end if;
  return new;
end;
$$;
