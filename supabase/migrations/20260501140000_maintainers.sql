-- Maintainers: console-side accounts that may use /admin/*. Owned by the
-- Supabase project owner via the dashboard; the polymux backend reads this
-- table with its service-role key. End-users (anon / authenticated) have no
-- RLS policies, so they cannot see or modify rows from any client SDK.
--
-- Maintainer auth.users rows are tagged with app_metadata.kind = 'maintainer'
-- on creation so the normal polymux web app can ignore them.

create table if not exists public.maintainers (
  user_id     uuid         primary key references auth.users(id) on delete cascade,
  email       text         not null unique,
  created_by  uuid         references auth.users(id),
  created_at  timestamptz  not null default now()
);

alter table public.maintainers enable row level security;

-- No policies: service-role only. Adding a maintainer happens via the
-- console's owner-gated /admin/maintainers endpoints, or directly in the
-- Supabase SQL editor (also service-role).
