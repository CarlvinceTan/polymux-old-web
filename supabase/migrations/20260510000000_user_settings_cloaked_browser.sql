-- Adds the cloaked_browser_enabled toggle to user_settings.
--
-- Default true: opt-in by default so the polymux session loop can promote
-- sites with bot-detection puzzles to the cloaked browser tier without
-- additional user setup. Toggling off forces every navigation through the
-- normal browser regardless of the URL registry.
alter table public.user_settings
  add column if not exists cloaked_browser_enabled boolean not null default true;

-- Re-create upsert_user_settings so the new column round-trips through the
-- RPC the API patch handler calls. The function is rewritten in full because
-- Postgres will not let us add a parameter to an existing definition.
create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null,
  p_cloaked_browser_enabled boolean default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.user_settings;
begin
  insert into public.user_settings (user_id, blog_newsletter_subscribed, settings, cloaked_browser_enabled)
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb),
    coalesce(p_cloaked_browser_enabled, true)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings                   = coalesce(p_settings, user_settings.settings),
    cloaked_browser_enabled    = coalesce(p_cloaked_browser_enabled, user_settings.cloaked_browser_enabled),
    updated_at                 = now()
  returning * into v_settings;

  return v_settings;
end;
$$;
