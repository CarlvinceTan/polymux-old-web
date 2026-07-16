-- General-assistant chats — standalone conversations with the workspace's
-- general ("Core") assistant, distinct from per-workflow orchestrator chats and
-- from focuses (shelved-memory contexts). Soft-archive via archived_at
-- (NULL = active). Messages are wired in a later stage; this stage is the chat
-- list + archive management surface.

create table if not exists public.chats (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  title           text        not null default '',
  created_by      uuid        references auth.users(id) on delete set null,
  metadata        jsonb       not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  last_message_at timestamptz
);

create index if not exists idx_chats_workspace_active
  on public.chats(workspace_id, archived_at);
create index if not exists idx_chats_workspace_recent
  on public.chats(workspace_id, last_message_at desc);

-- Keep updated_at fresh on any change (mirrors the workflows trigger pattern).
create or replace function public.touch_chats_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists chats_touch_updated_at on public.chats;
create trigger chats_touch_updated_at
  before update on public.chats
  for each row execute function public.touch_chats_updated_at();

-- RLS: members may SELECT; writes go through the service-role key (bypasses
-- RLS), matching the focuses/chat_messages stage.
alter table public.chats enable row level security;
drop policy if exists "workspace_members_read_chats" on public.chats;
create policy "workspace_members_read_chats"
  on public.chats for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = chats.workspace_id
        and wm.user_id = auth.uid()
    )
  );
