-- Persist the URLs of browser sub-agents active in a workflow session so that
-- after logout / tab close / cross-device return the UI can respawn fresh
-- browser agents seeded to those URLs. Stored as a JSON array of strings.
-- Empty array = no agents to restore.
alter table public.sessions
  add column if not exists last_viewport_urls jsonb not null default '[]'::jsonb;
-- Guard against non-array values slipping in via any path.
alter table public.sessions
  add constraint sessions_last_viewport_urls_is_array
  check (jsonb_typeof(last_viewport_urls) = 'array');
