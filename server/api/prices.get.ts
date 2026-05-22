import { PLAN_PRICES, formatUsd } from '~~/server/utils/billing/pricing'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  return {
    free: {
      monthly: formatUsd(0),
      annualPerMonth: formatUsd(0),
    },
    pro: {
      monthly: formatUsd(PLAN_PRICES.pro.monthly),
      annualPerMonth: formatUsd(PLAN_PRICES.pro.annualPerMonth),
    },
    max: {
      monthly: formatUsd(PLAN_PRICES.max.monthly),
      annualPerMonth: formatUsd(PLAN_PRICES.max.annualPerMonth),
    },
    enterprise: {
      monthly: 'Custom',
      annualPerMonth: 'Custom',
    },
  }
})
