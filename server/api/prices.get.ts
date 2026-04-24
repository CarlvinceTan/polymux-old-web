export default defineEventHandler((event) => {
  const query = getQuery(event)
  const currencyParam = (query.currency as string | undefined)?.toLowerCase().trim() || 'usd'

  if (!isValidCurrency(currencyParam)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported currency.' })
  }

  const planPrices = PLAN_PRICES[currencyParam]

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
