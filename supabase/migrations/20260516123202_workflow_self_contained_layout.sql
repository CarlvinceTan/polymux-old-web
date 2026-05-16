-- Hard cutover for the self-contained workflow layout redesign:
-- `workflow_versions.steps` (JSONB) now carries presentation fields
-- (position, size, wire endpoint sides) alongside the existing semantic
-- graph. Old rows don't have these and would render at origin; truncating
-- avoids dragging an ambiguous half-state forward. Dev/test data only.

truncate table public.workflow_versions cascade;
truncate table public.workflow_runs cascade;
