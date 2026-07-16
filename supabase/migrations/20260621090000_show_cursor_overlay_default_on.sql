-- Show the agent cursor overlay by default.
--
-- The overlay never functioned before this feature shipped (the server's
-- EmitCursor had no caller, so the cursor never rendered), which means every
-- stored show_cursor_overlay = false is the OLD default and not a deliberate
-- user choice — backfill those to true. Going forward the upsert RPC's UPDATE
-- path preserves explicit values, so anyone who turns it off afterwards stays
-- off ("on by default unless changed").
--
-- NOTE: `cloaked_browser_enabled` was removed (see remove_cloaked_browser_enabled),
-- so the canonical upsert_user_settings is the 5-arg form the API calls. A stale
-- 6-arg overload (with p_cloaked_browser_enabled, referencing the dropped column)
-- coexisting with it makes PostgREST unable to resolve the 5-arg call and 500s
-- every settings save — so drop it here before (re)defining the 5-arg function.

alter table public.user_settings
  alter column show_cursor_overlay set default true;

update public.user_settings
  set show_cursor_overlay = true
  where show_cursor_overlay = false;

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
    coalesce(p_show_cursor_overlay, true),
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
