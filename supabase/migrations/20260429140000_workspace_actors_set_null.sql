-- Workspace-scoped tables carry actor pointers (created_by / connected_by /
-- invited_by / accepted_by / updated_by) for audit only. The workspace and
-- its contents must outlive the actor's account deletion — membership /
-- ownership lives in `workspace_members`, not in the audit pointer.
--
-- Convert each FK from NO ACTION to ON DELETE SET NULL, dropping NOT NULL
-- where present so the column can hold null after the user is gone.

-- workspaces.created_by — the workspace itself.
alter table public.workspaces
  alter column created_by drop not null;
alter table public.workspaces
  drop constraint workspaces_created_by_fkey,
  add  constraint workspaces_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
-- workspace_passwords.created_by
alter table public.workspace_passwords
  alter column created_by drop not null;
alter table public.workspace_passwords
  drop constraint workspace_passwords_created_by_fkey,
  add  constraint workspace_passwords_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
-- workspace_integrations.connected_by
alter table public.workspace_integrations
  alter column connected_by drop not null;
alter table public.workspace_integrations
  drop constraint workspace_integrations_connected_by_fkey,
  add  constraint workspace_integrations_connected_by_fkey
    foreign key (connected_by) references auth.users(id) on delete set null;
-- workspace_file_shares: skipped — table does not exist on the remote despite
-- the source migration `20260419000000_workspace_file_shares.sql`. Source files
-- have drifted from the actual schema; not in scope to reconcile here.

-- workspace_file_permissions.created_by (the grantor; user_id is the grantee
-- and already cascades — that's correct, the grant disappears with the user).
alter table public.workspace_file_permissions
  alter column created_by drop not null;
alter table public.workspace_file_permissions
  drop constraint workspace_file_permissions_created_by_fkey,
  add  constraint workspace_file_permissions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
-- workspace_invitations.invited_by / accepted_by
alter table public.workspace_invitations
  alter column invited_by drop not null;
alter table public.workspace_invitations
  drop constraint workspace_invitations_invited_by_fkey,
  add  constraint workspace_invitations_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;
alter table public.workspace_invitations
  drop constraint workspace_invitations_accepted_by_fkey,
  add  constraint workspace_invitations_accepted_by_fkey
    foreign key (accepted_by) references auth.users(id) on delete set null;
-- files.created_by — workspace-scoped file metadata; column is already nullable.
alter table public.files
  drop constraint files_created_by_fkey,
  add  constraint files_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
-- file_order.updated_by — workspace-scoped UI ordering; column already nullable.
alter table public.file_order
  drop constraint file_order_updated_by_fkey,
  add  constraint file_order_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
