-- Workspace subscription state. Until now the only Stripe state mirrored into
-- Postgres was `workspaces.plan` (set by the checkout webhook, reset to 'free'
-- by customer.subscription.deleted). That gave us no way to:
--   * find the Stripe subscription to cancel/modify for a workspace,
--   * tell the user when their paid plan actually ends, or
--   * keep a plan running until period end while showing a "scheduled to
--     downgrade" state.
--
-- These columns mirror just enough of the Stripe subscription so the UI can
-- render a cancel/downgrade flow and so the webhook + management routes have a
-- handle on the live subscription. Stripe remains the source of truth; the
-- webhook (customer.subscription.updated / .deleted) reconciles these on every
-- change, and the management routes write optimistic values for instant UI.
--
-- No RLS policy is added: these columns are read by the server (service role)
-- via /api/stripe/subscription after an owner/admin membership check, never by
-- the browser directly. Adding columns is backward compatible — the Go
-- /workspaces endpoint selects an explicit column set and ignores the rest.

alter table public.workspaces
  -- Stripe customer that owns the subscription (kept after cancellation so a
  -- re-subscribe can reuse it).
  add column if not exists stripe_customer_id text,
  -- The active/most-recent Stripe subscription for this workspace.
  add column if not exists stripe_subscription_id text,
  -- Subscription schedule id, present only while a plan-to-plan downgrade is
  -- scheduled for period end (released on resume / once the phase transitions).
  add column if not exists stripe_schedule_id text,
  -- Raw Stripe subscription status: active, trialing, past_due, canceled, …
  add column if not exists subscription_status text,
  -- 'monthly' | 'annual', derived from the active price's recurring interval.
  add column if not exists billing_period text,
  -- End of the current paid period — the moment a scheduled cancel/downgrade
  -- takes effect. Sourced from subscription.items[0].current_period_end.
  add column if not exists current_period_end timestamptz,
  -- True when the subscription is set to cancel (→ free) at period end.
  add column if not exists cancel_at_period_end boolean not null default false,
  -- Target plan key when a paid→paid downgrade is scheduled at period end
  -- (e.g. 'pro' while on 'max'). Null when no downgrade is pending. A pending
  -- cancel is expressed by cancel_at_period_end (implicit target 'free').
  add column if not exists scheduled_plan text;

comment on column public.workspaces.cancel_at_period_end is
  'Subscription is set to cancel at current_period_end, after which plan reverts to free.';
comment on column public.workspaces.scheduled_plan is
  'Lower paid plan the subscription is scheduled to switch to at current_period_end (paid→paid downgrade). Null if none.';
