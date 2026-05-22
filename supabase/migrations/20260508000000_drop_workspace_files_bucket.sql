-- Removes the legacy 'supabase' file backend.
--
-- Cloud storage is no longer offered as a save target — workspaces now save
-- to Google Drive or local OPFS. Drive downloads stream through the Nuxt
-- proxy (`/api/workspaces/[id]/files/drive-stream`) instead of being staged
-- through the workspace-files bucket, and artifact promotion uploads bytes
-- straight to Drive.
--
-- The `workspace-files` bucket and its objects must be removed via the
-- Supabase Dashboard or the Storage API — Supabase Cloud blocks direct
-- DELETE on `storage.objects` / `storage.buckets` from SQL migrations
-- ("Direct deletion from storage tables is not allowed"). After this
-- migration applies, go to Storage → workspace-files in the dashboard,
-- empty it, then delete the bucket.

-- 1. Drop the four RLS policies on storage.objects that scoped the
--    workspace-files bucket. Once these are gone, no client can read or
--    write the bucket, so it's effectively dead even before the manual
--    bucket-drop step.
drop policy if exists "workspace_members_select_files" on storage.objects;
drop policy if exists "workspace_members_insert_files" on storage.objects;
drop policy if exists "workspace_members_update_files" on storage.objects;
drop policy if exists "workspace_members_delete_files" on storage.objects;

-- 2. Drop any files rows that were backed by the now-gone bucket. The user
--    confirmed losing these is acceptable; without this delete, the row
--    constraint update below would fail.
delete from public.files where backend = 'supabase';

-- 3. Tighten the backend check constraint so 'supabase' can never be
--    written again.
alter table public.files drop constraint if exists files_backend_check;
alter table public.files
  add constraint files_backend_check
  check (backend in ('google-drive', 'local'));
