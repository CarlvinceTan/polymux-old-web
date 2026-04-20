-- Workspace file sharing table
create table if not exists public.workspace_file_shares (
  id                         uuid        primary key default gen_random_uuid(),
  workspace_id               uuid        not null references public.workspaces(id) on delete cascade,
  shared_with_workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  file_path                  text        not null,
  permission_level           text        not null check (permission_level in ('viewer', 'editor')),
  created_by                 uuid        not null references auth.users(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint no_self_share check (workspace_id != shared_with_workspace_id),
  constraint no_circular_share unique (workspace_id, shared_with_workspace_id, file_path)
);

alter table public.workspace_file_shares enable row level security;

-- Workspace owners can create shares
create policy "workspace_owners_create_shares"
  on public.workspace_file_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_shares.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- Workspace owners can delete shares they created
create policy "workspace_owners_delete_shares"
  on public.workspace_file_shares for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_shares.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- Members of shared_with_workspace_id can view shares
create policy "shared_workspace_members_view_shares"
  on public.workspace_file_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_shares.shared_with_workspace_id
        and wm.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_shares.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Create indexes for performance
create index if not exists idx_workspace_file_shares_workspace_id 
  on public.workspace_file_shares(workspace_id);

create index if not exists idx_workspace_file_shares_shared_with_workspace_id 
  on public.workspace_file_shares(shared_with_workspace_id);

create index if not exists idx_workspace_file_shares_file_path 
  on public.workspace_file_shares(file_path);
