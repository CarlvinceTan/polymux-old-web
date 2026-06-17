import type { BillingPeriod } from '~~/server/utils/billing/stripe'
import { useStripe, subscriptionPeriodEndISO, subscriptionPriceId } from '~~/server/utils/billing/stripe'
import { getStripePriceId, isDowngrade, periodFromStripePriceId } from '~~/server/utils/billing/pricing'
import { requireWorkspaceBillingAccess } from '~~/server/utils/billing/subscriptionAccess'
import type { SubscriptionStatus } from '~~/server/utils/billing/subscriptionState'
import { useServerPostHog } from '~~/server/utils/posthog'

// Schedule a paid→paid downgrade (e.g. Max→Pro) at period end via a Stripe
// subscription schedule. The current plan runs untouched until
// current_period_end, then the schedule's next phase switches the price to the
// lower plan and releases (the subscription continues on the new price).
const DOWNGRADE_TARGETS = new Set(['pro', 'max'])

export default defineEventHandler(async (event) => {
  const body = await readBody<{ workspaceId?: unknown, targetPlan?: unknown }>(event)
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const targetPlan = typeof body.targetPlan === 'string' ? body.targetPlan.trim().toLowerCase() : ''

  const { admin, userId, workspace } = await requireWorkspaceBillingAccess(event, workspaceId)

  if (!DOWNGRADE_TARGETS.has(targetPlan)) {
    // 'free' is handled by cancel-subscription; 'enterprise'/unknown are invalid.
    throw createError({ statusCode: 400, statusMessage: 'Invalid downgrade target. Use cancel to move to Free.' })
  }
  if (!isDowngrade(workspace.plan, targetPlan)) {
    throw createError({ statusCode: 400, statusMessage: 'Target plan is not a downgrade from the current plan.' })
  }

  const subId = workspace.stripe_subscription_id
  if (!subId) {
    throw createError({ statusCode: 400, statusMessage: 'No active subscription to downgrade.' })
  }
  if (workspace.cancel_at_period_end) {
    throw createError({ statusCode: 409, statusMessage: 'Subscription is scheduled to cancel; resume it before changing plans.' })
  }

  const stripe = useStripe()
  const sub = await stripe.subscriptions.retrieve(subId)

  const currentPriceId = subscriptionPriceId(sub)
  if (!currentPriceId) {
    throw createError({ statusCode: 500, statusMessage: 'Subscription has no active price.' })
  }
  // Keep the same billing interval (monthly/annual) when picking the target price.
  const period: BillingPeriod = periodFromStripePriceId(currentPriceId)
    ?? (workspace.billing_period as BillingPeriod | null)
    ?? 'monthly'
  const targetPriceId = getStripePriceId(targetPlan as 'pro' | 'max', period)
  if (!targetPriceId) {
    throw createError({ statusCode: 500, statusMessage: 'Price not configured for the target plan.' })
  }

  // Reuse an existing schedule (a prior pending downgrade being re-targeted),
  // otherwise create one anchored to the live subscription.
  const schedule = workspace.stripe_schedule_id
    ? await stripe.subscriptionSchedules.retrieve(workspace.stripe_schedule_id)
    : await stripe.subscriptionSchedules.create({ from_subscription: subId })

  const currentPhase = schedule.phases?.[0]
  if (!currentPhase) {
    throw createError({ statusCode: 500, statusMessage: 'Could not read the current billing phase.' })
  }

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        items: [{ price: currentPriceId, quantity: 1 }],
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
        metadata: { workspaceId },
      },
      {
        items: [{ price: targetPriceId, quantity: 1 }],
        metadata: { workspaceId, planKey: targetPlan },
      },
    ],
    metadata: { workspaceId, scheduledPlan: targetPlan },
  })

  const currentPeriodEnd = subscriptionPeriodEndISO(sub)

  // Optimistic mirror: plan stays current, scheduled_plan records the target.
  const { error } = await admin
    .from('workspaces')
    .update({
      scheduled_plan: targetPlan,
      stripe_schedule_id: schedule.id,
      cancel_at_period_end: false,
      current_period_end: currentPeriodEnd,
      subscription_status: sub.status,
      billing_period: period,
    })
    .eq('id', workspaceId)
  if (error) {
    console.error('[stripe/downgrade] Failed to persist scheduled downgrade', { workspaceId, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to record downgrade.' })
  }

  useServerPostHog().capture({
    distinctId: userId,
    event: 'subscription_downgrade_scheduled',
    properties: {
      workspace_id: workspaceId,
      from_plan: workspace.plan,
      to_plan: targetPlan,
      current_period_end: currentPeriodEnd,
    },
  })

  const status: SubscriptionStatus = {
    plan: workspace.plan,
    status: sub.status,
    billingPeriod: period,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    scheduledPlan: targetPlan,
    hasSubscription: true,
  }
  return status
})
