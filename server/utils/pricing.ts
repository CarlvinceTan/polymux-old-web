export type SupportedCurrency = 'usd' | 'eur' | 'gbp' | 'aud' | 'cad' | 'jpy' | 'brl' | 'krw'
export type PricingPlanKey = 'pro' | 'max'
export type PricingBillingPeriod = 'monthly' | 'annual'

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['usd', 'eur', 'gbp', 'aud', 'cad', 'jpy', 'brl', 'krw']

export const CURRENCY_CONFIG: Record<SupportedCurrency, {
  symbol: string
  label: string
  zeroDecimal: boolean
}> = {
  usd: { symbol: '$', label: 'USD ($)', zeroDecimal: false },
  eur: { symbol: '€', label: 'EUR (€)', zeroDecimal: false },
  gbp: { symbol: '£', label: 'GBP (£)', zeroDecimal: false },
  aud: { symbol: 'A$', label: 'AUD (A$)', zeroDecimal: false },
  cad: { symbol: 'C$', label: 'CAD (C$)', zeroDecimal: false },
  jpy: { symbol: '¥', label: 'JPY (¥)', zeroDecimal: true },
  brl: { symbol: 'R$', label: 'BRL (R$)', zeroDecimal: false },
  krw: { symbol: '₩', label: 'KRW (₩)', zeroDecimal: true },
}

/**
 * Price amounts per currency / plan / period.
 * Monthly amounts are the monthly charge.
 * Annual amounts are the per-month equivalent (displayed) — the actual yearly
 * charge sent to Stripe is monthly × 12.
 */
export const PLAN_PRICES: Record<SupportedCurrency, Record<PricingPlanKey, { monthly: number; annualPerMonth: number }>> = {
  usd: { pro: { monthly: 29, annualPerMonth: 24 }, max: { monthly: 79, annualPerMonth: 65 } },
  eur: { pro: { monthly: 27, annualPerMonth: 22 }, max: { monthly: 74, annualPerMonth: 61 } },
  gbp: { pro: { monthly: 23, annualPerMonth: 19 }, max: { monthly: 63, annualPerMonth: 52 } },
  aud: { pro: { monthly: 18, annualPerMonth: 15 }, max: { monthly: 58, annualPerMonth: 48 } },
  cad: { pro: { monthly: 39, annualPerMonth: 32 }, max: { monthly: 109, annualPerMonth: 89 } },
  jpy: { pro: { monthly: 4500, annualPerMonth: 3700 }, max: { monthly: 12000, annualPerMonth: 9900 } },
  brl: { pro: { monthly: 149, annualPerMonth: 124 }, max: { monthly: 399, annualPerMonth: 329 } },
  krw: { pro: { monthly: 39000, annualPerMonth: 32000 }, max: { monthly: 109000, annualPerMonth: 89000 } },
}

/**
 * Stripe Price IDs for each currency / plan / period.
 * Populated after creating Price objects in Stripe.
 * Key format: `${currency}_${plan}_${period}`
 */
export const STRIPE_PRICE_IDS: Record<string, string> = {
  // USD
  usd_pro_monthly: 'price_1TMN0UGacq7iVqJjmHtbF8YA',
  usd_pro_annual: 'price_1TMN0UGacq7iVqJj11YP07aN',
  usd_max_monthly: 'price_1TMN0UGacq7iVqJjbvm5grIo',
  usd_max_annual: 'price_1TMN0UGacq7iVqJjgfBaU33w',
  // EUR
  eur_pro_monthly: 'price_1TMNOmGacq7iVqJjPAfPbfhV',
  eur_pro_annual: 'price_1TMNOnGacq7iVqJjcuIUepra',
  eur_max_monthly: 'price_1TMNOoGacq7iVqJjmnLsf5EY',
  eur_max_annual: 'price_1TMNOpGacq7iVqJjWYCLZOrk',
  // GBP
  gbp_pro_monthly: 'price_1TMNOvGacq7iVqJjen3oGtCR',
  gbp_pro_annual: 'price_1TMNOwGacq7iVqJjq3NF1k7z',
  gbp_max_monthly: 'price_1TMNOxGacq7iVqJj3pEA7caX',
  gbp_max_annual: 'price_1TMNOyGacq7iVqJjTGk2ZGsk',
  // AUD
  aud_pro_monthly: 'price_1TMNlnGacq7iVqJj08fKATzL',
  aud_pro_annual: 'price_1TMNlnGacq7iVqJjnGkAT8KR',
  aud_max_monthly: 'price_1TMNlpGacq7iVqJjECekEB0B',
  aud_max_annual: 'price_1TMNlqGacq7iVqJjcSBDTQjM',
  // CAD
  cad_pro_monthly: 'price_1TMNPAGacq7iVqJjYsrcvAC8',
  cad_pro_annual: 'price_1TMNPCGacq7iVqJjN95GzfhK',
  cad_max_monthly: 'price_1TMNPCGacq7iVqJj2RN1yvyy',
  cad_max_annual: 'price_1TMNPDGacq7iVqJjd3CmBYuS',
  // JPY
  jpy_pro_monthly: 'price_1TMNPIGacq7iVqJj7OWrCN8N',
  jpy_pro_annual: 'price_1TMNPJGacq7iVqJjjJTVrAiM',
  jpy_max_monthly: 'price_1TMNPKGacq7iVqJjuD1GDDcz',
  jpy_max_annual: 'price_1TMNPMGacq7iVqJjbXZ2E44c',
  // BRL
  brl_pro_monthly: 'price_1TMNPRGacq7iVqJjhHidj24L',
  brl_pro_annual: 'price_1TMNPSGacq7iVqJj6HKsrbsa',
  brl_max_monthly: 'price_1TMNPTGacq7iVqJjYP62kP7o',
  brl_max_annual: 'price_1TMNPVGacq7iVqJjeMlZg6wZ',
  // KRW
  krw_pro_monthly: 'price_1TMNPaGacq7iVqJjiQfRCQqH',
  krw_pro_annual: 'price_1TMNPaGacq7iVqJjHKTtO1R6',
  krw_max_monthly: 'price_1TMNPbGacq7iVqJjH23oWFlU',
  krw_max_annual: 'price_1TMNPcGacq7iVqJjwKdxO7Mb',
}

export function formatPrice(amount: number, currency: SupportedCurrency): string {
  const cfg = CURRENCY_CONFIG[currency]
  if (cfg.zeroDecimal) {
    return `${cfg.symbol}${amount.toLocaleString('en-US')}`
  }
  return `${cfg.symbol}${amount}`
}

const COUNTRY_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  US: 'usd', UM: 'usd', PR: 'usd', GU: 'usd', VI: 'usd', AS: 'usd',
  GB: 'gbp', GG: 'gbp', JE: 'gbp', IM: 'gbp',
  AU: 'aud', NZ: 'aud', CX: 'aud', CC: 'aud', NF: 'aud',
  CA: 'cad',
  JP: 'jpy',
  BR: 'brl',
  KR: 'krw',
  AT: 'eur', BE: 'eur', CY: 'eur', EE: 'eur', FI: 'eur', FR: 'eur',
  DE: 'eur', GR: 'eur', IE: 'eur', IT: 'eur', LV: 'eur', LT: 'eur',
  LU: 'eur', MT: 'eur', NL: 'eur', PT: 'eur', SK: 'eur', SI: 'eur',
  ES: 'eur', HR: 'eur', AD: 'eur', MC: 'eur', SM: 'eur', VA: 'eur',
  ME: 'eur', XK: 'eur',
}

export function countryToCurrency(countryCode: string): SupportedCurrency {
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] || 'usd'
}

export function isValidCurrency(v: unknown): v is SupportedCurrency {
  return typeof v === 'string' && SUPPORTED_CURRENCIES.includes(v as SupportedCurrency)
}

export function getStripePriceId(
  currency: SupportedCurrency,
  plan: PricingPlanKey,
  period: PricingBillingPeriod,
): string {
  return STRIPE_PRICE_IDS[`${currency}_${plan}_${period}`] || ''
}
