-- Stage-2 foundation: focuses, chat_messages, hindsight_memory.
--
-- These three tables underpin the Stage-2 "focus" model. A *focus* is a piece of
-- SHELVED memory scoped to a workspace — NOT associated with a workflow. It is a
-- named slice of conversational/working context that can be set aside (shelved)
-- and brought back later:
--   * closed_at IS NULL   → active / unshelved
--   * closed_at NOT NULL  → shelved
-- There are deliberately NO workflow columns on any of these tables.
--
-- chat_messages and hindsight_memory hang off a workspace and may optionally be
-- attached to a focus (focus_id NULL = workspace-level: a broadcast message, or
-- team-shared workspace-wide memory).
--
-- Security model for this stage:
--   * RLS is enabled on all three tables.
--   * Workspace MEMBERS may SELECT rows for their workspace (read-only).
--   * All WRITES are performed by the Go server using the service-role key, which
--     bypasses RLS. We intentionally add NO member INSERT/UPDATE/DELETE policies
--     in this stage — clients cannot write directly.
--
-- Additive and safe to apply once: every object uses an IF NOT EXISTS / guarded
-- form, and the policies are dropped-then-created so a re-run is a clean no-op.
-- These tables are not yet referenced by app code. Apply to dev first.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. focuses — named, shelvable slices of workspace memory.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.focuses (
  id                  uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  name                text        not null,
  hindsight_summary   text,
  context_start_index integer,
  context_end_index   integer,
  created_by          uuid        references auth.users(id) on delete set null,
  metadata            jsonb       not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- NULL = active / unshelved, non-NULL = shelved.
  closed_at           timestamptz,
  unique (workspace_id, name)
);
create index if not exists idx_focuses_workspace
  on public.focuses(workspace_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. chat_messages — per-workspace chat log, optionally scoped to a focus.
--    focus_id NULL = workspace-level broadcast (not tied to any focus).
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  focus_id     uuid        references public.focuses(id) on delete set null,
  role         text        not null check (role in ('user', 'agent', 'tool')),
  content      text,
  agent_id     text,
  tool_calls   jsonb,
  tool_result  jsonb,
  metadata     jsonb       not null default '{}',
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_chat_messages_workspace_focus
  on public.chat_messages(workspace_id, focus_id);
create index if not exists idx_chat_messages_workspace_created
  on public.chat_messages(workspace_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. hindsight_memory — distilled, team-shared memory per workspace, optionally
--    scoped to a focus. focus_id NULL = workspace-level SHARED memory.
-- ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.hindsight_memory (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  focus_id     uuid        references public.focuses(id) on delete set null,
  category     text        not null,
  summary      text        not null,
  sources      jsonb       not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_hindsight_memory_workspace
  on public.hindsight_memory(workspace_id);
create index if not exists idx_hindsight_memory_focus
  on public.hindsight_memory(focus_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. RLS — enable on all three; members may SELECT only. Writes go through the
--    service-role key (bypasses RLS); no member write policies in this stage.
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.focuses          enable row level security;
alter table public.chat_messages    enable row level security;
alter table public.hindsight_memory enable row level security;

drop policy if exists "workspace_members_read_focuses" on public.focuses;
create policy "workspace_members_read_focuses"
  on public.focuses for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = focuses.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_read_chat_messages" on public.chat_messages;
create policy "workspace_members_read_chat_messages"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = chat_messages.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_read_hindsight_memory" on public.hindsight_memory;
create policy "workspace_members_read_hindsight_memory"
  on public.hindsight_memory for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = hindsight_memory.workspace_id
        and wm.user_id = auth.uid()
    )
  );
