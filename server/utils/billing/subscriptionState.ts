import type Stripe from 'stripe'
import { planFromStripePriceId, periodFromStripePriceId } from './pricing'
import { subscriptionPeriodEndISO, subscriptionPriceId } from './stripe'

// The slice of `workspaces` columns mirrored from a Stripe subscription. The
// webhook writes this on every customer.subscription.* event; the management
// routes write the equivalent shape optimistically so the UI updates without
// waiting for the webhook round-trip. Stripe stays the source of truth.
export interface SubscriptionPatch {
  plan?: string
  subscription_status: string
  billing_period: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_subscription_id: string
  stripe_customer_id: string | null
  stripe_schedule_id: string | null
  scheduled_plan: string | null
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * Build the workspace column patch for a live Stripe subscription.
 *
 * - `plan` is the subscription's *current* active plan (derived from its price).
 *   Omitted when the price isn't one of ours so we never clobber a manually set
 *   plan (e.g. enterprise).
 * - `scheduled_plan` is the lower paid plan a subscription schedule will switch
 *   to at period end (paid→paid downgrade); null when no downgrade is pending.
 * - `cancel_at_period_end` carries the "reverts to free at period end" intent.
 *
 * May call Stripe to resolve a schedule's upcoming phase, hence async.
 */
export async function buildSubscriptionPatch(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<SubscriptionPatch> {
  const priceId = subscriptionPriceId(sub)
  const plan = planFromStripePriceId(priceId)
  const period = periodFromStripePriceId(priceId)
  const scheduleId = idOf(sub.schedule)

  // A pending paid→paid downgrade lives on the attached subscription schedule:
  // the final phase carries the target (lower) price. Read it back so the UI
  // can say "switches to Pro on <date>".
  let scheduledPlan: string | null = null
  if (scheduleId && sub.status !== 'canceled') {
    try {
      const schedule = typeof sub.schedule === 'object' && sub.schedule
        ? sub.schedule
        : await stripe.subscriptionSchedules.retrieve(scheduleId)
      const phases = schedule.phases ?? []
      const nextPhase = phases[phases.length - 1]
      const nextPlan = planFromStripePriceId(idOf(nextPhase?.items?.[0]?.price))
      if (nextPlan && nextPlan !== plan) scheduledPlan = nextPlan
    }
    catch {
      // Schedule unreadable (released/deleted) — treat as no pending downgrade.
    }
  }

  const patch: SubscriptionPatch = {
    subscription_status: sub.status,
    billing_period: period,
    current_period_end: subscriptionPeriodEndISO(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    stripe_subscription_id: sub.id,
    stripe_customer_id: idOf(sub.customer),
    stripe_schedule_id: scheduledPlan ? scheduleId : null,
    scheduled_plan: scheduledPlan,
  }
  // Only grant the plan once payment has actually gone through. With the Payment
  // Element flow a subscription is created `incomplete` and only becomes
  // `active` after the first PaymentIntent succeeds — we must not upgrade the
  // workspace on the incomplete/past_due states.
  if (plan && (sub.status === 'active' || sub.status === 'trialing')) {
    patch.plan = plan
  }
  return patch
}

// Client-facing subscription shape returned by /api/stripe/subscription and the
// management routes. Camel-cased; never exposes raw Stripe ids.
export interface SubscriptionStatus {
  plan: string
  status: string | null
  billingPeriod: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  scheduledPlan: string | null
  hasSubscription: boolean
}

/** Project a freshly-built patch into the client status shape. */
export function statusFromPatch(patch: SubscriptionPatch, fallbackPlan: string): SubscriptionStatus {
  return {
    plan: patch.plan ?? fallbackPlan,
    status: patch.subscription_status ?? null,
    billingPeriod: patch.billing_period,
    currentPeriodEnd: patch.current_period_end,
    cancelAtPeriodEnd: patch.cancel_at_period_end,
    scheduledPlan: patch.scheduled_plan,
    hasSubscription: Boolean(patch.stripe_subscription_id),
  }
}

/** Columns to wipe when a subscription ends — workspace falls back to free. */
export const CLEARED_SUBSCRIPTION_PATCH = {
  plan: 'free',
  subscription_status: 'canceled',
  billing_period: null,
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_subscription_id: null,
  stripe_schedule_id: null,
  scheduled_plan: null,
} as const
