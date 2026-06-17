import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useStripe, isValidPlan, isValidPeriod } from '~~/server/utils/billing/stripe'
import { getStripePriceId } from '~~/server/utils/billing/pricing'
import { useServerPostHog } from '~~/server/utils/posthog'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    planKey?: unknown
    billingPeriod?: unknown
    workspaceId?: unknown
  }>(event)

  const planKey = body.planKey as string | undefined
  const billingPeriod = body.billingPeriod as string | undefined
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''

  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required.' })
  }
  if (!isValidPlan(planKey)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan.' })
  }
  if (!isValidPeriod(billingPeriod)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid billing period.' })
  }

  const priceId = getStripePriceId(planKey, billingPeriod)
  if (!priceId) {
    throw createError({ statusCode: 500, statusMessage: 'Price not configured for this plan.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: workspace, error: wsError } = await admin
    .from('workspaces')
    .select('id, plan, stripe_customer_id')
    .eq('id', workspaceId)
    .single()
  if (wsError || !workspace) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found.' })
  }

  const { data: membership } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only workspace owners or admins can change the plan.' })
  }

  const stripe = useStripe()

  // Elements with Checkout Sessions (Stripe's recommended pattern, ui_mode
  // 'elements'): the Checkout Session owns the customer + subscription
  // lifecycle, so we just hand its client secret to the client's Payment
  // Element. The `checkout.session.completed` webhook grants the plan after a
  // successful payment — no manual incomplete-subscription handling needed.
  // Card-only keeps the Payment Element compact (Link's "save info / phone"
  // enrollment block would otherwise add height and force a scroll); add
  // wallets/'link' to `payment_method_types` to re-enable them.
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'elements',
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    // Reuse the workspace's customer when we have one, else create from email.
    ...(workspace.stripe_customer_id
      ? { customer: workspace.stripe_customer_id }
      : { customer_email: user.email }),
    metadata: {
      userId: user.sub,
      workspaceId,
      planKey,
    },
    subscription_data: {
      metadata: {
        userId: user.sub,
        workspaceId,
        planKey,
      },
    },
  })

  const clientSecret = session.client_secret
  if (!clientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to start payment.' })
  }

  const sessionId = getHeader(event, 'x-posthog-session-id')
  const distinctId = getHeader(event, 'x-posthog-distinct-id')
  const posthog = useServerPostHog()
  posthog.capture({
    distinctId: distinctId ?? user.sub,
    event: 'subscription_checkout_started',
    properties: {
      $session_id: sessionId,
      plan_key: planKey,
      billing_period: billingPeriod,
      workspace_id: workspaceId,
      current_plan: workspace.plan,
    },
  })

  return { clientSecret }
})
