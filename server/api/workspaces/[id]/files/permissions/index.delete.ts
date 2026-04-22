import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { notifyPermissionsChanged } from '~~/server/utils/notifyAgent'
import {
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// DELETE /api/workspaces/[id]/files/permissions
// Body: { path, user_id|null }
// Admin-only. Removes a single grant row. For user_id=null, matches the
// all-members row.

interface Body {
  path?: unknown
  user_id?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const path = normalizePath(body.path)
  const userId = body.user_id === null || body.user_id === undefined
    ? null
    : (typeof body.user_id === 'string' && body.user_id.length > 0 ? body.user_id : null)

  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can change permissions.' })
  }

  let query = supabase
    .from('workspace_file_permissions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('path', path)

  query = userId === null ? query.is('user_id', null) : query.eq('user_id', userId)

  const { error } = await query
  if (error) {
    console.error('[permissions] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove permission.' })
  }

  void notifyPermissionsChanged(workspaceId)
  return { ok: true as const }
})
