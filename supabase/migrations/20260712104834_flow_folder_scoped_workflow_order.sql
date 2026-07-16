-- Keep workflow positions independent inside each folder (and inside the
-- unfiled section). This mirrors the existing workspace-level row ordering,
-- but prevents a drag in one folder from rewriting rows in another folder.
create index if not exists idx_workflows_workspace_folder_position
  on public.workflows(workspace_id, folder_id, position desc)
  where deleted_at is null;

create or replace function public.reorder_folder_workflows(
  p_workspace_id uuid,
  p_folder_id    uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  total int;
  i     int;
begin
  if p_workspace_id is null or p_ordered_ids is null then
    return;
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_folder_id is not null and not exists (
    select 1 from public.flow_folders ff
    where ff.id = p_folder_id
      and ff.workspace_id = p_workspace_id
  ) then
    raise exception 'folder_not_found' using errcode = 'P0002';
  end if;

  total := array_length(p_ordered_ids, 1);
  if total is null or total = 0 then
    return;
  end if;

  for i in 1..total loop
    update public.workflows
       set position = (total - i + 1)
     where id = p_ordered_ids[i]
       and workspace_id = p_workspace_id
       and folder_id is not distinct from p_folder_id
       and deleted_at is null;
  end loop;
end;
$$;

revoke all on function public.reorder_folder_workflows(uuid, uuid, uuid[]) from public;
grant execute on function public.reorder_folder_workflows(uuid, uuid, uuid[]) to authenticated;

-- Moving a flow to a folder follows the same rule as creating a row: it lands
-- at the top of its new sibling scope. The assignment and position update are
-- one database operation so refreshes cannot observe a half-moved row.
create or replace function public.move_workflow_to_folder(
  p_workspace_id uuid,
  p_workflow_id  uuid,
  p_folder_id    uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_folder_id is not null and not exists (
    select 1 from public.flow_folders ff
    where ff.id = p_folder_id
      and ff.workspace_id = p_workspace_id
  ) then
    raise exception 'folder_not_found' using errcode = 'P0002';
  end if;

  update public.workflows target
     set folder_id = p_folder_id,
         position = coalesce((
           select max(sibling.position) + 1
             from public.workflows sibling
            where sibling.workspace_id = p_workspace_id
              and sibling.folder_id is not distinct from p_folder_id
              and sibling.deleted_at is null
              and sibling.id <> p_workflow_id
         ), 1)
   where target.id = p_workflow_id
     and target.workspace_id = p_workspace_id
     and target.deleted_at is null;

  if not found then
    raise exception 'workflow_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.move_workflow_to_folder(uuid, uuid, uuid) from public;
grant execute on function public.move_workflow_to_folder(uuid, uuid, uuid) to authenticated;
