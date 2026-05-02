-- Make workspace creation self-contained: when a workspace is inserted, the
-- AFTER INSERT trigger now adds the creator to workspace_members as 'owner' in
-- the same transaction. Previously the API server made a follow-up REST call to
-- INSERT INTO workspace_members, which RLS ("Owner or admin can add members")
-- rejected with 42501 because the user wasn't a member yet — leaving the
-- workspace orphaned (created but invisible to its creator).

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.wallets (workspace_id) values (NEW.id);
  insert into public.workspace_members (workspace_id, user_id, role)
    values (NEW.id, NEW.created_by, 'owner');
  return NEW;
end;
$$;
