-- Master "All notifications" preference.
--
-- When false, the web app suppresses every non-essential email it would
-- otherwise send to this user (workspace invitations, blog newsletter, etc).
-- Default true so existing users keep receiving mail until they opt out.
--
-- Important emails sent from the admin console (security alerts, account
-- recovery, billing failures, etc) bypass this flag at the send-site by
-- passing `bypassUserPreferences: true` into the shared email helper.
alter table public.user_settings
  add column if not exists all_notifications_enabled boolean not null default true;

-- Re-create upsert_user_settings so the new column round-trips through the
-- RPC the API patch handler calls.
create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null,
  p_cloaked_browser_enabled boolean default null,
  p_show_cursor_overlay boolean default null,
  p_all_notifications_enabled boolean default null
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
    all_notifications_enabled
  )
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb),
    coalesce(p_cloaked_browser_enabled, true),
    coalesce(p_show_cursor_overlay, false),
    coalesce(p_all_notifications_enabled, true)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings                   = coalesce(p_settings, user_settings.settings),
    cloaked_browser_enabled    = coalesce(p_cloaked_browser_enabled, user_settings.cloaked_browser_enabled),
    show_cursor_overlay        = coalesce(p_show_cursor_overlay, user_settings.show_cursor_overlay),
    all_notifications_enabled  = coalesce(p_all_notifications_enabled, user_settings.all_notifications_enabled),
    updated_at                 = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

-- Helper that the Nuxt server can call (via service-role) to decide whether
-- to send a non-essential notification to a given email address.
--
-- Returns true when:
--   * no auth.users row matches the email (recipient isn't a Polymux user;
--     the only way to opt out for non-users is the per-list unsubscribe
--     token, which is checked separately), OR
--   * the matched user has all_notifications_enabled = true (default for
--     users who never opened the setting).
-- Returns false only when an explicit opt-out is on record.
create or replace function public.notifications_enabled_for_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_enabled boolean;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return true;
  end if;

  select id into v_user_id
    from auth.users
   where lower(email) = lower(trim(p_email))
   limit 1;

  if v_user_id is null then
    return true;
  end if;

  select all_notifications_enabled into v_enabled
    from public.user_settings
   where user_id = v_user_id;

  -- No settings row yet → defaults apply (true).
  return coalesce(v_enabled, true);
end;
$$;

revoke all on function public.notifications_enabled_for_email(text) from public, anon, authenticated;
-- service_role retains execute by default for security-definer functions
-- created here; the Nuxt server uses the service-role key to call it.
