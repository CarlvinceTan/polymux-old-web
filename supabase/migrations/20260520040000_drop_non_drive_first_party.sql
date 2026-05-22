-- Remove the seeded gmail / github / slack / notion / linear catalog rows.
-- Only google-drive remains as a first-party connector (it backs the
-- workspace storage system). The others had OAuth scaffolding but no real
-- runtime — there were no tools, no UI surfaces, and no users had a way to
-- actually use them. Cleanup pass before they confuse anyone.
--
-- Cascade summary for the rows we're deleting:
--   integration_versions.integration_id     → cascades on delete
--   integration_install_events.integration_id → cascades on delete
--   integration_workflow_refs.integration_id  → cascades on delete (n/a here)
--   integration_plugin_items.plugin_integration_id → cascades on delete (n/a here)
--   integration_plugin_items.child_integration_id  → ON DELETE RESTRICT — we
--                                                    explicitly clear these
--                                                    first below.
--   workspace_integrations.provider          → not a FK; we delete by slug
--   workspace_integrations.integration_version_id → ON DELETE SET NULL
--                                                   (handled by cascading
--                                                   version delete; we also
--                                                   delete the install rows
--                                                   below)

------------------------------------------------------------------------------
-- 1. Remove any plugin-bundle references pointing at these as children.
--    None should exist for first-party seeds, but the FK is RESTRICT so we
--    can't leave it to chance.
------------------------------------------------------------------------------

delete from public.integration_plugin_items
 where child_integration_id in (
   select id from public.integrations
   where slug in ('gmail', 'github', 'slack', 'notion', 'linear')
 );

------------------------------------------------------------------------------
-- 2. Drop existing workspace installs of these providers. The OAuth code is
--    going away too — leaving installs around would break next refresh and
--    confuse the marketplace UI ("connected" with no catalog row to match).
--    Cascading clears grants + tokens via existing FKs.
------------------------------------------------------------------------------

delete from public.workspace_integrations
 where provider in ('gmail', 'github', 'slack', 'notion', 'linear');

------------------------------------------------------------------------------
-- 3. Drop the catalog rows. Cascades clean up integration_versions,
--    integration_install_events, etc.
------------------------------------------------------------------------------

delete from public.integrations
 where slug in ('gmail', 'github', 'slack', 'notion', 'linear')
   and is_first_party = true;
