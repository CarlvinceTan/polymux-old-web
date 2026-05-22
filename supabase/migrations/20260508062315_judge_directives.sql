-- Judge directives override row used by the console-side LLM judge runner
-- (server/utils/judge/directives.ts). The console embeds the default prompt
-- in code; this single-row table holds the maintainer-edited override. When
-- absent, the embedded default is used.
--
-- Single-row pattern (id constrained to 'current') so the upsert / delete
-- semantics in the console are trivial. Service-role only — no RLS policies
-- so anon and authenticated roles cannot see or modify the prompt.

create table if not exists public.judge_directives (
  id          text         primary key default 'current' check (id = 'current'),
  text        text         not null,
  updated_at  timestamptz  not null default now(),
  updated_by  uuid         references auth.users(id)
);

alter table public.judge_directives enable row level security;

-- No policies: service-role only. The console's /admin/directives routes
-- (server/routes/admin/directives/*) bypass RLS via the service key.
