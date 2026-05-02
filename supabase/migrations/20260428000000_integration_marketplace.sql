-- Integration marketplace catalog.
--
-- Replaces the hardcoded `INTEGRATION_REGISTRY` map (`server/utils/
-- integrationRegistry.ts`) with a DB-backed catalog of installable items.
-- Three kinds live in the same table, distinguished by `kind`:
--   - 'integration'  : code-based. First-party rows execute in-tree
--                      (`server/connectors/*`); third-party rows resolve to
--                      a manifest in `integration_versions` describing an
--                      HTTPS webhook surface.
--   - 'workflow'     : a published snapshot of a `workflow_versions` row.
--   - 'plugin'       : a bundle that installs other integrations + workflows
--                      together.
--
-- The 7 existing OAuth providers (google-drive, gmail, github, slack, notion,
-- linear) are seeded as `is_first_party=true` rows so they show up in the
-- Marketplace UI alongside third-party items, badged "Built by Polymux."
--
-- This migration also extends `workspace_integrations` with the columns
-- needed to track installed catalog rows (integration_version_id,
-- workflow_version_id, status, etc.) and backfills existing rows so they
-- point at the seeded first-party version. The OAuth token columns
-- (access_token_enc, refresh_token_enc, etc.) keep their existing role for
-- first-party connectors; for third-party integrations they stay null
-- (intent-only token policy — see /Users/developer/.claude/plans/
-- i-want-a-way-vivid-acorn.md).

------------------------------------------------------------------------------
-- 1. integrations: the catalog
------------------------------------------------------------------------------

create table if not exists public.integrations (
  id                  uuid        primary key default gen_random_uuid(),
  slug                text        not null unique,
  name                text        not null,
  description         text,
  kind                text        not null
                       check (kind in ('integration', 'workflow', 'plugin')),
  visibility          text        not null default 'private'
                       check (visibility in ('private', 'unlisted', 'public')),
  author_user_id      uuid        references auth.users(id),  -- null for first-party
  author_name         text        not null,                   -- display name shown in UI ("Google", "Polymux", or username)
  homepage_url        text,
  source_repo_url     text,
  is_first_party      boolean     not null default false,
  is_verified         boolean     not null default false,
  install_count       bigint      not null default 0,
  current_version_id  uuid,                                   -- FK back-filled below
  tags                text[]      not null default '{}',
  icon_url            text,                                   -- null for first-party (frontend has its own icon registry)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_integrations_visibility
  on public.integrations(visibility) where visibility in ('public', 'unlisted');
create index if not exists idx_integrations_kind
  on public.integrations(kind);
create index if not exists idx_integrations_author
  on public.integrations(author_user_id) where author_user_id is not null;
create or replace function public.touch_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_integrations_touch_updated_at on public.integrations;
create trigger trg_integrations_touch_updated_at
  before update on public.integrations
  for each row execute function public.touch_integrations_updated_at();
------------------------------------------------------------------------------
-- 2. integration_versions: append-only manifest snapshots for kind='integration'
------------------------------------------------------------------------------

create table if not exists public.integration_versions (
  id                          uuid        primary key default gen_random_uuid(),
  integration_id              uuid        not null references public.integrations(id) on delete cascade,
  version                     text        not null,
  manifest                    jsonb       not null,
  manifest_sha256             text,
  manifest_url                text,
  release_notes               text,
  webhook_signing_secret_enc  text,                                 -- AES-256-GCM via tokenCrypto.ts
  status                      text        not null default 'draft'
                               check (status in ('draft', 'published', 'yanked')),
  published_at                timestamptz,
  yanked_at                   timestamptz,
  yank_reason                 text,
  created_at                  timestamptz not null default now(),
  unique (integration_id, version)
);
create index if not exists idx_integration_versions_integration
  on public.integration_versions(integration_id);
create index if not exists idx_integration_versions_published
  on public.integration_versions(integration_id, published_at desc) where status = 'published';
-- Now wire up the back-pointer FK. Cannot do it inline above because
-- integrations and integration_versions reference each other; the FK is added
-- here once both tables exist.
alter table public.integrations
  add constraint integrations_current_version_fk
  foreign key (current_version_id) references public.integration_versions(id)
  on delete set null;
------------------------------------------------------------------------------
-- 3. integration_workflow_refs: kind='workflow' rows point at workflow_versions
------------------------------------------------------------------------------

create table if not exists public.integration_workflow_refs (
  integration_id        uuid        primary key references public.integrations(id) on delete cascade,
  workflow_id           uuid        not null references public.workflows(id) on delete cascade,
  workflow_version_id   uuid        not null references public.workflow_versions(id) on delete restrict,
  created_at            timestamptz not null default now()
);
create index if not exists idx_integration_workflow_refs_workflow
  on public.integration_workflow_refs(workflow_id);
------------------------------------------------------------------------------
-- 4. integration_plugin_items: kind='plugin' rows bundle other catalog rows
------------------------------------------------------------------------------

create table if not exists public.integration_plugin_items (
  plugin_integration_id   uuid        not null references public.integrations(id) on delete cascade,
  child_integration_id    uuid        not null references public.integrations(id) on delete restrict,
  child_min_version_id    uuid        references public.integration_versions(id) on delete set null,
  sort_order              integer     not null default 0,
  created_at              timestamptz not null default now(),
  primary key (plugin_integration_id, child_integration_id),
  -- A plugin can't bundle itself.
  check (plugin_integration_id <> child_integration_id)
);
create index if not exists idx_integration_plugin_items_child
  on public.integration_plugin_items(child_integration_id);
------------------------------------------------------------------------------
-- 5. workspace_integrations extensions
------------------------------------------------------------------------------

alter table public.workspace_integrations
  add column if not exists integration_version_id  uuid        references public.integration_versions(id) on delete set null,
  add column if not exists workflow_version_id     uuid        references public.workflow_versions(id) on delete set null,
  add column if not exists auto_update_channel     text        not null default 'pinned'
                            check (auto_update_channel in ('pinned', 'minor', 'major')),
  add column if not exists status                  text        not null default 'active'
                            check (status in ('active', 'needs_regrant', 'disabled')),
  add column if not exists config                  jsonb       not null default '{}'::jsonb,
  add column if not exists installed_via_plugin_id uuid        references public.integrations(id) on delete set null;
create index if not exists idx_workspace_integrations_integration_version
  on public.workspace_integrations(integration_version_id) where integration_version_id is not null;
create index if not exists idx_workspace_integrations_via_plugin
  on public.workspace_integrations(installed_via_plugin_id) where installed_via_plugin_id is not null;
------------------------------------------------------------------------------
-- 6. workspace_integration_grants: explicit scope grants per install
------------------------------------------------------------------------------

create table if not exists public.workspace_integration_grants (
  workspace_integration_id  uuid        not null references public.workspace_integrations(id) on delete cascade,
  scope                     text        not null,
  granted_at                timestamptz not null default now(),
  granted_by                uuid        not null references auth.users(id),
  primary key (workspace_integration_id, scope)
);
------------------------------------------------------------------------------
-- 7. workspace_integration_tokens: tokens the integration itself sees
------------------------------------------------------------------------------

create table if not exists public.workspace_integration_tokens (
  id                        uuid        primary key default gen_random_uuid(),
  workspace_integration_id  uuid        not null references public.workspace_integrations(id) on delete cascade,
  token_kind                text        not null
                             check (token_kind in ('inbound_api_token', 'user_link_token')),
  token_hash                text        not null,                  -- SHA-256, never plaintext
  expires_at                timestamptz,
  revoked_at                timestamptz,
  created_at                timestamptz not null default now()
);
create index if not exists idx_workspace_integration_tokens_active
  on public.workspace_integration_tokens(token_hash) where revoked_at is null;
create index if not exists idx_workspace_integration_tokens_install
  on public.workspace_integration_tokens(workspace_integration_id);
------------------------------------------------------------------------------
-- 8. integration_install_events: audit log
------------------------------------------------------------------------------

create table if not exists public.integration_install_events (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  integration_id  uuid        not null references public.integrations(id) on delete cascade,
  event_type      text        not null
                   check (event_type in ('install', 'uninstall', 'upgrade', 'grant_change', 'disabled')),
  from_version_id uuid        references public.integration_versions(id) on delete set null,
  to_version_id   uuid        references public.integration_versions(id) on delete set null,
  actor_user_id   uuid        not null references auth.users(id),
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_integration_install_events_workspace
  on public.integration_install_events(workspace_id, created_at desc);
create index if not exists idx_integration_install_events_integration
  on public.integration_install_events(integration_id, created_at desc);
------------------------------------------------------------------------------
-- 9. Row-level security
------------------------------------------------------------------------------

alter table public.integrations                  enable row level security;
alter table public.integration_versions          enable row level security;
alter table public.integration_workflow_refs     enable row level security;
alter table public.integration_plugin_items      enable row level security;
alter table public.workspace_integration_grants  enable row level security;
alter table public.workspace_integration_tokens  enable row level security;
alter table public.integration_install_events    enable row level security;
-- integrations: public visibility readable to everyone authenticated;
-- author can always read their own; workspace members can read the items
-- their workspace has installed (covers private/unlisted via install).
create policy "integrations_public_read"
  on public.integrations for select
  to authenticated
  using (
    visibility = 'public'
    or visibility = 'unlisted'
    or author_user_id = auth.uid()
    or exists (
      select 1 from public.workspace_integrations wi
        join public.workspace_members wm on wm.workspace_id = wi.workspace_id
       where wi.provider = integrations.slug
         and wm.user_id = auth.uid()
    )
  );
-- Authors insert/update their own non-first-party rows. First-party rows are
-- inserted by service role only (the seed below runs as the migration owner).
create policy "integrations_author_write"
  on public.integrations for insert
  to authenticated
  with check (
    is_first_party = false
    and author_user_id = auth.uid()
  );
create policy "integrations_author_update"
  on public.integrations for update
  to authenticated
  using (author_user_id = auth.uid() and is_first_party = false)
  with check (author_user_id = auth.uid() and is_first_party = false);
-- integration_versions: readable when the parent integration is readable.
create policy "integration_versions_read"
  on public.integration_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_versions.integration_id
         and (
           i.visibility in ('public', 'unlisted')
           or i.author_user_id = auth.uid()
           or exists (
             select 1 from public.workspace_integrations wi
               join public.workspace_members wm on wm.workspace_id = wi.workspace_id
              where wi.provider = i.slug and wm.user_id = auth.uid()
           )
         )
    )
  );
create policy "integration_versions_author_write"
  on public.integration_versions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.integrations i
       where i.id = integration_versions.integration_id
         and i.author_user_id = auth.uid()
         and i.is_first_party = false
    )
  );
create policy "integration_versions_author_update"
  on public.integration_versions for update
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_versions.integration_id
         and i.author_user_id = auth.uid()
         and i.is_first_party = false
    )
  );
-- integration_workflow_refs: same readability rules as parent integration.
create policy "integration_workflow_refs_read"
  on public.integration_workflow_refs for select
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_workflow_refs.integration_id
         and (
           i.visibility in ('public', 'unlisted')
           or i.author_user_id = auth.uid()
         )
    )
  );
create policy "integration_workflow_refs_author_write"
  on public.integration_workflow_refs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.integrations i
       where i.id = integration_workflow_refs.integration_id
         and i.author_user_id = auth.uid()
    )
  );
-- integration_plugin_items: same readability rules as parent integration.
create policy "integration_plugin_items_read"
  on public.integration_plugin_items for select
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_plugin_items.plugin_integration_id
         and (
           i.visibility in ('public', 'unlisted')
           or i.author_user_id = auth.uid()
         )
    )
  );
create policy "integration_plugin_items_author_write"
  on public.integration_plugin_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.integrations i
       where i.id = integration_plugin_items.plugin_integration_id
         and i.author_user_id = auth.uid()
    )
  );
-- workspace_integration_grants: workspace members read; admins write.
create policy "workspace_integration_grants_member_read"
  on public.workspace_integration_grants for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_integrations wi
        join public.workspace_members wm on wm.workspace_id = wi.workspace_id
       where wi.id = workspace_integration_grants.workspace_integration_id
         and wm.user_id = auth.uid()
    )
  );
create policy "workspace_integration_grants_admin_write"
  on public.workspace_integration_grants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_integrations wi
        join public.workspace_members wm on wm.workspace_id = wi.workspace_id
       where wi.id = workspace_integration_grants.workspace_integration_id
         and wm.user_id = auth.uid()
         and wm.role in ('owner', 'admin')
    )
  );
create policy "workspace_integration_grants_admin_delete"
  on public.workspace_integration_grants for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_integrations wi
        join public.workspace_members wm on wm.workspace_id = wi.workspace_id
       where wi.id = workspace_integration_grants.workspace_integration_id
         and wm.user_id = auth.uid()
         and wm.role in ('owner', 'admin')
    )
  );
-- workspace_integration_tokens: workspace members read (token_hash only —
-- plaintext never lives in the DB). Inserts are service-role only.
create policy "workspace_integration_tokens_member_read"
  on public.workspace_integration_tokens for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_integrations wi
        join public.workspace_members wm on wm.workspace_id = wi.workspace_id
       where wi.id = workspace_integration_tokens.workspace_integration_id
         and wm.user_id = auth.uid()
    )
  );
-- integration_install_events: workspace members read their workspace's audit
-- log. Inserts are service-role only.
create policy "integration_install_events_member_read"
  on public.integration_install_events for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
       where wm.workspace_id = integration_install_events.workspace_id
         and wm.user_id = auth.uid()
    )
  );
------------------------------------------------------------------------------
-- 10. Seed first-party catalog rows
------------------------------------------------------------------------------

-- Insert the 6 in-tree OAuth connectors as catalog rows. Slugs match the
-- existing `workspace_integrations.provider` values so backfill below can
-- join cleanly. is_first_party=true tells the marketplace UI to badge them
-- "Built by Polymux" and the install path to redirect through the OAuth
-- flow rather than the third-party install endpoint.

insert into public.integrations (slug, name, description, kind, visibility, is_first_party, is_verified, author_name, homepage_url, tags)
values
  ('google-drive', 'Google Drive', 'Access and manage files in your Google Drive directly from Polymux.', 'integration', 'public', true, true, 'Google',  'https://drive.google.com',  array['Files', 'Storage', 'Cloud']),
  ('gmail',         'Gmail',         'Search, read, and send emails from your Gmail account.',                  'integration', 'public', true, true, 'Google',  'https://mail.google.com',   array['Email', 'Inbox']),
  ('github',        'GitHub',        'Browse repositories, create issues, and review pull requests.',            'integration', 'public', true, true, 'GitHub',  'https://github.com',        array['Code', 'Pull Requests']),
  ('slack',         'Slack',         'Send messages and read channel history from your Slack workspace.',        'integration', 'public', true, true, 'Slack',   'https://slack.com',         array['Chat', 'Messaging']),
  ('notion',        'Notion',        'Read and write Notion pages, databases, and blocks.',                      'integration', 'public', true, true, 'Notion',  'https://notion.so',         array['Notes', 'Wiki']),
  ('linear',        'Linear',        'Manage issues, projects, and sprints in Linear.',                          'integration', 'public', true, true, 'Linear',  'https://linear.app',        array['Issues', 'Project Management'])
on conflict (slug) do nothing;
-- Seed an initial published version per first-party integration. The manifest
-- is intentionally minimal — first-party connectors execute in-tree, so they
-- don't need a webhook URL or signing secret. The manifest is here so the
-- catalog endpoint can return a uniform shape regardless of kind.

insert into public.integration_versions (integration_id, version, manifest, status, published_at)
select
  i.id,
  '1.0.0',
  jsonb_build_object(
    'manifest_version', '1',
    'identity', jsonb_build_object(
      'slug', i.slug,
      'name', i.name,
      'version', '1.0.0',
      'description', i.description
    ),
    'category', 'connector',
    'is_first_party', true
  ),
  'published',
  now()
from public.integrations i
where i.is_first_party = true
  and not exists (
    select 1 from public.integration_versions v
     where v.integration_id = i.id and v.version = '1.0.0'
  );
-- Point each first-party integration at its 1.0.0 version.
update public.integrations i
   set current_version_id = v.id
  from public.integration_versions v
 where v.integration_id = i.id
   and v.version = '1.0.0'
   and i.is_first_party = true
   and i.current_version_id is null;
------------------------------------------------------------------------------
-- 11. Backfill existing workspace_integrations rows
------------------------------------------------------------------------------

-- Any pre-existing connection (Drive, etc.) gets pointed at the seeded
-- first-party version. Future connects/upgrades will set this to the version
-- that was current at install time.

update public.workspace_integrations wi
   set integration_version_id = i.current_version_id
  from public.integrations i
 where i.slug = wi.provider
   and i.is_first_party = true
   and wi.integration_version_id is null;
