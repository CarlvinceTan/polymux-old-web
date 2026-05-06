-- "Latest manage access always overrides recursively."
--
-- When an admin sets a permission on a folder, any per-descendant grants under
-- that folder must be wiped so the new top-level grant is authoritative for
-- the entire subtree. The /files/permissions/apply endpoint calls this RPC.
--
-- Path convention matches workspace_file_permissions: relative, no leading or
-- trailing slash, '' = workspace root. Cascading from the root wipes every
-- non-root row.
--
-- starts_with() is used (not LIKE) so underscores and percent signs in paths
-- don't act as wildcards. SECURITY DEFINER + an explicit role check inside
-- the function lets us run the wipe transactionally without depending on the
-- caller's RLS for descendant rows.

create or replace function public.wipe_descendant_file_permissions(
  p_workspace_id uuid,
  p_path         text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path  text := coalesce(p_path, '');
  v_count integer;
begin
  if not exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id      = auth.uid()
       and wm.role in ('owner', 'admin')
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v_path = '' then
    delete from public.workspace_file_permissions wfp
     where wfp.workspace_id = p_workspace_id
       and wfp.path != '';
  else
    delete from public.workspace_file_permissions wfp
     where wfp.workspace_id = p_workspace_id
       and starts_with(wfp.path, v_path || '/');
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.wipe_descendant_file_permissions(uuid, text)
  to authenticated;
