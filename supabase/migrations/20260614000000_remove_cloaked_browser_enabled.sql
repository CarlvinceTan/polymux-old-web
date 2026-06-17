-- Remove the dead `cloaked_browser_enabled` user setting.
--
-- This per-user flag was persisted but never consumed: no UI rendered it, no web
-- code read it, and the Go backend's user_settings struct only decodes
-- show_cursor_overlay (its SELECT is `select=show_cursor_overlay`). CloakBrowser
-- routing is chosen by the server's `browser_path` config (the stealth-patched
-- Chromium binary), not by this flag. Cloaked-browser control is moving to a
-- per-session setting, so the global toggle is removed.
--
-- Removing a defaulted parameter changes upsert_user_settings' signature, so the
-- old overload must be dropped before recreating it without the param. Do this
-- before dropping the column so the live function never references a missing one.

drop function if exists public.upsert_user_settings(boolean, jsonb, boolean, boolean, boolean, integer);

create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null,
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
    show_cursor_overlay,
    all_notifications_enabled,
    voice_auto_shutoff_seconds
  )
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb),
    coalesce(p_show_cursor_overlay, false),
    coalesce(p_all_notifications_enabled, true),
    coalesce(p_voice_auto_shutoff_seconds, 5)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings                   = coalesce(p_settings, user_settings.settings),
    show_cursor_overlay        = coalesce(p_show_cursor_overlay, user_settings.show_cursor_overlay),
    all_notifications_enabled  = coalesce(p_all_notifications_enabled, user_settings.all_notifications_enabled),
    voice_auto_shutoff_seconds = coalesce(p_voice_auto_shutoff_seconds, user_settings.voice_auto_shutoff_seconds),
    updated_at                 = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

alter table public.user_settings
  drop column if exists cloaked_browser_enabled;
