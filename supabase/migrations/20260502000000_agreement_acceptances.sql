-- Clickwrap audit log: every time a user clicks "I agree" on an in-product
-- agreement (beta terms, ToS, privacy policy, etc.), we append a row here
-- capturing the version of the document they saw, the IP they accepted from,
-- the user agent, and the timestamp. Rows are immutable from the client side;
-- inserts go through the server using the service-role client so the IP and
-- user agent come from the request, not from user-controlled fields.

create table if not exists public.agreement_acceptances (
  id           uuid         primary key default gen_random_uuid(),
  user_id      uuid         not null references auth.users(id) on delete cascade,
  agreement    text         not null,
  version      text         not null,
  accepted_at  timestamptz  not null default now(),
  ip_address   inet,
  user_agent   text,
  locale       text
);

create index if not exists idx_agreement_acceptances_user_agreement
  on public.agreement_acceptances (user_id, agreement, accepted_at desc);

alter table public.agreement_acceptances enable row level security;

-- Users can read their own acceptance history (e.g. "you agreed to vX on date Y").
drop policy if exists agreement_acceptances_select_own on public.agreement_acceptances;
create policy agreement_acceptances_select_own
  on public.agreement_acceptances
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies: writes happen exclusively through the
-- service-role client in the Nuxt server so the IP and user agent are
-- recorded from the request rather than supplied by the browser.
