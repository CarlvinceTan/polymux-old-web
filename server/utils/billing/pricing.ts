import type { BillingPeriod, PlanKey } from './stripe'

export const PLAN_PRICES: Record<PlanKey, { monthly: number; annualPerMonth: number }> = {
  pro: { monthly: 29, annualPerMonth: 24 },
  max: { monthly: 79, annualPerMonth: 65 },
}

const STRIPE_PRICE_IDS: Record<string, string> = {
  pro_monthly: 'price_1TMN0UGacq7iVqJjmHtbF8YA',
  pro_annual: 'price_1TMN0UGacq7iVqJj11YP07aN',
  max_monthly: 'price_1TMN0UGacq7iVqJjbvm5grIo',
  max_annual: 'price_1TMN0UGacq7iVqJjgfBaU33w',
}

export function formatUsd(amount: number): string {
  return `$${amount}`
}

export function getStripePriceId(plan: PlanKey, period: BillingPeriod): string {
  return STRIPE_PRICE_IDS[`${plan}_${period}`] || ''
}
