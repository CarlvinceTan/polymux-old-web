-- Workflow graph model cutover.
--
-- Drops the legacy tree-of-typed-nodes payload (kinds: directive | sequence |
-- loop | parallel with nested children) in favour of a flat graph: nodes
-- carry directive fields only (no kind), and a sibling `edges` array on the
-- same `steps` JSONB column carries control flow (sequence via chained
-- edges, fan-out parallel implicit, conditional via edge.condition, loop
-- via edge.max_iterations on a back-edge).
--
-- Existing rows are tree-shaped and incompatible; the user confirmed a
-- hard cutover (dev/test data only). Workflow versions and any in-flight
-- runs are truncated. `workflows` is left intact so workspace-scoped
-- bookkeeping (name, description, last_browser_states, last_browser_mode,
-- last_viewport_urls) survives — the user re-authors the graph against
-- the existing workflow row.
--
-- The `locked_step_indices` column was already deprecated in favour of
-- `locked_node_ids`; the new graph has no concept of "step index" so the
-- legacy column is dropped here.

truncate table public.workflow_versions cascade;
truncate table public.workflow_runs cascade;

alter table public.workflow_versions
  drop column if exists locked_step_indices;
