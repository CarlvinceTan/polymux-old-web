-- Per-workspace integration connections (Google Drive, Gmail, GitHub, Slack,
-- Notion, Linear, plus Polymux-native plugins/workflows). One row per
-- (workspace_id, provider). Admin-gated writes; member-visible reads (for
-- knowing the integration exists and who connected it).
--
-- OAuth tokens are stored encrypted via AES-256-GCM in the Nuxt server
-- (server/utils/tokenCrypto.ts); this table only holds the ciphertext, never
-- plaintext. Clients must never read access_token_enc / refresh_token_enc —
-- the RLS policy allows select on all columns for convenience, but Nuxt
-- routes project only the safe columns when returning to clients.

create table if not exists public.workspace_integrations (
  id                   uuid        primary key default gen_random_uuid(),
  workspace_id         uuid        not null references public.workspaces(id) on delete cascade,
  provider             text        not null,
  connected_by         uuid        not null references auth.users(id),
  account_email        text,
  account_display_name text,
  scopes               text[]      not null default '{}',
  access_token_enc     text,
  refresh_token_enc    text,
  expires_at           timestamptz,
  root_folder_id       text,
  root_folder_name     text,
  metadata             jsonb       not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists idx_workspace_integrations_workspace
  on public.workspace_integrations(workspace_id);

create index if not exists idx_workspace_integrations_provider
  on public.workspace_integrations(provider);

alter table public.workspace_integrations enable row level security;

-- Keep updated_at current on any update.
create or replace function public.touch_workspace_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_integrations_touch_updated_at on public.workspace_integrations;
create trigger trg_workspace_integrations_touch_updated_at
  before update on public.workspace_integrations
  for each row execute function public.touch_workspace_integrations_updated_at();

-- Members see integrations connected to their workspace. Clients must avoid
-- projecting the *_enc columns (enforced in Nuxt server routes, which always
-- go through a explicit column select).
create policy "workspace_members_read_integrations"
  on public.workspace_integrations for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_integrations.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Only owners and admins can connect or disconnect integrations.
create policy "workspace_admins_insert_integrations"
  on public.workspace_integrations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_integrations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_update_integrations"
  on public.workspace_integrations for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_integrations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_integrations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_delete_integrations"
  on public.workspace_integrations for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_integrations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );
