-- Storage bucket for per-session ephemeral artifacts (§5.6).
--
-- Private — no client-side RLS policies, all reads happen via signed URLs
-- minted by the Nuxt server after a session-membership check, and writes go
-- through the Go backend with the service role.
--
-- Object naming convention: {session_id}/{artifact_id}/{name}
-- The 24-hour cleanup job (separate scheduled task, out of scope here) walks
-- artifacts whose session ended_at is in the past and deletes both the row and
-- the matching storage objects.

insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)
on conflict (id) do nothing;
