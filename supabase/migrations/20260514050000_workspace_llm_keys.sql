-- BYOK (Bring Your Own Key) — per-workspace LLM provider API keys.
--
-- Pro/Max/Enterprise users can supply their own API key for a given provider
-- (anthropic, openai, gemini). When set, polymux routes every Chat() for
-- workflows in that workspace through the user's key instead of the server's
-- shared key. This eliminates LLM cost exposure for those workspaces — the
-- single highest-ROI margin lever for the business.
--
-- Storage: AES-256-GCM-encrypted via the existing tokenCrypto helper
-- (web/server/utils/security/tokenCrypto.ts), matching the workspace_integrations
-- pattern. The DB never sees plaintext; the only consumers of plaintext are:
--   - the Nuxt REST endpoints (write path, validates the key with a test call)
--   - the polymux Go server via an internal-secret endpoint that returns
--     decrypted material to the BYOKResolver
--
-- One row per (workspace, provider). Updating an existing key is a PATCH on
-- the same row so we keep created_at stable; the UI surfaces last_four +
-- created_at + last_used_at without ever returning the ciphertext.

create table if not exists public.workspace_llm_keys (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  provider        text        not null check (provider in ('anthropic', 'openai', 'gemini')),
  -- AES-256-GCM ciphertext in the format produced by encryptToken().
  api_key_enc     text        not null,
  -- last four characters of the plaintext key — safe to return to the UI so
  -- users can identify "which key is this?" without ever seeing the secret.
  last_four       text        not null,
  created_by      uuid        not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  unique (workspace_id, provider)
);

create index if not exists idx_workspace_llm_keys_workspace
  on public.workspace_llm_keys (workspace_id);

alter table public.workspace_llm_keys enable row level security;

-- Owners and admins can list rows (metadata only — the SELECT projection
-- in the REST handler skips api_key_enc). Plain SELECT on this table from
-- a user JWT returns ciphertext that the client cannot decrypt — defensive
-- but harmless.
create policy "workspace_admins_read_llm_keys"
  on public.workspace_llm_keys for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_llm_keys.workspace_id
        and wm.user_id      = auth.uid()
        and wm.role         in ('owner', 'admin')
    )
  );

-- Writes go exclusively through the Nuxt REST endpoints (which encrypt the
-- plaintext server-side). We grant INSERT/UPDATE/DELETE to authenticated
-- admins so a service-role bypass isn't required for the user-facing flow.
create policy "workspace_admins_insert_llm_keys"
  on public.workspace_llm_keys for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_llm_keys.workspace_id
        and wm.user_id      = auth.uid()
        and wm.role         in ('owner', 'admin')
    )
  );

create policy "workspace_admins_update_llm_keys"
  on public.workspace_llm_keys for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_llm_keys.workspace_id
        and wm.user_id      = auth.uid()
        and wm.role         in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_llm_keys.workspace_id
        and wm.user_id      = auth.uid()
        and wm.role         in ('owner', 'admin')
    )
  );

create policy "workspace_admins_delete_llm_keys"
  on public.workspace_llm_keys for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_llm_keys.workspace_id
        and wm.user_id      = auth.uid()
        and wm.role         in ('owner', 'admin')
    )
  );

-- Auto-touch updated_at on row updates so the UI can render "Updated 2m ago".
create or replace function public.set_workspace_llm_keys_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_llm_keys_set_updated_at on public.workspace_llm_keys;
create trigger workspace_llm_keys_set_updated_at
  before update on public.workspace_llm_keys
  for each row execute function public.set_workspace_llm_keys_updated_at();
