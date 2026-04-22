-- Per-workspace, per-path, per-user file permission grants.
--
-- Resolution model (implemented in effective_file_permission RPC, next migration):
--   1. For a given (workspace, path, user), walk from the path toward the root.
--   2. At each step, a user-specific grant wins over an all-members (user_id
--      is null) grant.
--   3. If no grant matches any ancestor, fall back to the role default:
--      owner/admin → 'write', member → 'read'.
--
-- path convention: relative, forward-slash separated, no leading slash, no
-- trailing slash. Workspace root is the empty string ''.

create table if not exists public.workspace_file_permissions (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  path         text        not null,
  user_id      uuid                 references auth.users(id) on delete cascade,
  grant_level  text        not null check (grant_level in ('read', 'write', 'none')),
  created_by   uuid        not null references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, path, user_id)
);

-- NULL user_id means "all members"; the primary key treats NULLs as distinct
-- in PostgreSQL, so we rely on the trigger below to enforce single all-members
-- row per (workspace, path).
create unique index if not exists idx_workspace_file_permissions_all_members
  on public.workspace_file_permissions(workspace_id, path)
  where user_id is null;

create index if not exists idx_workspace_file_permissions_lookup
  on public.workspace_file_permissions(workspace_id, path);

create index if not exists idx_workspace_file_permissions_user
  on public.workspace_file_permissions(user_id, workspace_id)
  where user_id is not null;

alter table public.workspace_file_permissions enable row level security;

create or replace function public.touch_workspace_file_permissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_file_permissions_touch_updated_at on public.workspace_file_permissions;
create trigger trg_workspace_file_permissions_touch_updated_at
  before update on public.workspace_file_permissions
  for each row execute function public.touch_workspace_file_permissions_updated_at();

-- Any workspace member can read grants (needed for UI to show effective
-- permission without extra round-trips).
create policy "workspace_members_read_file_permissions"
  on public.workspace_file_permissions for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_permissions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Only owners and admins can write grants.
create policy "workspace_admins_insert_file_permissions"
  on public.workspace_file_permissions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_update_file_permissions"
  on public.workspace_file_permissions for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_delete_file_permissions"
  on public.workspace_file_permissions for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_file_permissions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );
