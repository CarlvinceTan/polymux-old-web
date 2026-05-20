-- Fix blog_posts write policies.
--
-- The original migration (20260520000000_blog_posts.sql) gated writes with
--
--   exists (select 1 from public.maintainers m where m.user_id = auth.uid())
--
-- but public.maintainers has RLS enabled with NO policies for the
-- `authenticated` role (service-role only by design). That means the
-- subquery sees zero rows when run as the calling user, so every write
-- against blog_posts failed with "new row violates row-level security
-- policy". This migration replaces the inline subquery with a SECURITY
-- DEFINER helper that bypasses RLS on maintainers.

create or replace function public.is_maintainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.maintainers m where m.user_id = auth.uid()
  );
$$;

-- The function reads maintainers as the function owner (postgres), bypassing
-- the locked-down RLS. It returns a single boolean for the *calling* user.
grant execute on function public.is_maintainer() to authenticated;

drop policy if exists "blog_posts_maintainer_read" on public.blog_posts;
create policy "blog_posts_maintainer_read"
  on public.blog_posts
  for select
  to authenticated
  using (public.is_maintainer());

drop policy if exists "blog_posts_maintainer_insert" on public.blog_posts;
create policy "blog_posts_maintainer_insert"
  on public.blog_posts
  for insert
  to authenticated
  with check (public.is_maintainer());

drop policy if exists "blog_posts_maintainer_update" on public.blog_posts;
create policy "blog_posts_maintainer_update"
  on public.blog_posts
  for update
  to authenticated
  using (public.is_maintainer())
  with check (public.is_maintainer());

drop policy if exists "blog_posts_maintainer_delete" on public.blog_posts;
create policy "blog_posts_maintainer_delete"
  on public.blog_posts
  for delete
  to authenticated
  using (public.is_maintainer());
