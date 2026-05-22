-- Fan out a notification to every member of the receiving workspace whenever a
-- new cross-workspace file share is created. Mirrors the notify_session_edit
-- and notify_file_migrated_to_local patterns: SECURITY DEFINER bypasses RLS so
-- the trigger can insert one user_notifications row per recipient regardless
-- of the actor's permissions on the receiving workspace's tenant.
--
-- We don't fire on UPDATE: a permission-level change on an existing share is a
-- silent operation — the recipient already knows the share exists.

create or replace function public.notify_file_share_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_name text;
begin
  select name into v_source_name from public.workspaces where id = new.workspace_id;

  insert into public.user_notifications (user_id, type, title, description, metadata)
  select wm.user_id,
         'file_share_received',
         'Folder shared with your workspace',
         '"' || coalesce(nullif(new.file_path, ''), '/') || '" was shared from '
           || coalesce(v_source_name, 'another workspace') || '.',
         jsonb_build_object(
           'share_id',              new.id,
           'file_path',             new.file_path,
           'source_workspace_id',   new.workspace_id,
           'source_workspace_name', v_source_name,
           'target_workspace_id',   new.shared_with_workspace_id,
           'permission_level',      new.permission_level,
           'actor_id',              v_actor_id
         )
  from public.workspace_members wm
  where wm.workspace_id = new.shared_with_workspace_id
    and (v_actor_id is null or wm.user_id <> v_actor_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_file_share_received on public.file_shares;
create trigger trg_notify_file_share_received
  after insert on public.file_shares
  for each row execute function public.notify_file_share_received();
