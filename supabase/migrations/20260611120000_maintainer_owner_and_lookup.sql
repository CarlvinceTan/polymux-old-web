-- Owner tier on maintainers + a service-role-only email→user lookup, for the
-- in-web admin "Maintainers" management page (admin.polymux.com).
--
-- In web's model a maintainer is an existing Polymux user whose user_id is in
-- public.maintainers (not a dedicated auth user like the console created). The
-- owner tier (is_owner) gates who may add/remove maintainers.

alter table public.maintainers
  add column if not exists is_owner boolean not null default false;

-- Seed the founding owner.
update public.maintainers set is_owner = true where lower(email) = 'team@polymux.com';

-- Look up an existing auth user by email. SECURITY DEFINER so it can read
-- auth.users without exposing that table to PostgREST; execute is revoked from
-- everyone except the service role (which bypasses the grant check).
create or replace function public.admin_lookup_user_by_email(p_email text)
returns table(user_id uuid, user_email text)
language sql
security definer
set search_path = public, auth
as $$
  select u.id, u.email from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;
revoke all on function public.admin_lookup_user_by_email(text) from public;
revoke all on function public.admin_lookup_user_by_email(text) from anon;
revoke all on function public.admin_lookup_user_by_email(text) from authenticated;
