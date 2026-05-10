-- Fan out a notification to every user who loses access when a workspace
-- file is migrated to a single-device "local" backend. Recipients are
-- workspace members (minus the actor) plus members of workspaces that had
-- a share grant on the file. Mirrors the notify_session_edit pattern.

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
      -- Direct workspace members except the actor.
      select wm.user_id as recipient_id
      from public.workspace_members wm
      where wm.workspace_id = new.workspace_id
        and (v_actor_id is null or wm.user_id <> v_actor_id)
      union
      -- Members of any workspace that currently has a share grant on this
      -- file's path. Use prefix matching so folder-level shares cover the
      -- migrated file.
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
drop trigger if exists trg_notify_file_migrated_to_local on public.files;
create trigger trg_notify_file_migrated_to_local
  after update of backend on public.files
  for each row execute function public.notify_file_migrated_to_local();
