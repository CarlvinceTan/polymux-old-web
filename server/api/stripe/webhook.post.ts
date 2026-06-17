import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import { useStripe } from '~~/server/utils/billing/stripe'
import { buildSubscriptionPatch, CLEARED_SUBSCRIPTION_PATCH } from '~~/server/utils/billing/subscriptionState'
import { useServerPostHog } from '~~/server/utils/posthog'

type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update']

// Stripe events this handler consumes — the endpoint MUST be subscribed to all
// of these or plan state silently drifts:
//   - checkout.session.completed       → activate plan / top up wallet
//   - customer.subscription.updated    → sync cancel/downgrade scheduling AND
//                                         apply a downgrade when its schedule
//                                         phase transitions at period end
//   - customer.subscription.deleted    → revert to free when the sub ends
// Local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
// (forwards all events by default). Prod: add a dashboard webhook endpoint at
// <deploy-url>/api/stripe/webhook enabling exactly the three events above, and
// put its signing secret in STRIPE_WEBHOOK_SECRET.
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
          useServerPostHog().capture({
            distinctId: userId ?? walletId,
            event: 'wallet_top_up_completed',
            properties: {
              wallet_id: walletId,
              amount_cents: amountCents,
              new_balance_cents: newBalance,
              workspace_id: wallet.workspace_id,
            },
          })
        }
      }
    } else {
      const userId = session.metadata?.userId
      const planKey = session.metadata?.planKey
      const workspaceId = session.metadata?.workspaceId

      if (workspaceId && planKey) {
        const newSubId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null

        // An upgrade goes through a fresh Checkout, creating a *new*
        // subscription. Cancel the workspace's prior subscription so the
        // customer isn't double-billed and we don't leave an orphan that
        // would later fire customer.subscription.deleted against us.
        const { data: priorWs } = await admin
          .from('workspaces')
          .select('stripe_subscription_id')
          .eq('id', workspaceId)
          .single()
        const priorSubId = priorWs?.stripe_subscription_id
        if (priorSubId && priorSubId !== newSubId) {
          try {
            await stripe.subscriptions.cancel(priorSubId)
          }
          catch (e) {
            console.warn('[stripe/webhook] Failed to cancel prior subscription', { priorSubId, error: e })
          }
        }

        // Mirror the full subscription so the management UI has period end,
        // status, and ids. Falls back to a plan-only update if the retrieve
        // fails for any reason.
        let patch: WorkspaceUpdate = { plan: planKey }
        if (newSubId) {
          try {
            const sub = await stripe.subscriptions.retrieve(newSubId)
            patch = await buildSubscriptionPatch(stripe, sub)
            if (!patch.plan) patch.plan = planKey
          }
          catch (e) {
            console.warn('[stripe/webhook] Failed to retrieve subscription for checkout', { newSubId, error: e })
          }
        }

        const { error } = await admin
          .from('workspaces')
          .update(patch)
          .eq('id', workspaceId)
        if (error) {
          console.error('[stripe/webhook] Failed to update workspace plan', { workspaceId, planKey, error })
        }
        else {
          console.info('[stripe/webhook] Workspace plan updated', { workspaceId, planKey, userId })
          useServerPostHog().capture({
            distinctId: userId ?? workspaceId,
            event: 'subscription_activated',
            properties: {
              plan_key: planKey,
              workspace_id: workspaceId,
            },
          })
        }
      }
      else {
        console.warn('[stripe/webhook] checkout.session.completed missing workspaceId or planKey', { userId, workspaceId, planKey })
      }
    }
  }

  // Fired on any subscription change: a scheduled cancel/downgrade being set or
  // cleared, and the actual phase transition when a downgrade takes effect. We
  // reconcile the workspace row from the live subscription every time so the DB
  // converges regardless of where the change originated (our routes, the Stripe
  // dashboard, or a schedule transition).
  if (stripeEvent.type === 'customer.subscription.updated') {
    const subscription = stripeEvent.data.object as Stripe.Subscription
    const workspaceId = await resolveWorkspaceId(admin, subscription)
    if (workspaceId) {
      const patch = await buildSubscriptionPatch(stripe, subscription)

      // When a freshly-paid subscription (Payment Element upgrade) supersedes a
      // different stored one, cancel the old to avoid double billing — the
      // equivalent of what checkout.session.completed did for hosted checkout.
      if (patch.plan && (subscription.status === 'active' || subscription.status === 'trialing')) {
        const { data: ws } = await admin
          .from('workspaces')
          .select('stripe_subscription_id')
          .eq('id', workspaceId)
          .single()
        const priorSubId = ws?.stripe_subscription_id
        if (priorSubId && priorSubId !== subscription.id) {
          try {
            await stripe.subscriptions.cancel(priorSubId)
            console.info('[stripe/webhook] Cancelled superseded subscription', { workspaceId, priorSubId, newSubId: subscription.id })
          }
          catch (e) {
            console.warn('[stripe/webhook] Failed to cancel superseded subscription', { priorSubId, error: e })
          }
        }
      }

      const { error } = await admin.from('workspaces').update(patch).eq('id', workspaceId)
      if (error) {
        console.error('[stripe/webhook] Failed to sync subscription update', { workspaceId, error })
      }
      else {
        console.info('[stripe/webhook] Subscription synced', {
          workspaceId,
          plan: patch.plan,
          cancelAtPeriodEnd: patch.cancel_at_period_end,
          scheduledPlan: patch.scheduled_plan,
        })
      }
    }
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data.object as Stripe.Subscription
    const workspaceId = await resolveWorkspaceId(admin, subscription)

    if (workspaceId) {
      // Ignore deletions of an orphaned/old subscription (e.g. the prior sub we
      // cancelled on upgrade) so they don't wipe the freshly active plan.
      const { data: ws } = await admin
        .from('workspaces')
        .select('stripe_subscription_id')
        .eq('id', workspaceId)
        .single()
      if (ws?.stripe_subscription_id && ws.stripe_subscription_id !== subscription.id) {
        console.info('[stripe/webhook] Ignoring deletion of orphaned subscription', { workspaceId, deleted: subscription.id })
        return { received: true }
      }

      const { error } = await admin
        .from('workspaces')
        .update({ ...CLEARED_SUBSCRIPTION_PATCH })
        .eq('id', workspaceId)
      if (error) {
        console.error('[stripe/webhook] Failed to reset workspace plan', { workspaceId, error })
      }
      else {
        console.info('[stripe/webhook] Workspace plan reset to free', { workspaceId })
        const userId = subscription.metadata?.userId
        useServerPostHog().capture({
          distinctId: userId ?? workspaceId,
          event: 'subscription_cancelled',
          properties: { workspace_id: workspaceId },
        })
      }
    }
  }

  return { received: true }
})

/**
 * Resolve the workspace a subscription belongs to: prefer the metadata we set
 * at checkout, fall back to matching the stored stripe_subscription_id.
 */
async function resolveWorkspaceId(
  admin: SupabaseClient<Database>,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = subscription.metadata?.workspaceId
  if (fromMeta) return fromMeta
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle()
  return data?.id ?? null
}
