-- Layouts: a fourth kind of marketplace listing.
--
-- A "layout" is custom HTML/CSS/JS authored by a workspace member and rendered
-- inside a TabPanel body — i.e. it appears as a tab on a Polymux section page
-- (integrations, storage, vault, dashboard, etc.). Built-in Polymux tabs stay
-- in place; custom tabs sit to the right and are draggable among themselves.
--
-- Storage shape mirrors workflows: `integrations` row carries the catalog
-- metadata (kind='layout', slug, name, etc.), `integration_layout_refs` holds
-- the actual body + target section. Updating the layout is a re-publish that
-- UPSERTs the refs row.
--
-- Install: a `workspace_integrations` row whose provider = layout slug,
-- carrying `metadata.target_section` (which section to render in),
-- `metadata.tab_label` (display name on the tab), and `metadata.tab_index`
-- (sort order among custom tabs). Plugin bundles can include layouts.

------------------------------------------------------------------------------
-- 1. Extend the kind check on integrations
------------------------------------------------------------------------------

alter table public.integrations
  drop constraint if exists integrations_kind_check;
alter table public.integrations
  add constraint integrations_kind_check
  check (kind in ('integration', 'workflow', 'plugin', 'layout'));

------------------------------------------------------------------------------
-- 2. integration_layout_refs: kind='layout' rows carry custom body + section
------------------------------------------------------------------------------

create table if not exists public.integration_layout_refs (
  integration_id    uuid        primary key references public.integrations(id) on delete cascade,
  body              text        not null,
  -- e.g. 'integrations', 'storage', 'vault', 'dashboard'. Identifies the
  -- nav-tabs surface the layout slots into. Not enum'd at the DB layer so
  -- new sections can be added in code without a migration.
  target_section    text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.touch_integration_layout_refs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_integration_layout_refs_touch_updated_at on public.integration_layout_refs;
create trigger trg_integration_layout_refs_touch_updated_at
  before update on public.integration_layout_refs
  for each row execute function public.touch_integration_layout_refs_updated_at();

alter table public.integration_layout_refs enable row level security;

-- Mirror the workflow-refs policies: readable when the parent listing is
-- readable; author writes their own.
create policy "integration_layout_refs_read"
  on public.integration_layout_refs for select
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_layout_refs.integration_id
         and (
           i.visibility in ('public', 'unlisted')
           or i.author_user_id = auth.uid()
           or exists (
             select 1 from public.workspace_integrations wi
               join public.workspace_members wm on wm.workspace_id = wi.workspace_id
              where wi.provider = i.slug and wm.user_id = auth.uid()
           )
         )
    )
  );

create policy "integration_layout_refs_author_write"
  on public.integration_layout_refs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.integrations i
       where i.id = integration_layout_refs.integration_id
         and i.author_user_id = auth.uid()
         and i.is_first_party = false
    )
  );

create policy "integration_layout_refs_author_update"
  on public.integration_layout_refs for update
  to authenticated
  using (
    exists (
      select 1 from public.integrations i
       where i.id = integration_layout_refs.integration_id
         and i.author_user_id = auth.uid()
         and i.is_first_party = false
    )
  );
