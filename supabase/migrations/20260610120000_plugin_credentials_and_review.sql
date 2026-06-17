-- Plugin credential provisioning + marketplace review gate.
--
-- Two credential tiers, resolved override → default (mirrors the BYOK pattern in
-- workspace_llm_keys):
--   - integration_credentials:           Polymux-team-provisioned secrets for an
--                                         integration (e.g. an OAuth client_id/secret).
--                                         Encrypted at rest; readable ONLY by the service
--                                         role (console review tooling + the internal
--                                         resolver endpoint). No user-facing RLS at all.
--   - workspace_integration_credentials: a workspace's own override for a given
--                                         integration credential. Admin-managed, encrypted;
--                                         the REST layer projects metadata/hints only.
--
-- Plus integrations.review_status — the gate for public listing / first-party.
-- Self-published private/unlisted listings stay 'unsubmitted'; requesting public
-- or a first-party badge moves to 'pending_review' for the team to clear in console.
--
-- Secret fields are stored per-field as AES-256-GCM ciphertext (tokenCrypto.ts,
-- v1:iv:tag:ct) inside a jsonb map, so one credential can hold {client_id, client_secret}.
-- Re-run `supabase gen types` after this migration; until then server code casts
-- the new tables (the marketplace tables already do the same).

------------------------------------------------------------------------------
-- 1. Review gate on the catalog
------------------------------------------------------------------------------

alter table public.integrations
  add column if not exists review_status text not null default 'unsubmitted'
    check (review_status in ('unsubmitted', 'pending_review', 'approved', 'rejected', 'changes_requested')),
  add column if not exists review_notes  text,
  add column if not exists reviewed_by   uuid references auth.users(id),
  add column if not exists reviewed_at    timestamptz;

-- Existing first-party rows are already trusted + public — mark them approved.
update public.integrations
   set review_status = 'approved'
 where is_first_party = true
   and review_status = 'unsubmitted';

create index if not exists idx_integrations_pending_review
  on public.integrations(review_status) where review_status = 'pending_review';

------------------------------------------------------------------------------
-- 2. integration_credentials — Polymux-team-provisioned (managed) secrets
------------------------------------------------------------------------------

create table if not exists public.integration_credentials (
  id              uuid        primary key default gen_random_uuid(),
  integration_id  uuid        not null references public.integrations(id) on delete cascade,
  credential_key  text        not null,                       -- matches manifest.credentials[].key
  credential_type text        not null,                       -- oauth_client | api_key | basic | custom
  provider        text,                                       -- informational (google, microsoft)
  fields_enc      jsonb       not null default '{}'::jsonb,    -- { "client_id": "v1:…", "client_secret": "v1:…" }
  scopes          text[]      not null default '{}',
  hint            jsonb       not null default '{}'::jsonb,    -- non-secret display hints (e.g. client_id last4)
  provisioned_by  uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (integration_id, credential_key)
);
create index if not exists idx_integration_credentials_integration
  on public.integration_credentials(integration_id);

-- RLS enabled with NO permissive policies: these are Polymux-owned secrets, so
-- only the service role (console review tooling + the internal resolver
-- endpoint, both of which bypass RLS) may read or write them. A user JWT can
-- never touch this table.
alter table public.integration_credentials enable row level security;

create or replace function public.touch_integration_credentials_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_integration_credentials_touch on public.integration_credentials;
create trigger trg_integration_credentials_touch
  before update on public.integration_credentials
  for each row execute function public.touch_integration_credentials_updated_at();

------------------------------------------------------------------------------
-- 3. workspace_integration_credentials — per-workspace BYO override
------------------------------------------------------------------------------

create table if not exists public.workspace_integration_credentials (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  integration_id  uuid        not null references public.integrations(id) on delete cascade,
  credential_key  text        not null,
  credential_type text        not null,
  fields_enc      jsonb       not null default '{}'::jsonb,
  hint            jsonb       not null default '{}'::jsonb,    -- last_four etc, safe for the UI
  created_by      uuid        not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  unique (workspace_id, integration_id, credential_key)
);
create index if not exists idx_workspace_integration_credentials_workspace
  on public.workspace_integration_credentials(workspace_id);

alter table public.workspace_integration_credentials enable row level security;

-- Idempotency: policies have no `create ... if not exists`, so drop first to
-- keep this migration safely re-runnable.
drop policy if exists "wic_admins_read"   on public.workspace_integration_credentials;
drop policy if exists "wic_admins_insert" on public.workspace_integration_credentials;
drop policy if exists "wic_admins_update" on public.workspace_integration_credentials;
drop policy if exists "wic_admins_delete" on public.workspace_integration_credentials;

-- Owners/admins read (the REST projection returns hint/metadata only, never
-- fields_enc) and write. Mirrors the workspace_llm_keys policies.
create policy "wic_admins_read"
  on public.workspace_integration_credentials for select
  to authenticated
  using (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = workspace_integration_credentials.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin')));
create policy "wic_admins_insert"
  on public.workspace_integration_credentials for insert
  to authenticated
  with check (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = workspace_integration_credentials.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin')));
create policy "wic_admins_update"
  on public.workspace_integration_credentials for update
  to authenticated
  using (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = workspace_integration_credentials.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin')))
  with check (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = workspace_integration_credentials.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin')));
create policy "wic_admins_delete"
  on public.workspace_integration_credentials for delete
  to authenticated
  using (
    exists (select 1 from public.workspace_members wm
            where wm.workspace_id = workspace_integration_credentials.workspace_id
              and wm.user_id = auth.uid()
              and wm.role in ('owner', 'admin')));

create or replace function public.touch_workspace_integration_credentials_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_wic_touch on public.workspace_integration_credentials;
create trigger trg_wic_touch
  before update on public.workspace_integration_credentials
  for each row execute function public.touch_workspace_integration_credentials_updated_at();
