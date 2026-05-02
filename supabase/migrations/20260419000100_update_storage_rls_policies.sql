-- Fix SECURITY DEFINER on helper functions to break infinite RLS recursion.
-- workspace_members SELECT policy calls is_workspace_member(), which queries
-- workspace_members, triggering the policy again. SECURITY DEFINER bypasses RLS
-- when executing these functions, breaking the cycle.
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;
create or replace function public.get_workspace_role(ws_id uuid)
returns workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;
-- Replace old user-based storage policies with workspace-based ones.
-- Previous version used a non-existent `bucket_path` column; correct version
-- uses storage.foldername(name) which splits the object path into segments.

drop policy if exists "Users can delete their own workspace files" on storage.objects;
drop policy if exists "Users can read their own workspace files" on storage.objects;
drop policy if exists "Users can update their own workspace files" on storage.objects;
drop policy if exists "Users can upload their own workspace files" on storage.objects;
drop policy if exists "workspace_members_select_files" on storage.objects;
drop policy if exists "workspace_members_insert_files" on storage.objects;
drop policy if exists "workspace_members_update_files" on storage.objects;
drop policy if exists "workspace_members_delete_files" on storage.objects;
create policy "workspace_members_select_files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (
      exists (
        select 1 from public.workspace_members wm
        where wm.user_id = auth.uid()
          and wm.workspace_id::text = (storage.foldername(name))[1]
      )
      or (
        (storage.foldername(name))[2] = 'shared'
        and exists (
          select 1 from public.workspace_members wm
          where wm.user_id = auth.uid()
            and exists (
              select 1 from public.file_shares wfs
              where wfs.shared_with_workspace_id = wm.workspace_id
                and wfs.workspace_id::text = (storage.foldername(name))[1]
            )
        )
      )
    )
  );
create policy "workspace_members_insert_files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[2] = 'main'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
create policy "workspace_members_update_files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (
      (
        (storage.foldername(name))[2] = 'main'
        and exists (
          select 1 from public.workspace_members wm
          where wm.user_id = auth.uid()
            and wm.workspace_id::text = (storage.foldername(name))[1]
        )
      )
      or (
        (storage.foldername(name))[2] = 'shared'
        and exists (
          select 1 from public.workspace_members wm
          where wm.user_id = auth.uid()
            and exists (
              select 1 from public.file_shares wfs
              where wfs.shared_with_workspace_id = wm.workspace_id
                and wfs.workspace_id::text = (storage.foldername(name))[1]
                and wfs.permission_level = 'editor'
            )
        )
      )
    )
  );
create policy "workspace_members_delete_files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workspace-files'
    and (storage.foldername(name))[2] = 'main'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
