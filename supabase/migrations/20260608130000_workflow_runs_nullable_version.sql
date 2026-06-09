-- Allow ad-hoc / draft workflow runs that aren't tied to a saved version.
--
-- "Run what you see": a run started from an unsaved draft (or a saved workflow
-- with unsaved canvas edits) executes the graph the client sends inline, with
-- no workflow_versions row behind it — so version history stays clean and the
-- user doesn't have to save first. The run row therefore needs an optional
-- version id.
--
-- The existing FK (workflow_version_id -> workflow_versions.id) already permits
-- NULL — Postgres exempts NULL from FK checks — so this only relaxes the
-- NOT NULL constraint; nothing else changes.
alter table public.workflow_runs
  alter column workflow_version_id drop not null;
