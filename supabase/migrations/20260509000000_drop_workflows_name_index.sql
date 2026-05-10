-- Drop the partial unique index that still enforced (workspace_id, name)
-- uniqueness on undeleted workflows. The earlier migration
-- 20260505000000_drop_workflows_unique_name.sql dropped the
-- workflows_workspace_id_name_key constraint but missed this partial index
-- (created by 20260429100000_workflow_traces_phase1.sql), so unique-violation
-- 23505s kept surfacing on the draft-commit path.

drop index if exists public.workflows_workspace_id_name_active;
