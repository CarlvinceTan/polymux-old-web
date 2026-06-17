-- Persist the user's per-workflow "Agent Humaniser" choice (the Stealth tab)
-- so a fresh page-load / cross-device return restores the toggle without
-- depending on the previous browser's sessionStorage.
--
-- Default true: humanized input (Bezier mouse paths + per-keystroke cadence)
-- is on by default so a new workflow is disguised without setup. Older rows
-- (pre-feature) land on true for the same reason. Only the midas browser
-- driver acts on the flag; other drivers ignore it.
--
-- Written by the polymux backend's handle_set_humanize via PostgREST PATCH;
-- read on session connect (GetSession) to restore the choice.

alter table public.workflows
  add column if not exists last_humanize_enabled boolean not null default true;
