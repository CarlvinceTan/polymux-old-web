-- Update storage RLS policies for workspace-scoped access

-- Drop old user-based policies (if they exist)
drop policy if exists "bucket_access_authenticated" on storage.objects;
drop policy if exists "user_authenticated_select" on storage.objects;
drop policy if exists "user_authenticated_insert" on storage.objects;
drop policy if exists "user_authenticated_update" on storage.objects;
drop policy if exists "user_authenticated_delete" on storage.objects;

-- Create new workspace-member based policies

-- Select: Members of a workspace can read files in their workspace (main) and shared files they have access to
create policy "workspace_members_select_files"
  on storage.objects for select
  to authenticated
  using (
    -- User is member of workspace that owns this file (main directory)
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (bucket_path)[1]
    )
    or
    -- File is in shared directory and user's workspace has access
    (
      (bucket_path)[2] = 'shared'
      and exists (
        select 1 from public.workspace_members wm
        where wm.user_id = auth.uid()
          and exists (
            select 1 from public.workspace_file_shares wfs
            where wfs.shared_with_workspace_id = wm.workspace_id
              and wfs.workspace_id::text = (bucket_path)[1]
          )
      )
    )
  );

-- Insert: Members of a workspace can upload files to their main directory
create policy "workspace_members_insert_files"
  on storage.objects for insert
  to authenticated
  with check (
    (bucket_path)[2] = 'main'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (bucket_path)[1]
    )
  );

-- Update: Members can modify files in main, or shared files with editor permission
create policy "workspace_members_update_files"
  on storage.objects for update
  to authenticated
  using (
    -- Can update own workspace main files
    (
      (bucket_path)[2] = 'main'
      and exists (
        select 1 from public.workspace_members wm
        where wm.user_id = auth.uid()
          and wm.workspace_id::text = (bucket_path)[1]
      )
    )
    or
    -- Can update shared files with editor permission
    (
      (bucket_path)[2] = 'shared'
      and exists (
        select 1 from public.workspace_members wm
        where wm.user_id = auth.uid()
          and exists (
            select 1 from public.workspace_file_shares wfs
            where wfs.shared_with_workspace_id = wm.workspace_id
              and wfs.workspace_id::text = (bucket_path)[1]
              and wfs.permission_level = 'editor'
          )
      )
    )
  );

-- Delete: Members can delete files from main directory only, not shared files
create policy "workspace_members_delete_files"
  on storage.objects for delete
  to authenticated
  using (
    (bucket_path)[2] = 'main'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (bucket_path)[1]
    )
  );
