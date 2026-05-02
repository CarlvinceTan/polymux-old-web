-- User-scoped notifications. Rows are written by SECURITY DEFINER triggers on
-- domain tables (currently public.sessions) so clients never INSERT directly —
-- no INSERT policy is defined, and the definer trigger bypasses RLS to fan out
-- a single domain event into one row per recipient.

create table if not exists public.user_notifications (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  type          text        not null,
  title         text        not null,
  description   text,
  metadata      jsonb       not null default '{}'::jsonb,
  read_at       timestamptz,
  dismissed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_user_notifications_active
  on public.user_notifications (user_id, created_at desc)
  where dismissed_at is null;
alter table public.user_notifications enable row level security;
create policy "user_notifications_select_own"
  on public.user_notifications for select
  using (user_id = auth.uid());
create policy "user_notifications_update_own"
  on public.user_notifications for update
  using (user_id = auth.uid());
create policy "user_notifications_delete_own"
  on public.user_notifications for delete
  using (user_id = auth.uid());
alter publication supabase_realtime add table public.user_notifications;
-- Fan out a session rename to every other workspace member.
create or replace function public.notify_session_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if new.title is distinct from old.title then
    insert into public.user_notifications (user_id, type, title, description, metadata)
    select wm.user_id,
           'workflow_edited',
           'Workflow updated',
           'Renamed to "' || new.title || '"',
           jsonb_build_object(
             'session_id',   new.id,
             'workspace_id', new.workspace_id,
             'actor_id',     v_actor_id,
             'new_title',    new.title,
             'old_title',    old.title
           )
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and (v_actor_id is null or wm.user_id <> v_actor_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_session_edit on public.sessions;
create trigger trg_notify_session_edit
  after update on public.sessions
  for each row execute function public.notify_session_edit();
