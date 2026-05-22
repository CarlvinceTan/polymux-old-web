import { serverSupabaseServiceRole } from '#supabase/server'
import { serverSupabaseUser } from '#supabase/server'
import { useStripe } from '~~/server/utils/billing/stripe'
import { walletEnabled } from '~~/server/utils/billing/walletEnabled'
import { useServerPostHog } from '~~/server/utils/posthog'

export default defineEventHandler(async (event) => {
  if (!walletEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Wallet feature is not enabled.' })
  }

  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    workspaceId?: unknown
    amountCents?: unknown
  }>(event)

  const workspaceId = body.workspaceId as string | undefined
  const amountCents = body.amountCents as number | undefined

  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspace_id is required.' })
  }

  const MIN_AMOUNT = 100
  const MAX_AMOUNT = 100_000
  if (
    typeof amountCents !== 'number'
    || !Number.isInteger(amountCents)
    || amountCents < MIN_AMOUNT
    || amountCents > MAX_AMOUNT
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid amount. Must be an integer between ${MIN_AMOUNT} and ${MAX_AMOUNT} cents.`,
    })
  }

  const stripe = useStripe()
  const origin = getRequestURL(event).origin

  const admin = serverSupabaseServiceRole(event)

  const { data: wallet, error: walletError } = await admin
    .from('wallets')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  if (walletError || !wallet) {
    throw createError({ statusCode: 404, statusMessage: 'Wallet not found.' })
  }

  const { data: memberCheck } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()

  if (!memberCheck || !['owner', 'admin'].includes(memberCheck.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only workspace owners or admins can top up.' })
  }

  const displayAmount = `$${(amountCents / 100).toFixed(2)}`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Polymux Credits — ${displayAmount}`,
          description: `${displayAmount} credit top-up for your Polymux workspace.`,
        },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    adaptive_pricing: { enabled: true },
    metadata: {
      userId: user.sub,
      workspaceId,
      walletId: wallet.id,
      amountCents: String(amountCents),
      type: 'wallet_top_up',
    },
    success_url: `${origin}/vault/wallet?top_up=success`,
    cancel_url: `${origin}/vault/wallet?top_up=cancelled`,
  })

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create checkout session.' })
  }

  const sessionId = getHeader(event, 'x-posthog-session-id')
  const distinctId = getHeader(event, 'x-posthog-distinct-id')
  const posthog = useServerPostHog()
  posthog.capture({
    distinctId: distinctId ?? user.sub,
    event: 'wallet_top_up_checkout_started',
    properties: {
      $session_id: sessionId,
      amount_cents: amountCents,
      workspace_id: workspaceId,
    },
  })

  return { url: session.url }
})
