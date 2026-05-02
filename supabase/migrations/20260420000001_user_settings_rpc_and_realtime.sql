create or replace function public.upsert_user_settings(
  p_blog_newsletter_subscribed boolean default null,
  p_settings jsonb default null
)
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.user_settings;
begin
  insert into public.user_settings (user_id, blog_newsletter_subscribed, settings)
  values (
    auth.uid(),
    coalesce(p_blog_newsletter_subscribed, false),
    coalesce(p_settings, '{}'::jsonb)
  )
  on conflict (user_id)
  do update set
    blog_newsletter_subscribed = coalesce(p_blog_newsletter_subscribed, user_settings.blog_newsletter_subscribed),
    settings = coalesce(p_settings, user_settings.settings),
    updated_at = now()
  returning * into v_settings;

  return v_settings;
end;
$$;
alter publication supabase_realtime add table public.user_settings;
