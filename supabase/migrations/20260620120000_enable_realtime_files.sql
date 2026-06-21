-- Enable Supabase Realtime on the files metadata table so the frontend
-- (useWorkspaceEvents composable) receives push invalidation when files or
-- folders change — e.g. an agent uploads, renames, or deletes while the user is
-- viewing the folder — and refreshes the FileBrowser without polling.
--
-- RLS already lets workspace members SELECT their workspace's rows
-- (policy "workspace_members_read_files" in 20260422000200_files_metadata.sql),
-- which Realtime requires to deliver postgres_changes to the subscriber.
ALTER PUBLICATION supabase_realtime ADD TABLE public.files;

-- DELETE (and UPDATE) realtime events must carry the full OLD row so the
-- workspace_id filter and RLS can be evaluated — by default the WAL only ships
-- the primary key on delete, so the client's `workspace_id=eq.<id>` filter never
-- matches and the FileBrowser wouldn't drop a remotely-deleted file. REPLICA
-- IDENTITY FULL ships every column for UPDATE/DELETE.
ALTER TABLE public.files REPLICA IDENTITY FULL;
