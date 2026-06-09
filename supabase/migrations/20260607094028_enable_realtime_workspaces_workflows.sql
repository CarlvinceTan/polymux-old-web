-- Enable Supabase Realtime on workspaces and workflows so the frontend
-- (useWorkspaceEvents composable) receives push invalidation events instead
-- of polling on a timer.
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces, public.workflows;
