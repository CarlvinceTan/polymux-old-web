-- Judge criteria: replaces the freeform `judge_directives` blob with a list
-- of evaluation points. Each row is one thing the judge model is asked to
-- evaluate per workflow; the model returns a verdict + answer for each.
--
-- The maintainer manages the list via the console's /admin/criteria routes
-- (server/routes/admin/criteria/*); the judge runner snapshots the list at
-- run time, builds the prompt around it, and persists per-criterion answers
-- inside session_judgments.classifications.
--
-- Service-role-only: no client RLS policies. Every read / write goes through
-- the console's service-role Supabase client.

create table if not exists public.judge_criteria (
  id          uuid         primary key default gen_random_uuid(),
  label       text         not null,
  prompt      text         not null,
  position    integer      not null default 0,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  updated_by  uuid         references auth.users(id)
);

create index if not exists judge_criteria_position_idx
  on public.judge_criteria (position, created_at);

alter table public.judge_criteria enable row level security;

create or replace function public.touch_judge_criteria_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists judge_criteria_touch_updated_at on public.judge_criteria;
create trigger judge_criteria_touch_updated_at
  before update on public.judge_criteria
  for each row execute function public.touch_judge_criteria_updated_at();
