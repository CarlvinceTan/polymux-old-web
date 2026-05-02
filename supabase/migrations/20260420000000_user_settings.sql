create table if not exists public.user_settings (
  user_id                   uuid        primary key references auth.users(id) on delete cascade,
  blog_newsletter_subscribed boolean     not null default false,
  settings                  jsonb       not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "users_select_own_settings"
  on public.user_settings for select
  to authenticated
  using (auth.uid() = user_id);
create policy "users_update_own_settings"
  on public.user_settings for update
  to authenticated
  using (auth.uid() = user_id);
create policy "users_insert_own_settings"
  on public.user_settings for insert
  to authenticated
  with check (auth.uid() = user_id);
create or replace function public.get_or_create_user_settings(p_user_id uuid)
returns public.user_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.user_settings;
begin
  select * into v_settings from public.user_settings where user_id = p_user_id;
  if not found then
    insert into public.user_settings (user_id) values (p_user_id) returning * into v_settings;
  end if;
  return v_settings;
end;
$$;
