-- Add locked_node_ids text[] to workflow_versions so user-locked nodes
-- (those the orchestrator must not modify) are pinned by stable path-id
-- rather than the brittle index-based locked_step_indices column. The
-- legacy column is kept untouched so older clients continue to function;
-- new code reads/writes locked_node_ids exclusively.

alter table public.workflow_versions
  add column if not exists locked_node_ids text[] not null default '{}';

comment on column public.workflow_versions.locked_node_ids is
  'Stable path-based node IDs the user has locked from orchestrator edits. Replaces the index-based locked_step_indices column.';
