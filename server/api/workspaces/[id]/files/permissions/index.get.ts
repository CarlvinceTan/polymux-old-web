import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// GET /api/workspaces/[id]/files/permissions?path=reports/Q1
// Admin-only. Returns the explicit grants at this exact path (not ancestors).
// Each row is { user_id|null, grant_level, created_by, updated_at }.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const path = normalizePath(getQuery(event).path)

  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can view permissions.' })
  }

  const { data, error } = await supabase
    .from('workspace_file_permissions')
    .select('workspace_id, path, user_id, grant_level, created_by, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('path', path)

  if (error) {
    console.error('[permissions] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load permissions.' })
  }

  return data ?? []
})
