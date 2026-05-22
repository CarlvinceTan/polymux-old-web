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
    .select('id, plan')
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
  const origin = getRequestURL(event).origin

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    adaptive_pricing: { enabled: true },
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
    success_url: `${origin}/settings?checkout=success&workspaceId=${workspaceId}`,
    cancel_url: `${origin}/pricing?workspaceId=${workspaceId}&current=${workspace.plan ?? 'free'}`,
  })

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create checkout session.' })
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

  return { url: session.url }
})
