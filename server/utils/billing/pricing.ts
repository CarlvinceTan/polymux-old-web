import type { BillingPeriod, PlanKey } from './stripe'

export const PLAN_PRICES: Record<PlanKey, { monthly: number; annualPerMonth: number }> = {
  pro: { monthly: 29, annualPerMonth: 24 },
  max: { monthly: 79, annualPerMonth: 65 },
}

// Prices live in the Polymux Stripe account (carlvince@polymux.com,
// acct_1TZAK4Ru7Vrw0hsZ) — the single account used by both dev (web/.env) and
// prod (Vercel). See server/utils/billing/stripe.ts for the key wiring.
const STRIPE_PRICE_IDS: Record<string, string> = {
  pro_monthly: 'price_1TiAbMRu7Vrw0hsZA2mTCl3O',
  pro_annual: 'price_1TiAbMRu7Vrw0hsZH6FdTG5L',
  max_monthly: 'price_1TiAbNRu7Vrw0hsZlgcpswPY',
  max_annual: 'price_1TiAbNRu7Vrw0hsZWY6f3Bro',
}

// Reverse of STRIPE_PRICE_IDS, built once so the webhook and management routes
// can map a live Stripe price back to {plan, period} when reconciling state.
const PRICE_ID_TO_PLAN_PERIOD: Record<string, { plan: PlanKey; period: BillingPeriod }> = Object.fromEntries(
  Object.entries(STRIPE_PRICE_IDS).map(([key, priceId]) => {
    const [plan, period] = key.split('_') as [PlanKey, BillingPeriod]
    return [priceId, { plan, period }]
  }),
)

// Plan tiers low→high. Mirrors PLAN_* maps in planLimits.ts and the client
// `planOrder`. Used to validate that a requested change is genuinely a
// downgrade (cancel/schedule), never an upgrade routed through the wrong path.
export const PLAN_ORDER: readonly string[] = ['free', 'pro', 'max', 'enterprise']

export function planRank(plan: string | null | undefined): number {
  return PLAN_ORDER.indexOf((plan ?? '').toLowerCase().trim())
}

/** True when `target` is a strictly lower tier than `current` (e.g. max→pro, pro→free). */
export function isDowngrade(current: string | null | undefined, target: string | null | undefined): boolean {
  const c = planRank(current)
  const t = planRank(target)
  return c >= 0 && t >= 0 && t < c
}

export function formatUsd(amount: number): string {
  return `$${amount}`
}

export function getStripePriceId(plan: PlanKey, period: BillingPeriod): string {
  return STRIPE_PRICE_IDS[`${plan}_${period}`] || ''
}

/** Map a Stripe price id back to a plan key, or null if unknown. */
export function planFromStripePriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null
  return PRICE_ID_TO_PLAN_PERIOD[priceId]?.plan ?? null
}

/** Map a Stripe price id back to a billing period, or null if unknown. */
export function periodFromStripePriceId(priceId: string | null | undefined): BillingPeriod | null {
  if (!priceId) return null
  return PRICE_ID_TO_PLAN_PERIOD[priceId]?.period ?? null
}
