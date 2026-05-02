-- User-defined file ordering per workspace folder.
--
-- One row per (workspace, parent_path) that the user has manually ordered.
-- `ordered_names` is a list of basenames in user-defined order. Unknown names
-- (for items that have since been deleted, renamed, or moved elsewhere) are
-- tolerated — the read path filters them out. This keeps reorder idempotent
-- and avoids cross-table cascades on move/rename/delete.
--
-- Writes only happen from the Nuxt server routes via the service role; client
-- RLS blocks direct writes.

create table if not exists public.file_order (
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  parent_path    text        not null,
  ordered_names  text[]      not null default '{}',
  updated_by     uuid                 references auth.users(id),
  updated_at     timestamptz not null default now(),
  primary key (workspace_id, parent_path)
);
create index if not exists idx_file_order_workspace
  on public.file_order(workspace_id);
alter table public.file_order enable row level security;
create or replace function public.touch_file_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_file_order_touch_updated_at on public.file_order;
create trigger trg_file_order_touch_updated_at
  before update on public.file_order
  for each row execute function public.touch_file_order_updated_at();
-- Workspace members can read their own workspace's orderings.
create policy "workspace_members_read_file_order"
  on public.file_order for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = file_order.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- No direct client writes. All writes go through Nuxt server routes with the
-- service role, which enforce per-path write permission via
-- effective_file_permission.
create policy "no_client_writes_file_order_insert"
  on public.file_order for insert
  to authenticated
  with check (false);
create policy "no_client_writes_file_order_update"
  on public.file_order for update
  to authenticated
  using (false)
  with check (false);
create policy "no_client_writes_file_order_delete"
  on public.file_order for delete
  to authenticated
  using (false);
