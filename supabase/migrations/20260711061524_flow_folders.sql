-- User-defined folders for organising flows in the sidebar and flow pickers.

create table if not exists public.flow_folders (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  name         text        not null check (char_length(trim(name)) between 1 and 80),
  position     numeric     not null default 0,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.flow_folders
  add constraint flow_folders_workspace_id_id_key unique (workspace_id, id);

create index if not exists idx_flow_folders_workspace_position
  on public.flow_folders(workspace_id, position desc, created_at asc);

-- Match workflow-row positioning: a newly-created folder receives the next
-- highest position in its workspace and therefore appears at the top.
create or replace function public.assign_flow_folder_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.position = 0 then
    new.position := coalesce(
      (select max(position) + 1 from public.flow_folders where workspace_id = new.workspace_id),
      1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists flow_folders_assign_position on public.flow_folders;
create trigger flow_folders_assign_position
  before insert on public.flow_folders
  for each row execute function public.assign_flow_folder_position();

alter table public.workflows
  add column if not exists folder_id uuid;
alter table public.workflows
  add constraint workflows_workspace_folder_fkey
  foreign key (workspace_id, folder_id)
  references public.flow_folders(workspace_id, id);
create index if not exists idx_workflows_folder
  on public.workflows(folder_id) where folder_id is not null;

create or replace function public.touch_flow_folder_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists flow_folders_touch_updated_at on public.flow_folders;
create trigger flow_folders_touch_updated_at
  before update on public.flow_folders
  for each row execute function public.touch_flow_folder_updated_at();

alter table public.flow_folders enable row level security;
grant select, insert, update, delete on public.flow_folders to authenticated;

drop policy if exists "workspace_members_read_flow_folders" on public.flow_folders;
create policy "workspace_members_read_flow_folders"
  on public.flow_folders for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = flow_folders.workspace_id and wm.user_id = auth.uid()
  ));

drop policy if exists "workspace_members_insert_flow_folders" on public.flow_folders;
create policy "workspace_members_insert_flow_folders"
  on public.flow_folders for insert to authenticated
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = flow_folders.workspace_id and wm.user_id = auth.uid()
  ));

drop policy if exists "workspace_members_update_flow_folders" on public.flow_folders;
create policy "workspace_members_update_flow_folders"
  on public.flow_folders for update to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = flow_folders.workspace_id and wm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = flow_folders.workspace_id and wm.user_id = auth.uid()
  ));

drop policy if exists "workspace_members_delete_flow_folders" on public.flow_folders;
create policy "workspace_members_delete_flow_folders"
  on public.flow_folders for delete to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = flow_folders.workspace_id and wm.user_id = auth.uid()
  ));
