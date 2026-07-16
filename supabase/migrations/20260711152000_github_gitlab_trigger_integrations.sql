-- Reintroduce GitHub and GitLab as trigger-provider connections.
--
-- These are not OAuth repo browsers yet. They are first-party automation
-- trigger providers: installing one creates a workspace connection with a
-- webhook endpoint + secret that provider webhooks can use to queue Flow runs.

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
    'https://docs.github.com/en/webhooks',
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
    'https://docs.gitlab.com/user/project/integrations/webhooks/',
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
  and i.slug in ('github', 'gitlab')
  and i.current_version_id is null;
