-- Prior user_settings migrations (cloaked_browser, show_cursor_overlay,
-- all_notifications) each added a parameter to upsert_user_settings via
-- CREATE OR REPLACE. Because adding a parameter changes the function's
-- identity in Postgres, the old shorter overloads were never dropped — so
-- the public schema accumulated four signatures of the same function name.
--
-- When the Nuxt PATCH handler calls supabase.rpc('upsert_user_settings',
-- { p_blog_newsletter_subscribed: true }) the supabase-js client omits
-- undefined fields, leaving Postgres with multiple candidate overloads
-- (all declare p_blog_newsletter_subscribed as the first param with a
-- default) — resolution becomes ambiguous and the call 500s.
--
-- Drop the legacy overloads so only the current 5-arg version remains.
-- Idempotent via DROP FUNCTION IF EXISTS.
drop function if exists public.upsert_user_settings(
  boolean,
  jsonb
);

drop function if exists public.upsert_user_settings(
  boolean,
  jsonb,
  boolean
);

drop function if exists public.upsert_user_settings(
  boolean,
  jsonb,
  boolean,
  boolean
);
