-- Public community forum: discussions + replies.
-- Anyone (anonymous or authenticated) can read. Only authenticated users can
-- post. Authors can edit/delete their own posts.
--
-- Author display fields (author_name, author_initials) are denormalised onto
-- each row so public reads don't require exposing auth.users via a definer
-- function.

create table if not exists public.forum_discussions (
  id               uuid        primary key default gen_random_uuid(),
  category         text        not null check (category in (
                     'announcements', 'help', 'show-and-tell',
                     'feedback', 'workflows', 'agents'
                   )),
  title            text        not null check (char_length(btrim(title)) between 3 and 200),
  body             text        not null check (char_length(btrim(body)) between 10 and 20000),
  author_id        uuid        not null references auth.users(id) on delete cascade,
  author_name      text        not null,
  author_initials  text        not null,
  pinned           boolean     not null default false,
  answered         boolean     not null default false,
  views            integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_forum_discussions_category_created
  on public.forum_discussions (category, created_at desc);

create index if not exists idx_forum_discussions_created
  on public.forum_discussions (created_at desc);

alter table public.forum_discussions enable row level security;

create policy "forum_discussions_public_read"
  on public.forum_discussions for select
  using (true);

create policy "forum_discussions_author_insert"
  on public.forum_discussions for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "forum_discussions_author_update"
  on public.forum_discussions for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "forum_discussions_author_delete"
  on public.forum_discussions for delete
  to authenticated
  using (auth.uid() = author_id);


create table if not exists public.forum_replies (
  id               uuid        primary key default gen_random_uuid(),
  discussion_id    uuid        not null references public.forum_discussions(id) on delete cascade,
  body             text        not null check (char_length(btrim(body)) between 1 and 20000),
  author_id        uuid        not null references auth.users(id) on delete cascade,
  author_name      text        not null,
  author_initials  text        not null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_forum_replies_discussion_created
  on public.forum_replies (discussion_id, created_at asc);

alter table public.forum_replies enable row level security;

create policy "forum_replies_public_read"
  on public.forum_replies for select
  using (true);

create policy "forum_replies_author_insert"
  on public.forum_replies for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "forum_replies_author_update"
  on public.forum_replies for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "forum_replies_author_delete"
  on public.forum_replies for delete
  to authenticated
  using (auth.uid() = author_id);


create or replace function public.forum_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_forum_discussions_touch_updated on public.forum_discussions;
create trigger trg_forum_discussions_touch_updated
  before update on public.forum_discussions
  for each row execute function public.forum_touch_updated_at();


-- List discussions with denormalised reply_count + last_activity_at in a
-- single roundtrip. Filter + sort happen server-side so clients paginate
-- cleanly. Safe for anonymous callers: RLS on forum_discussions enforces
-- public read.
create or replace function public.list_forum_discussions(
  p_category text default null,
  p_sort     text default 'latest',
  p_search   text default null,
  p_limit    int  default 50,
  p_offset   int  default 0
)
returns table (
  id               uuid,
  category         text,
  title            text,
  body             text,
  author_id        uuid,
  author_name      text,
  author_initials  text,
  pinned           boolean,
  answered         boolean,
  views            integer,
  reply_count      bigint,
  last_activity_at timestamptz,
  created_at       timestamptz
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      d.*,
      (select count(*) from public.forum_replies r where r.discussion_id = d.id) as reply_count,
      coalesce(
        (select max(r.created_at) from public.forum_replies r where r.discussion_id = d.id),
        d.created_at
      ) as last_activity_at
    from public.forum_discussions d
    where
      (p_category is null or d.category = p_category)
      and (
        p_search is null
        or btrim(p_search) = ''
        or d.title ilike '%' || p_search || '%'
        or d.body  ilike '%' || p_search || '%'
      )
      and (p_sort <> 'unanswered' or not d.answered)
  )
  select
    id, category, title, body, author_id, author_name, author_initials,
    pinned, answered, views, reply_count, last_activity_at, created_at
  from base
  order by
    pinned desc,
    case when p_sort = 'top' then views end desc nulls last,
    case when p_sort = 'top' then reply_count end desc nulls last,
    last_activity_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.list_forum_discussions(text, text, text, int, int) to anon, authenticated;


-- Fire-and-forget view-count bump. Security definer so anon readers can
-- increment without an UPDATE policy covering them. Rate-limiting / dedupe
-- is a client concern for now (single bump per page load).
create or replace function public.increment_forum_discussion_views(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.forum_discussions set views = views + 1 where id = p_id;
$$;

grant execute on function public.increment_forum_discussion_views(uuid) to anon, authenticated;
