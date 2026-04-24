alter table public.messages
  add column agent_id text null;

create index if not exists messages_session_agent_idx
  on public.messages (session_id, agent_id, created_at);
