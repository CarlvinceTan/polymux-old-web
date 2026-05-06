-- Drop the (workspace_id, name) unique constraint on workflows.
-- Workflow names are no longer required to be unique within a workspace —
-- the rename / create paths previously had to auto-suffix or surface a 409
-- to work around it, which made LLM-generated titles and concurrent drafts
-- collide for no real product reason.

alter table public.workflows
  drop constraint if exists workflows_workspace_id_name_key;
