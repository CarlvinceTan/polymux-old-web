-- Soft-delete a workflow via SECURITY DEFINER RPC so the API server doesn't
-- depend on the workspace_members_update_workflows RLS policy applying to the
-- request's effective PostgreSQL role. Direct PATCH /workflows requests have
-- been rejected with code 42501 ("new row violates row-level security policy")
-- under conditions we couldn't reproduce reliably; routing through the RPC
-- removes the dependence on the policy's `to authenticated` clause while
-- still authorizing the caller via auth.uid() workspace membership.
--
-- The RPC raises:
--   42501 / 'unauthenticated'   when auth.uid() is null
--   42501 / 'forbidden'         when caller is not a workspace member
--   P0002 / 'workflow not found' when no matching workflow row exists
-- Successful soft-delete returns the updated row (deleted_at set).

create or replace function public.soft_delete_workflow(p_workflow_id uuid)
returns public.workflows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
  v_row public.workflows;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select workspace_id into v_ws
    from public.workflows
   where id = p_workflow_id
   for update;

  if not found then
    raise exception 'workflow not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
     where wm.workspace_id = v_ws
       and wm.user_id = v_uid
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.workflows
     set deleted_at = now()
   where id = p_workflow_id
   returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.soft_delete_workflow(uuid) from public;
grant execute on function public.soft_delete_workflow(uuid)
  to anon, authenticated, service_role;
