-- Make GitHub and GitLab visible, built-in automation trigger providers.
--
-- They are installed into each workspace by default, but uninstall remains a
-- normal workspace_integrations delete. The default hook only runs when a new
-- workspace is created, so it will not silently reinstall a provider after a
-- user removes it.

insert into public.integrations (
  slug, name, description, kind, visibility,
  is_first_party, is_verified, author_name, homepage_url, source_repo_url, tags
)
values
  (
    'github',
    'GitHub',
    'Trigger Flow automations from repository pushes, pull requests, merges, deployments, and workflow events.',
    'integration',
    'public',
    true,
    true,
    'GitHub',
    'https://github.com',
    null,
    array['Code', 'Pull Requests', 'Automation', 'Triggers', 'github']
  ),
  (
    'gitlab',
    'GitLab',
    'Trigger Flow automations from project pushes, merge requests, merges, pipelines, deployments, and releases.',
    'integration',
    'public',
    true,
    true,
    'GitLab',
    'https://gitlab.com',
    null,
    array['Code', 'Merge Requests', 'Automation', 'Triggers', 'gitlab']
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  kind = excluded.kind,
  visibility = excluded.visibility,
  is_first_party = excluded.is_first_party,
  is_verified = excluded.is_verified,
  author_name = excluded.author_name,
  homepage_url = excluded.homepage_url,
  source_repo_url = excluded.source_repo_url,
  tags = excluded.tags;

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
    'category', 'trigger_provider',
    'is_first_party', true,
    'capabilities', jsonb_build_array('automation_triggers')
  ),
  'published',
  now()
from public.integrations i
where i.slug in ('github', 'gitlab')
  and not exists (
    select 1
    from public.integration_versions v
    where v.integration_id = i.id
      and v.version = '1.0.0'
  );

update public.integrations i
set current_version_id = v.id
from public.integration_versions v
where v.integration_id = i.id
  and v.version = '1.0.0'
  and i.slug in ('github', 'gitlab');

create or replace function public.default_trigger_provider_metadata(p_provider text)
returns jsonb
language sql
volatile
as $$
  select jsonb_build_object(
    'kind', 'trigger_provider',
    'default_installed', true,
    'webhook_secret',
      case
        when p_provider = 'gitlab' then 'whsec_' || encode(gen_random_bytes(32), 'base64')
        else encode(gen_random_bytes(32), 'base64')
      end,
    'webhook_endpoint', '/api/flow-automations/' || p_provider
  );
$$;

create or replace function public.install_default_trigger_providers(
  p_workspace_id uuid,
  p_connected_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workspace_id is null or p_connected_by is null then
    return;
  end if;

  insert into public.workspace_integrations (
    workspace_id,
    provider,
    connected_by,
    scopes,
    metadata,
    integration_version_id,
    status,
    auto_update_channel
  )
  select
    p_workspace_id,
    i.slug,
    p_connected_by,
    array['automation:trigger'],
    public.default_trigger_provider_metadata(i.slug),
    i.current_version_id,
    'active',
    'pinned'
  from public.integrations i
  where i.slug in ('github', 'gitlab')
  on conflict (workspace_id, provider) do nothing;
end;
$$;

-- Existing workspaces get the default provider connections once.
insert into public.workspace_integrations (
  workspace_id,
  provider,
  connected_by,
  scopes,
  metadata,
  integration_version_id,
  status,
  auto_update_channel
)
select
  w.id,
  i.slug,
  coalesce(
    w.created_by,
    (
      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = w.id
      order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, wm.joined_at asc
      limit 1
    )
  ),
  array['automation:trigger'],
  public.default_trigger_provider_metadata(i.slug),
  i.current_version_id,
  'active',
  'pinned'
from public.workspaces w
cross join public.integrations i
where i.slug in ('github', 'gitlab')
  and coalesce(
    w.created_by,
    (
      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = w.id
      order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, wm.joined_at asc
      limit 1
    )
  ) is not null
on conflict (workspace_id, provider) do nothing;

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.wallets (workspace_id) values (NEW.id);
  insert into public.workspace_members (workspace_id, user_id, role)
    values (NEW.id, NEW.created_by, 'owner');
  perform public.install_default_trigger_providers(NEW.id, NEW.created_by);
  return NEW;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();
