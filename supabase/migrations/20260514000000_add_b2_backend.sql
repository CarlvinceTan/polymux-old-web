-- Adds 'b2' to the files.backend check constraint so the Cloud (Backblaze-
-- backed) storage path can write metadata rows.
--
-- Companion to:
--   * the B2 driver in polymux/internal/filesystem/b2_backend.go
--   * /api/workspaces/[id]/files/upload-url.post.ts (mints B2 upload URLs
--     when preferred_backend='b2', gated by plan-tier cloudCap)
--   * /api/workspaces/[id]/files/finalize-upload.post.ts (upserts files row
--     with backend='b2', backend_ref=fileId, etag=sha1)
--
-- Supersedes the constraint set in 20260508000000_drop_workspace_files_bucket.sql,
-- whose header comment described Cloud storage as "no longer offered" — that
-- statement applied only to the legacy Supabase-bucket-backed Cloud option.
-- The current Cloud backend is Backblaze B2, introduced after that migration.
--
-- Drop-create rather than ALTER ... ADD because Postgres has no
-- "add constraint if not exists" for CHECK constraints.

alter table public.files drop constraint if exists files_backend_check;
alter table public.files
  add constraint files_backend_check
  check (backend in ('google-drive', 'local', 'b2'));
