-- Persist per-browser-agent terminal state and a workflow-level "is_running"
-- flag so the UI can render historical viewports with their last colour
-- (green/red) without spawning anything, and so the workflow list can shimmer
-- only for workflows that are actually executing (interactive turn or
-- scheduled run). The legacy `last_viewport_urls` column stays in place as a
-- fallback while the Go server backfills the richer column.

alter table public.workflows
  add column if not exists last_browser_states jsonb not null default '[]'::jsonb;

alter table public.workflows
  drop constraint if exists workflows_last_browser_states_is_array;
alter table public.workflows
  add  constraint workflows_last_browser_states_is_array
  check (jsonb_typeof(last_browser_states) = 'array');

alter table public.workflows
  add column if not exists is_running boolean not null default false;
