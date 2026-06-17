import { requireWorkspaceBillingAccess, statusFromRow } from '~~/server/utils/billing/subscriptionAccess'

// Returns the workspace's current subscription status for the management UI.
// Reads the mirrored columns (kept fresh by the webhook + management routes) so
// this stays a single cheap DB read with no Stripe round-trip.
export default defineEventHandler(async (event) => {
  const workspaceId = typeof getQuery(event).workspaceId === 'string'
    ? (getQuery(event).workspaceId as string).trim()
    : ''

  const { workspace } = await requireWorkspaceBillingAccess(event, workspaceId)
  return statusFromRow(workspace)
})
