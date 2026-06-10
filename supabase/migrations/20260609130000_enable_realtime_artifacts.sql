-- Enable Supabase Realtime on artifacts so the frontend (useAgentChats and
-- useArtifacts composables) receives push events when the orchestrator calls
-- SaveArtifact, allowing the ArtifactChatCard bubble to appear in real-time.
ALTER PUBLICATION supabase_realtime ADD TABLE public.artifacts;
