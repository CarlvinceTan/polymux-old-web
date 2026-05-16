import { PLAN_PRICES, formatPrice, isValidCurrency } from '~~/server/utils/billing/pricing'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const currencyParam = (query.currency as string | undefined)?.toLowerCase().trim() || 'usd'

  if (!isValidCurrency(currencyParam)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported currency.' })
  }

  const planPrices = PLAN_PRICES[currencyParam]

  // Pricing is global and changes rarely; safe to cache at the edge keyed on
  // the currency query param. SWR keeps responses snappy if the worker has to
  // revalidate after a price change.
  setHeader(event, 'Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  return {
    free: {
      monthly: formatPrice(0, currencyParam),
      annualPerMonth: formatPrice(0, currencyParam),
    },
    pro: {
      monthly: formatPrice(planPrices.pro.monthly, currencyParam),
      annualPerMonth: formatPrice(planPrices.pro.annualPerMonth, currencyParam),
    },
    max: {
      monthly: formatPrice(planPrices.max.monthly, currencyParam),
      annualPerMonth: formatPrice(planPrices.max.annualPerMonth, currencyParam),
    },
    enterprise: {
      monthly: 'Custom',
      annualPerMonth: 'Custom',
    },
  }
})
