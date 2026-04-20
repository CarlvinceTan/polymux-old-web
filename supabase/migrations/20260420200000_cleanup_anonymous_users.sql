-- Cleanup function for orphaned anonymous users (no linked identity, older than 7 days).
-- Call this manually or schedule it via pg_cron / Supabase cron jobs.
create or replace function cleanup_anonymous_users()
returns void
language plpgsql
security definer
as $$
begin
  delete from auth.users
  where is_anonymous = true
    and created_at < now() - interval '7 days';
end;
$$;
