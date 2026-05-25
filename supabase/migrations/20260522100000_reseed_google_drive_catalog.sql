-- Re-seed the google-drive marketplace catalog row when missing.
--
-- Production was bootstrapped with schema migrations applied but the INSERT
-- seeds from 20260428000000_integration_marketplace.sql never landed, leaving
-- integrations empty and Google Drive invisible in the marketplace UI.
-- Idempotent: safe to run on dev (already seeded) and prod (empty).

insert into public.integrations (
  slug, name, description, kind, visibility,
  is_first_party, is_verified, author_name, homepage_url, tags
)
values (
  'google-drive',
  'Google Drive',
  'Access and manage files in your Google Drive directly from Polymux.',
  'integration',
  'public',
  true,
  true,
  'Google',
  'https://drive.google.com',
  array['Files', 'Storage', 'Cloud', 'storage']
)
on conflict (slug) do nothing;

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
where i.slug = 'google-drive'
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
  and i.slug = 'google-drive'
  and i.current_version_id is null;

-- Ensure lowercase storage tag for ?tag=storage marketplace filter.
update public.integrations
set tags = case
  when exists (
    select 1 from unnest(coalesce(tags, '{}')) elem
    where lower(elem) = 'storage'
  ) then tags
  else coalesce(tags, '{}') || array['storage']::text[]
end
where slug = 'google-drive';

-- Point any pre-existing Drive connections at the catalog version.
update public.workspace_integrations wi
set integration_version_id = i.current_version_id
from public.integrations i
where i.slug = wi.provider
  and i.slug = 'google-drive'
  and wi.integration_version_id is null;
