-- Persist the user's per-workflow "cloaked browser" choice (the Stealth tab) so
-- a reload / cross-device return restores the toggle.
--
-- Default true: the cloaked (anti-bot-detection) Chromium is used by default.
-- When false, the midas driver launches the configured plain Chromium instead.
-- Only the midas browser driver acts on the flag.
--
-- Written by the polymux backend's handle_set_cloaked via PostgREST PATCH;
-- read on session connect (GetSession).

alter table public.workflows
  add column if not exists last_cloaked_enabled boolean not null default true;
