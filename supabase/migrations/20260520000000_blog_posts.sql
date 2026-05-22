-- Blog posts authored from the maintainer console, served on polymux.com/blog.
--
-- Writes are gated by membership in public.maintainers (same table that
-- governs every other admin surface). Reads are public, but only rows whose
-- published_at is set and not in the future are visible to non-maintainers.
--
-- Maintainers see drafts (published_at IS NULL) plus scheduled posts
-- (published_at > now()) so the console can list both alongside live posts.

create table if not exists public.blog_posts (
  id              uuid         primary key default gen_random_uuid(),
  slug            text         not null unique,
  title           text         not null,
  excerpt         text         not null default '',
  body_markdown   text         not null default '',
  category        text,
  -- One of 'slate' | 'zinc' | 'stone' — drives the thumbnail accent on the
  -- index page. Free-form text so future palettes don't require a migration.
  accent          text         not null default 'slate',
  cover_image_url text,
  published_at    timestamptz,
  author_id       uuid         references auth.users(id) on delete set null,
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

create index if not exists idx_blog_posts_published_at
  on public.blog_posts(published_at desc)
  where published_at is not null;

-- updated_at trigger so the console always reflects last-edit time without
-- the editor having to set it manually.
create or replace function public.blog_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_blog_posts_updated_at on public.blog_posts;
create trigger trg_blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_set_updated_at();

alter table public.blog_posts enable row level security;

-- Public read: anyone (including anon) can see posts that are published and
-- whose publish time has arrived. No drafts, no scheduled-future posts.
drop policy if exists "blog_posts_public_read" on public.blog_posts;
create policy "blog_posts_public_read"
  on public.blog_posts
  for select
  to anon, authenticated
  using (published_at is not null and published_at <= now());

-- Maintainer read: every row, regardless of publish state.
drop policy if exists "blog_posts_maintainer_read" on public.blog_posts;
create policy "blog_posts_maintainer_read"
  on public.blog_posts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.maintainers m where m.user_id = auth.uid()
    )
  );

drop policy if exists "blog_posts_maintainer_insert" on public.blog_posts;
create policy "blog_posts_maintainer_insert"
  on public.blog_posts
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.maintainers m where m.user_id = auth.uid()
    )
  );

drop policy if exists "blog_posts_maintainer_update" on public.blog_posts;
create policy "blog_posts_maintainer_update"
  on public.blog_posts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.maintainers m where m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.maintainers m where m.user_id = auth.uid()
    )
  );

drop policy if exists "blog_posts_maintainer_delete" on public.blog_posts;
create policy "blog_posts_maintainer_delete"
  on public.blog_posts
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.maintainers m where m.user_id = auth.uid()
    )
  );

-- Seed the three legacy posts that lived as a hardcoded array in
-- web/app/pages/blog.vue, so polymux.com/blog isn't blank the moment this
-- migration applies. Published timestamps preserve the original `date` field.
insert into public.blog_posts (slug, title, excerpt, body_markdown, category, accent, published_at)
values
  (
    'introducing-polymux-agents',
    'Introducing multi-agent orchestration in Polymux',
    'How we think about reliable coordination, isolated browser sessions, and observability when you run more than one agent at a time.',
    '# Introducing multi-agent orchestration in Polymux

How we think about reliable coordination, isolated browser sessions, and observability when you run more than one agent at a time.

_Full post coming soon — edit this draft from the Blogs tab in the maintainer console._',
    'Product',
    'slate',
    '2026-03-18 09:00:00+00'
  ),
  (
    'vault-security-model',
    'How the Polymux Vault keeps secrets out of prompts',
    'A short tour of encryption boundaries, scoped access for agents, and what gets logged when credentials are used.',
    '# How the Polymux Vault keeps secrets out of prompts

A short tour of encryption boundaries, scoped access for agents, and what gets logged when credentials are used.

_Full post coming soon — edit this draft from the Blogs tab in the maintainer console._',
    'Security',
    'zinc',
    '2026-03-04 09:00:00+00'
  ),
  (
    'marketplace-rollout',
    'Publishing workflows to the marketplace',
    'Packaging agents, versioning bundles, and what reviewers look for before a listing goes live.',
    '# Publishing workflows to the marketplace

Packaging agents, versioning bundles, and what reviewers look for before a listing goes live.

_Full post coming soon — edit this draft from the Blogs tab in the maintainer console._',
    'Platform',
    'stone',
    '2026-02-19 09:00:00+00'
  )
on conflict (slug) do nothing;
