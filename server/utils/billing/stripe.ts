import Stripe from 'stripe'

let _stripe: Stripe | null = null

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
