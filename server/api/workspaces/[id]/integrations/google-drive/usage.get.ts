import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { assertMembership, resolveWorkspaceId } from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { fetchDriveStorageQuota } from '~~/server/utils/googleOAuth'

// GET /api/workspaces/[id]/integrations/google-drive/usage
// Returns the connected Google account's overall storage quota (Drive + Gmail
// + Photos — that's what Google reports account-wide). When `limit` is null,
// the account has no quota cap and the caller should render the provider as
// unlimited rather than tracked.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)

  const admin = serverSupabaseServiceRole(event)
  const access = await resolveDriveAccess(admin, workspaceId)
  const quota = await fetchDriveStorageQuota(access.accessToken, workspaceId)

  return {
    ok: true as const,
    usage: quota.usage,
    limit: quota.limit,
    usageInDrive: quota.usageInDrive,
  }
})
