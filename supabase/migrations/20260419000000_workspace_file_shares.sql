-- Workspace file sharing table.
--
-- Note: an earlier version of this migration created the table as
-- `workspace_file_shares`, but the live remote schema settled on `file_shares`
-- without an `updated_at` column. This file is the canonical, drift-free
-- definition; `20260510005000_reconcile_file_shares_drift.sql` brings any
-- stale local DB still on the old name into line.
create table if not exists public.file_shares (
  id                         uuid        primary key default gen_random_uuid(),
  workspace_id               uuid        not null references public.workspaces(id) on delete cascade,
  shared_with_workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  file_path                  text        not null,
  permission_level           text        not null check (permission_level in ('viewer', 'editor')),
  created_by                 uuid        not null references auth.users(id),
  created_at                 timestamptz not null default now(),
  constraint no_self_share check (workspace_id != shared_with_workspace_id),
  constraint no_circular_share unique (workspace_id, shared_with_workspace_id, file_path)
);
alter table public.file_shares enable row level security;
-- Workspace owners can create shares
create policy "workspace_owners_create_shares"
  on public.file_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_shares.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );
-- Workspace owners can delete shares they created
create policy "workspace_owners_delete_shares"
  on public.file_shares for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_shares.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );
-- Members of shared_with_workspace_id can view shares
create policy "shared_workspace_members_view_shares"
  on public.file_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_shares.shared_with_workspace_id
        and wm.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_shares.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- Create indexes for performance
create index if not exists idx_file_shares_workspace_id
  on public.file_shares(workspace_id);
create index if not exists idx_file_shares_shared_with_workspace_id
  on public.file_shares(shared_with_workspace_id);
create index if not exists idx_file_shares_file_path
  on public.file_shares(file_path);
