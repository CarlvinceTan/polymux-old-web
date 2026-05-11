-- mailing_list unsubscribe support
--
-- Adds per-row `unsubscribe_token` (no expiry, unique) that gets embedded in
-- the visible footer link AND the `List-Unsubscribe` header of every
-- newsletter send. Separate from `verification_token` because that one is
-- one-shot + expires; unsubscribe links must remain valid forever.
--
-- Adds `unsubscribed_at` for soft-delete / suppression-list semantics. We keep
-- the row rather than delete it so an accidental re-subscribe via auto-link
-- (after the user signs up again with the same email) can't quietly opt them
-- back in.
--
-- Senders must filter on:
--   WHERE is_verified = true AND unsubscribed_at IS NULL

alter table public.mailing_list
  add column if not exists unsubscribe_token text not null
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  add column if not exists unsubscribed_at timestamptz null;

create unique index if not exists idx_mailing_list_unsubscribe_token
  on public.mailing_list(unsubscribe_token);

create index if not exists idx_mailing_list_active
  on public.mailing_list(email)
  where is_verified = true and unsubscribed_at is null;
