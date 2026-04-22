-- Per-session ephemeral artifacts produced by agents.
--
-- Artifacts are NOT part of the canonical workspace storage — they live here
-- only for the life of the session (plus a 24-hour grace window for UX), then
-- are cleaned up. Users can explicitly promote an artifact into workspace
-- storage via the artifacts API (§7.4); that operation writes a new row into
-- the files table and leaves this row untouched.
--
-- Writes only from the Nuxt server (service role) or the Go backend via
-- internal service-token endpoints.

create table if not exists public.artifacts (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null references public.sessions(id) on delete cascade,
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  name                text        not null,
  mime_type           text,
  size_bytes          bigint      not null default 0,
  storage_path        text,
  content             text,
  created_by_agent_id text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_artifacts_session
  on public.artifacts(session_id, created_at desc);

create index if not exists idx_artifacts_workspace
  on public.artifacts(workspace_id);

alter table public.artifacts enable row level security;

-- Any workspace member can read artifacts for sessions in their workspace.
create policy "workspace_members_read_artifacts"
  on public.artifacts for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = artifacts.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- No direct client writes.
create policy "no_client_writes_artifacts_insert"
  on public.artifacts for insert
  to authenticated
  with check (false);

create policy "no_client_writes_artifacts_update"
  on public.artifacts for update
  to authenticated
  using (false)
  with check (false);

create policy "no_client_writes_artifacts_delete"
  on public.artifacts for delete
  to authenticated
  using (false);
