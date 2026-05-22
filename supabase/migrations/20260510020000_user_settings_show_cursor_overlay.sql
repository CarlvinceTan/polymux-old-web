-- Adds the show_cursor_overlay toggle to user_settings.
--
-- Default false: viewers don't see the simulated cursor unless they ask for
-- it. Toggling on tells the frontend to render an arrow cursor on top of the
-- live browser screencast at the position reported by the driver (midas), so
-- maintainers can watch where the agent is hovering / clicking in real time.
alter table public.user_settings
  add column if not exists show_cursor_overlay boolean not null default false;

-- Re-create upsert_user_settings so the new column round-trips through the
-- RPC the API patch handler calls. The function is rewritten in full because
-- Postgres will not let us add a parameter to an existing definition.
create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null,
  p_cloaked_browser_enabled boolean default null,
  p_show_cursor_overlay boolean default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.user_settings;
begin
  insert into public.user_settings (user_id, blog_newsletter_subscribed, settings, cloaked_browser_enabled, show_cursor_overlay)
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb),
    coalesce(p_cloaked_browser_enabled, true),
    coalesce(p_show_cursor_overlay, false)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings                   = coalesce(p_settings, user_settings.settings),
    cloaked_browser_enabled    = coalesce(p_cloaked_browser_enabled, user_settings.cloaked_browser_enabled),
    show_cursor_overlay        = coalesce(p_show_cursor_overlay, user_settings.show_cursor_overlay),
    updated_at                 = now()
  returning * into v_settings;

  return v_settings;
end;
$$;
