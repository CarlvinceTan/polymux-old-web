import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * End of the current paid period. As of API version 2026-04-22 Stripe moved
 * `current_period_end` off the Subscription and onto each subscription item,
 * so we read it from the first item. Returns an ISO string for Postgres, or
 * null when the subscription has no items / period yet.
 */
export function subscriptionPeriodEndISO(sub: Stripe.Subscription): string | null {
  const epoch = sub.items?.data?.[0]?.current_period_end
  if (!epoch || !Number.isFinite(epoch)) return null
  return new Date(epoch * 1000).toISOString()
}

/** The active price id on the subscription's first item, or null. */
export function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null
}

export function useStripe(): Stripe {
  if (!_stripe) {
    const config = useRuntimeConfig()
    const key = config.stripeSecretKey as string
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    _stripe = new Stripe(key)
  }
  return _stripe
}

export type PlanKey = 'pro' | 'max'
export type BillingPeriod = 'monthly' | 'annual'

const VALID_PLANS: readonly string[] = ['pro', 'max']
const VALID_PERIODS: readonly string[] = ['monthly', 'annual']

export function isValidPlan(v: unknown): v is PlanKey {
  return typeof v === 'string' && VALID_PLANS.includes(v)
}

export function isValidPeriod(v: unknown): v is BillingPeriod {
  return typeof v === 'string' && VALID_PERIODS.includes(v)
}
