-- effective_file_permission(workspace_id, path, user_id) →
--   'read' | 'write' | 'none'
--
-- Resolution algorithm:
--   1. If user is not a workspace member, return 'none'.
--   2. Walk from `path` toward root (''). At each ancestor:
--      a. If a user-specific grant exists, return it.
--      b. Else if an all-members grant exists, return it.
--   3. If no grant matched any ancestor, fall back to role default:
--      owner/admin → 'write', member → 'read'.
--
-- Paths follow the workspace_file_permissions convention: forward slashes,
-- no leading slash, no trailing slash, empty string = workspace root.
--
-- SECURITY DEFINER so the function can traverse tables regardless of the
-- caller's RLS. Inputs are validated; no raw SQL concatenation.

create or replace function public.effective_file_permission(
  p_workspace_id uuid,
  p_path         text,
  p_user_id      uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_grant  text;
  v_path   text := coalesce(p_path, '');
begin
  -- Membership check.
  select wm.role into v_role
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id;
  if v_role is null then
    return 'none';
  end if;

  -- Walk path from leaf toward root, one segment at a time. First match wins.
  loop
    -- User-specific grant at the current path.
    select wfp.grant_level into v_grant
      from public.workspace_file_permissions wfp
      where wfp.workspace_id = p_workspace_id
        and wfp.path = v_path
        and wfp.user_id = p_user_id;
    if v_grant is not null then
      return v_grant;
    end if;

    -- All-members grant at the current path.
    select wfp.grant_level into v_grant
      from public.workspace_file_permissions wfp
      where wfp.workspace_id = p_workspace_id
        and wfp.path = v_path
        and wfp.user_id is null;
    if v_grant is not null then
      return v_grant;
    end if;

    -- Stop once we've checked the workspace root.
    if v_path = '' then
      exit;
    end if;

    -- Move to parent path.
    if position('/' in v_path) = 0 then
      v_path := '';
    else
      v_path := regexp_replace(v_path, '/[^/]+$', '');
    end if;
  end loop;

  -- Role default.
  if v_role in ('owner', 'admin') then
    return 'write';
  else
    return 'read';
  end if;
end;
$$;

-- Authenticated users only; service role bypasses RLS by default.
grant execute on function public.effective_file_permission(uuid, text, uuid)
  to authenticated;
