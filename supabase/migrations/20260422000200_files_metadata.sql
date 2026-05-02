-- Canonical per-workspace file metadata index.
--
-- One row per file or folder across all backends (supabase, google-drive,
-- local). Agents and browser both read from this table; actual bytes live
-- in the `backend`-specific store, located via `backend_ref` (Supabase object
-- name, Drive file id, or local path).
--
-- Writes only happen from the Nuxt server routes (via service role) or from
-- the Go backend via internal service-token endpoints — client RLS blocks
-- direct writes.

create table if not exists public.files (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  path           text        not null,
  kind           text        not null check (kind in ('file', 'folder')),
  backend        text        not null check (backend in ('supabase', 'google-drive', 'local')),
  backend_ref    text,
  size_bytes     bigint,
  content_type   text,
  etag           text,
  backend_mtime  timestamptz,
  created_by     uuid                 references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, path)
);
create index if not exists idx_files_workspace_path
  on public.files(workspace_id, path);
create index if not exists idx_files_workspace_backend
  on public.files(workspace_id, backend);
alter table public.files enable row level security;
create or replace function public.touch_files_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_files_touch_updated_at on public.files;
create trigger trg_files_touch_updated_at
  before update on public.files
  for each row execute function public.touch_files_updated_at();
-- Any workspace member can read rows; per-path visibility is enforced in the
-- Nuxt server route layer using effective_file_permission, not in RLS
-- (inline recursion through workspace_file_permissions would be expensive
-- and hard to debug).
create policy "workspace_members_read_files"
  on public.files for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = files.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- No direct client writes. Writes go through Nuxt server routes with the
-- service role, or the Go backend via internal service-token endpoints.
create policy "no_client_writes_files_insert"
  on public.files for insert
  to authenticated
  with check (false);
create policy "no_client_writes_files_update"
  on public.files for update
  to authenticated
  using (false)
  with check (false);
create policy "no_client_writes_files_delete"
  on public.files for delete
  to authenticated
  using (false);
