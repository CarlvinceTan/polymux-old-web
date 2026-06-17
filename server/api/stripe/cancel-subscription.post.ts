import { useStripe } from '~~/server/utils/billing/stripe'
import { requireWorkspaceBillingAccess } from '~~/server/utils/billing/subscriptionAccess'
import { buildSubscriptionPatch, statusFromPatch } from '~~/server/utils/billing/subscriptionState'
import { useServerPostHog } from '~~/server/utils/posthog'

// Schedule cancellation at period end: the plan keeps working until
// current_period_end, then customer.subscription.deleted reverts it to free.
// Supersedes any pending paid→paid downgrade (its schedule is released first).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId?: unknown }>(event)
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''

  const { admin, userId, workspace } = await requireWorkspaceBillingAccess(event, workspaceId)

  const subId = workspace.stripe_subscription_id
  if (!subId) {
    throw createError({ statusCode: 400, statusMessage: 'No active subscription to cancel.' })
  }
  if (workspace.cancel_at_period_end) {
    throw createError({ statusCode: 409, statusMessage: 'Subscription is already scheduled to cancel.' })
  }

  const stripe = useStripe()

  // A cancel overrides a pending downgrade — drop the schedule so the price
  // doesn't change before the subscription ends.
  if (workspace.stripe_schedule_id) {
    try {
      await stripe.subscriptionSchedules.release(workspace.stripe_schedule_id)
    }
    catch (e) {
      console.warn('[stripe/cancel] Failed to release schedule before cancel', { scheduleId: workspace.stripe_schedule_id, error: e })
    }
  }

  const sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: true })
  const patch = await buildSubscriptionPatch(stripe, sub)

  const { error } = await admin.from('workspaces').update(patch).eq('id', workspaceId)
  if (error) {
    console.error('[stripe/cancel] Failed to persist cancellation', { workspaceId, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to record cancellation.' })
  }

  useServerPostHog().capture({
    distinctId: userId,
    event: 'subscription_cancel_scheduled',
    properties: {
      workspace_id: workspaceId,
      plan: workspace.plan,
      current_period_end: patch.current_period_end,
    },
  })

  return statusFromPatch(patch, workspace.plan)
})
