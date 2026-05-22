import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  effectivePermission,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/permissions/preview
// Body: { path, user_id }
// Admin-only. Returns { effective: 'read' | 'write' | 'none' } — the result of
// effective_file_permission for that user at that path.

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
  const targetUserId = typeof body.user_id === 'string' ? body.user_id : ''
  if (!targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'user_id is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can preview permissions.' })
  }

  const effective = await effectivePermission(supabase, workspaceId, path, targetUserId)
  return { effective }
})
