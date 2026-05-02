-- Governance invites: pre-signup invite lifecycle for the maintainer console's
-- Governance tab. Rows are written/read exclusively by the Go backend's
-- service-role client; no public RLS policies are defined so end-user
-- Supabase clients can never see them.
--
-- Status is computed from columns at read time:
--   accepted_at IS NOT NULL  → Registered
--   expires_at  <  now()     → Expired
--   else                     → Invited
--
-- Per-user feature overrides themselves live in PostHog (release-condition
-- email lists on each flag) — this table only tracks the invite delivery
-- lifecycle and the email→pending-user mapping the console UI needs.

create table if not exists public.governance_invites (
  email        text         primary key,
  token        text         not null unique,
  sent_by      uuid         references auth.users(id),
  sent_at      timestamptz  not null default now(),
  expires_at   timestamptz  not null default (now() + interval '7 days'),
  accepted_at  timestamptz
);

create index if not exists idx_governance_invites_expires_at
  on public.governance_invites (expires_at)
  where accepted_at is null;

alter table public.governance_invites enable row level security;

-- No policies: only the service role (Go backend) reads/writes this table.
-- The maintainer-only /admin/governance/* routes gate access on the Go side.
