-- User-defined ordering for the SidePanel's workflow list.
--
-- Until now the list was sorted by workflows.updated_at desc, which means any
-- write to the row (workflow_versions insert via bump_workflow_on_version_insert,
-- UpdateSessionBrowserStates, UpdateSessionBrowserMode, rename, etc.) bubbled the
-- workflow to the top and constantly reshuffled the list around the user's back.
--
-- `position` replaces that with explicit ordering. Higher value = closer to the
-- top. New rows auto-assign max(position) + 1 in their workspace via the
-- BEFORE INSERT trigger below, so a freshly-created workflow always lands at
-- the top. Manual drag-and-drop in the SidePanel calls reorder_workflows() to
-- re-write positions atomically. Nothing else writes to this column.
--
-- numeric (not integer) so a future "insert between two siblings" path can
-- pick a midpoint without a global resequence — not used yet but cheap to
-- leave room for.

alter table public.workflows
  add column if not exists position numeric not null default 0;

-- Backfill: assign positions to existing rows in created_at order so the
-- newest workflow per workspace ends up with the highest position. Skip rows
-- that already have a non-zero position so re-running the migration is safe.
with ranked as (
  select id,
         row_number() over (partition by workspace_id order by created_at asc) as rn
  from public.workflows
  where position = 0
)
update public.workflows w
   set position = r.rn
  from ranked r
 where w.id = r.id;

create index if not exists idx_workflows_workspace_position
  on public.workflows(workspace_id, position desc);

-- BEFORE INSERT: when no explicit position is supplied (the column default 0
-- signals "auto"), assign max+1 for the workspace so the new row lands at
-- the top of the SidePanel. Explicit non-zero positions are kept verbatim so
-- the reorder RPC and any future restore tooling can set positions directly.
create or replace function public.assign_workflow_position()
returns trigger
language plpgsql
as $$
begin
  if new.position = 0 then
    new.position := coalesce(
      (select max(position) + 1 from public.workflows where workspace_id = new.workspace_id),
      1
    );
  end if;
  return new;
end;
$$;

drop trigger if exists workflows_assign_position on public.workflows;
create trigger workflows_assign_position
  before insert on public.workflows
  for each row execute function public.assign_workflow_position();

-- Atomic reorder for the SidePanel's drag-and-drop. The client sends the full
-- ordered list of ids it sees after a drop; positions are re-assigned so the
-- first id ends up with the highest position. Ids that don't belong to the
-- workspace (or have been deleted) are silently skipped, which keeps the call
-- idempotent against a stale client view.
create or replace function public.reorder_workflows(
  p_workspace_id uuid,
  p_ordered_ids  uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  i     int;
begin
  if p_workspace_id is null or p_ordered_ids is null then
    return;
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  total := array_length(p_ordered_ids, 1);
  if total is null or total = 0 then
    return;
  end if;

  for i in 1..total loop
    update public.workflows
       set position = (total - i + 1)
     where id = p_ordered_ids[i]
       and workspace_id = p_workspace_id;
  end loop;
end;
$$;

revoke all on function public.reorder_workflows(uuid, uuid[]) from public;
grant execute on function public.reorder_workflows(uuid, uuid[]) to authenticated;
