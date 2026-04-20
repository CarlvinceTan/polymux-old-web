import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    planKey?: unknown
    billingPeriod?: unknown
    currency?: unknown
  }>(event)

  const planKey = body.planKey as string | undefined
  const billingPeriod = body.billingPeriod as string | undefined
  const currencyRaw = ((body.currency as string) || 'usd').toLowerCase().trim()

  if (!isValidPlan(planKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan.' })
  }
  if (!isValidPeriod(billingPeriod)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid billing period.' })
  }

  const currency = isValidCurrency(currencyRaw) ? currencyRaw : 'usd'
  const priceId = getStripePriceId(currency, planKey, billingPeriod)
  if (!priceId) {
    throw createError({ statusCode: 500, statusMessage: 'Price not configured for this plan.' })
  }

  const stripe = useStripe()
  const origin = getRequestURL(event).origin

  const currentPlan = (user.app_metadata?.plan as string | undefined)
    || (user.user_metadata?.plan as string | undefined)
    || 'free'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      userId: user.id,
      planKey,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        planKey,
      },
    },
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/pricing?current=${currentPlan}`,
  })

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create checkout session.' })
  }

  return { url: session.url }
})
