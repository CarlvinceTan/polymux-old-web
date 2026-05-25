-- Voice auto-shutoff default: 5 seconds of silence before voice input stops.
-- 0 remains valid for users who want manual-only shutoff.
alter table public.user_settings
  alter column voice_auto_shutoff_seconds set default 5;

create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null,
  p_cloaked_browser_enabled boolean default null,
  p_show_cursor_overlay boolean default null,
  p_all_notifications_enabled boolean default null,
  p_voice_auto_shutoff_seconds integer default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.user_settings;
begin
  insert into public.user_settings (
    user_id,
    blog_newsletter_subscribed,
    settings,
    cloaked_browser_enabled,
    show_cursor_overlay,
    all_notifications_enabled,
    voice_auto_shutoff_seconds
  )
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb),
    coalesce(p_cloaked_browser_enabled, true),
    coalesce(p_show_cursor_overlay, false),
    coalesce(p_all_notifications_enabled, true),
    coalesce(p_voice_auto_shutoff_seconds, 5)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings                   = coalesce(p_settings, user_settings.settings),
    cloaked_browser_enabled    = coalesce(p_cloaked_browser_enabled, user_settings.cloaked_browser_enabled),
    show_cursor_overlay        = coalesce(p_show_cursor_overlay, user_settings.show_cursor_overlay),
    all_notifications_enabled  = coalesce(p_all_notifications_enabled, user_settings.all_notifications_enabled),
    voice_auto_shutoff_seconds = coalesce(p_voice_auto_shutoff_seconds, user_settings.voice_auto_shutoff_seconds),
    updated_at                 = now()
  returning * into v_settings;

  return v_settings;
end;
$$;
