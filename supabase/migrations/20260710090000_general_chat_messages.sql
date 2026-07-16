-- General-assistant message history.
--
-- `chats` stores the sidebar conversation list; this table stores the actual
-- UI-message turns for each conversation. It is intentionally separate from
-- `chat_messages`, which belongs to the future workspace Core/focus surface.

create table if not exists public.general_chat_messages (
  id          uuid        primary key default gen_random_uuid(),
  chat_id     uuid        not null references public.chats(id) on delete cascade,
  workspace_id uuid       not null references public.workspaces(id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant', 'system')),
  content     text        not null default '',
  parts       jsonb       not null default '[]',
  metadata    jsonb       not null default '{}',
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_general_chat_messages_chat_created
  on public.general_chat_messages(chat_id, created_at asc);
create index if not exists idx_general_chat_messages_workspace_created
  on public.general_chat_messages(workspace_id, created_at desc);

alter table public.general_chat_messages enable row level security;
drop policy if exists "workspace_members_read_general_chat_messages" on public.general_chat_messages;
create policy "workspace_members_read_general_chat_messages"
  on public.general_chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = general_chat_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );
