-- Atomically persist the sidebar's top-to-bottom flow-folder order.
create or replace function public.reorder_flow_folders(
  p_workspace_id uuid,
  p_ordered_ids  uuid[]
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

  total := array_length(p_ordered_ids, 1);
  if total is null or total = 0 then
    return;
  end if;

  for i in 1..total loop
    update public.flow_folders
       set position = (total - i + 1)
     where id = p_ordered_ids[i]
       and workspace_id = p_workspace_id;
  end loop;
end;
$$;

revoke all on function public.reorder_flow_folders(uuid, uuid[]) from public;
grant execute on function public.reorder_flow_folders(uuid, uuid[]) to authenticated;
