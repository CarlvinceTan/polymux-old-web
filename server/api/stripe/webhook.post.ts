import type Stripe from 'stripe'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useStripe } from '~~/server/utils/billing/stripe'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const webhookSecret = config.stripeWebhookSecret as string
  if (!webhookSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Webhook secret not configured.' })
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing Stripe signature.' })
  }

  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty request body.' })
  }

  const stripe = useStripe()
  let stripeEvent: Stripe.Event

  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook signature.' })
  }

  const admin = serverSupabaseServiceRole(event)

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session
    const metadataType = session.metadata?.type

    if (metadataType === 'wallet_top_up') {
      const walletId = session.metadata?.walletId
      const amountCents = parseInt(session.metadata?.amountCents || '0', 10)
      const userId = session.metadata?.userId

      if (walletId && amountCents > 0) {
        const { data: wallet, error: walletError } = await admin
          .from('wallets')
          .select('id, balance_cents, workspace_id')
          .eq('id', walletId)
          .single()

        if (walletError || !wallet) {
          console.error('[stripe/webhook] Failed to find wallet for top-up', { walletId, error: walletError })
          return { received: true }
        }

        const newBalance = wallet.balance_cents + amountCents

        const { error: updateError } = await admin
          .from('wallets')
          .update({ balance_cents: newBalance })
          .eq('id', walletId)

        if (updateError) {
          console.error('[stripe/webhook] Failed to update wallet balance', { walletId, error: updateError })
          return { received: true }
        }

        const { error: txError } = await admin
          .from('transactions')
          .insert({
            wallet_id: walletId,
            type: 'top_up',
            amount_cents: amountCents,
            balance_after_cents: newBalance,
            description: 'Credit top-up via Stripe',
            metadata: { stripe_session_id: session.id, user_id: userId },
          })

        if (txError) {
          console.error('[stripe/webhook] Failed to create top-up transaction', { walletId, error: txError })
        } else {
          console.info('[stripe/webhook] Wallet top-up processed', { walletId, amountCents, userId })
        }
      }
    } else {
      const userId = session.metadata?.userId
      const planKey = session.metadata?.planKey
      const workspaceId = session.metadata?.workspaceId

      if (workspaceId && planKey) {
        const { error } = await admin
          .from('workspaces')
          .update({ plan: planKey })
          .eq('id', workspaceId)
        if (error) {
          console.error('[stripe/webhook] Failed to update workspace plan', { workspaceId, planKey, error })
        }
        else {
          console.info('[stripe/webhook] Workspace plan updated', { workspaceId, planKey, userId })
        }
      }
      else {
        console.warn('[stripe/webhook] checkout.session.completed missing workspaceId or planKey', { userId, workspaceId, planKey })
      }
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data.object as Stripe.Subscription
    const workspaceId = subscription.metadata?.workspaceId

    if (workspaceId) {
      const { error } = await admin
        .from('workspaces')
        .update({ plan: 'free' })
        .eq('id', workspaceId)
      if (error) {
        console.error('[stripe/webhook] Failed to reset workspace plan', { workspaceId, error })
      }
      else {
        console.info('[stripe/webhook] Workspace plan reset to free', { workspaceId })
      }
    }
  }

  return { received: true }
})
