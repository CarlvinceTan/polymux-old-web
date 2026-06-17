import { useStripe } from '~~/server/utils/billing/stripe'
import { requireWorkspaceBillingAccess, statusFromRow } from '~~/server/utils/billing/subscriptionAccess'
import { buildSubscriptionPatch, statusFromPatch } from '~~/server/utils/billing/subscriptionState'
import { useServerPostHog } from '~~/server/utils/posthog'

// Undo a pending change — a scheduled cancellation or a scheduled paid→paid
// downgrade — so the workspace simply keeps its current plan.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId?: unknown }>(event)
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''

  const { admin, userId, workspace } = await requireWorkspaceBillingAccess(event, workspaceId)

  const subId = workspace.stripe_subscription_id
  if (!subId) {
    throw createError({ statusCode: 400, statusMessage: 'No active subscription.' })
  }

  const hasPending = workspace.cancel_at_period_end || Boolean(workspace.stripe_schedule_id)
  if (!hasPending) {
    // Nothing scheduled — return current status unchanged (idempotent).
    return statusFromRow(workspace)
  }

  const stripe = useStripe()

  if (workspace.cancel_at_period_end) {
    // Lift the cancellation flag; subscription continues as-is.
    const sub = await stripe.subscriptions.update(subId, { cancel_at_period_end: false })
    const patch = await buildSubscriptionPatch(stripe, sub)
    const { error } = await admin.from('workspaces').update(patch).eq('id', workspaceId)
    if (error) {
      console.error('[stripe/resume] Failed to clear cancellation', { workspaceId, error })
      throw createError({ statusCode: 500, statusMessage: 'Failed to resume subscription.' })
    }
    capture(userId, workspaceId, workspace.plan, 'cancel')
    return statusFromPatch(patch, workspace.plan)
  }

  // Pending paid→paid downgrade: release the schedule so the current price
  // persists, then reconcile from the (now schedule-free) subscription.
  try {
    await stripe.subscriptionSchedules.release(workspace.stripe_schedule_id!)
  }
  catch (e) {
    console.warn('[stripe/resume] Failed to release schedule', { scheduleId: workspace.stripe_schedule_id, error: e })
  }
  const sub = await stripe.subscriptions.retrieve(subId)
  const patch = await buildSubscriptionPatch(stripe, sub)
  const { error } = await admin.from('workspaces').update(patch).eq('id', workspaceId)
  if (error) {
    console.error('[stripe/resume] Failed to clear scheduled downgrade', { workspaceId, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to resume subscription.' })
  }
  capture(userId, workspaceId, workspace.plan, 'downgrade')
  return statusFromPatch(patch, workspace.plan)
})

function capture(userId: string, workspaceId: string, plan: string, undid: 'cancel' | 'downgrade') {
  useServerPostHog().capture({
    distinctId: userId,
    event: 'subscription_resumed',
    properties: { workspace_id: workspaceId, plan, undid },
  })
}
