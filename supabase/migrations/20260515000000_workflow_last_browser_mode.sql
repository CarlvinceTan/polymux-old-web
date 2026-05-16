-- Persist the user's per-workflow browser mode choice ("server" or
-- "extension") so a fresh page-load / cross-device return restores the
-- last selection without depending on the previous browser's sessionStorage.
--
-- Default 'server' so older rows (pre-extension feature) land on the
-- hosted Chromium runtime, which has always worked. A check constraint
-- prevents arbitrary values from bypassing the Selector dispatch — anything
-- the Go server doesn't recognize silently falls back to 'server' anyway,
-- but blocking bad writes at the DB boundary keeps the data clean for
-- future settings UIs.
--
-- Scheduled / unattended runs ignore this column and stick to 'server'
-- because they have no live client to drive the user's local Chrome.

alter table public.workflows
  add column if not exists last_browser_mode text not null default 'server';

alter table public.workflows
  drop constraint if exists workflows_last_browser_mode_valid;
alter table public.workflows
  add  constraint workflows_last_browser_mode_valid
  check (last_browser_mode in ('server', 'extension'));
