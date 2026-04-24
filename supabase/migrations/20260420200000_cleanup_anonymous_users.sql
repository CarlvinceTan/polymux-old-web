-- Anonymous auth has been removed from the app. Purge any existing anonymous users so
-- their workspaces, sessions, and related rows cascade away instead of sitting orphaned.
-- The Supabase project setting "Enable anonymous sign-ins" should also be disabled in the
-- dashboard (auth settings) since this is not configurable via SQL.
delete from auth.users where is_anonymous = true;
