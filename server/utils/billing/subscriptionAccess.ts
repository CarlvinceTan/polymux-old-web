import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~~/app/types/database.types'
import type { SubscriptionStatus } from './subscriptionState'

// serverSupabaseServiceRole's ReturnType resolves its generic to `unknown`,
// leaving a `SupabaseClient<unknown, never, …>` that breaks typed .update()
// calls. Re-type against Database (same pattern as server/utils/oauth/driveTokens).
type AdminClient = SupabaseClient<Database>

// Subscription columns the management routes read. Kept in one place so the
// select list and the returned shape stay in sync.
const WORKSPACE_BILLING_COLUMNS
  = 'id, plan, stripe_customer_id, stripe_subscription_id, stripe_schedule_id, subscription_status, billing_period, current_period_end, cancel_at_period_end, scheduled_plan'

export interface WorkspaceBillingRow {
  id: string
  plan: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_schedule_id: string | null
  subscription_status: string | null
  billing_period: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  scheduled_plan: string | null
}

export interface WorkspaceBillingAccess {
  admin: AdminClient
  userId: string
  workspace: WorkspaceBillingRow
}

/**
 * Authn + authz gate for subscription management. Requires a logged-in user who
 * is an owner or admin of the workspace (same rule as checkout). Returns the
 * service-role client and the workspace's billing row. Throws 401/403/404/400
 * with the right status on failure.
 */
export async function requireWorkspaceBillingAccess(
  event: H3Event,
  workspaceId: string,
): Promise<WorkspaceBillingAccess> {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId is required.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: workspace, error: wsError } = await admin
    .from('workspaces')
    .select(WORKSPACE_BILLING_COLUMNS)
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
    throw createError({ statusCode: 403, statusMessage: 'Only workspace owners or admins can manage the plan.' })
  }

  return { admin, userId: user.sub, workspace: workspace as WorkspaceBillingRow }
}

/** Project a stored workspace billing row into the client status shape. */
export function statusFromRow(row: WorkspaceBillingRow): SubscriptionStatus {
  return {
    plan: row.plan,
    status: row.subscription_status,
    billingPeriod: row.billing_period,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    scheduledPlan: row.scheduled_plan,
    hasSubscription: Boolean(row.stripe_subscription_id),
  }
}
