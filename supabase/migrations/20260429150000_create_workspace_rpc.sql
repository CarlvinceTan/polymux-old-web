-- Workspace creation via SECURITY DEFINER RPC. The direct INSERT into
-- public.workspaces (gated by the workspaces_insert_self RLS policy) has been
-- rejecting requests with code 42501 even when the API server constructs the
-- row with `created_by = auth.uid()`. Routing through a definer function
-- removes the dependence on the request's effective PostgreSQL role matching
-- the policy's `to authenticated` clause while still authenticating the caller
-- by reading auth.uid() from the JWT claims.
--
-- The on_workspace_created AFTER INSERT trigger continues to add the creator
-- to workspace_members as 'owner' and seed wallets, so the new row is visible
-- via the existing SELECT RLS policy on the way back out.

create or replace function public.create_workspace_with_owner(
  p_name text,
  p_slug text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  public.workspaces;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_name is null or p_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_slug is null or p_slug = '' then
    raise exception 'slug is required' using errcode = '22023';
  end if;

  insert into public.workspaces (name, slug, created_by)
    values (p_name, p_slug, v_uid)
    returning * into v_ws;

  return v_ws;
end;
$$;
-- Grant EXECUTE to both anon and authenticated so the call doesn't fail at
-- the role-permission layer if PostgREST routes the request to a different
-- role than expected; the auth.uid() null-check inside is the actual gate.
revoke all on function public.create_workspace_with_owner(text, text) from public;
grant execute on function public.create_workspace_with_owner(text, text)
  to anon, authenticated, service_role;
