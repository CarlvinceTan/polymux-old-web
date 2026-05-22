-- Unify session_judgments review status under one short list:
--   approved | failed | corrected | NULL (unreviewed)
--
-- Either the judge run or a maintainer can set the status. Once a maintainer
-- has touched it, the judge stops overwriting (`reviewed_by_judge=false` +
-- `reviewed_by` set means the maintainer owns the verdict).
--
-- Migration:
--   1. Drop the old check constraint.
--   2. Map legacy values: 'rejected' → 'failed', 'pending' → NULL.
--   3. Re-add the new constraint.
--   4. Add `reviewed_by_judge` (bool) and `reviewed_by_email` (text). The
--      email is denormalised so the console can show "set by alice@…"
--      without joining auth.users from a service-role client.

alter table public.session_judgments
  drop constraint if exists session_judgments_review_status_check;

update public.session_judgments
set review_status = case review_status
  when 'rejected' then 'failed'
  when 'pending'  then null
  else review_status
end;

alter table public.session_judgments
  alter column review_status drop default;

alter table public.session_judgments
  add constraint session_judgments_review_status_check
  check (review_status is null or review_status in ('approved', 'failed', 'corrected'));

alter table public.session_judgments
  add column if not exists reviewed_by_judge boolean not null default false,
  add column if not exists reviewed_by_email text;
