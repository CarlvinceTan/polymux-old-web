import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { notifyPermissionsChanged } from '~~/server/utils/notifyAgent'
import {
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/permissions
// Body: { path, user_id|null, grant_level }
// Admin-only. Upserts a single grant row. For `user_id: null` (all-members),
// the partial unique index enforces at most one row per (workspace, path).

interface Body {
  path?: unknown
  user_id?: unknown
  grant_level?: unknown
}

const VALID_LEVELS = new Set(['read', 'write', 'none'])

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const path = normalizePath(body.path)
  const grantLevel = typeof body.grant_level === 'string' ? body.grant_level : ''
  const userId = body.user_id === null || body.user_id === undefined
    ? null
    : (typeof body.user_id === 'string' && body.user_id.length > 0 ? body.user_id : null)

  if (!VALID_LEVELS.has(grantLevel)) {
    throw createError({ statusCode: 400, statusMessage: 'grant_level must be read, write, or none.' })
  }

  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can change permissions.' })
  }

  if (userId === null) {
    // All-members row: enforced by partial unique index. Delete-then-insert
    // avoids NULL-is-not-distinct weirdness in postgres upsert.
    const { error: delError } = await supabase
      .from('workspace_file_permissions')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('path', path)
      .is('user_id', null)
    if (delError) {
      console.error('[permissions] delete all-members error', delError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
    }

    // user_id: null is the "all members" row (migration permits it via the
    // partial-unique index `idx_workspace_file_permissions_all_members`), but
    // the regenerated types mark `user_id` as non-nullable. Cast to bypass.
    const { data, error } = await supabase
      .from('workspace_file_permissions')
      .insert({
        workspace_id: workspaceId,
        path,
        user_id: null as unknown as string,
        grant_level: grantLevel,
        created_by: user.sub,
      })
      .select('workspace_id, path, user_id, grant_level, created_by, created_at, updated_at')
      .single()
    if (error) {
      console.error('[permissions] insert all-members error', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
    }
    void notifyPermissionsChanged(workspaceId)
    return data
  }

  // User-specific grant: primary key (workspace, path, user_id) allows upsert.
  const { data, error } = await supabase
    .from('workspace_file_permissions')
    .upsert({
      workspace_id: workspaceId,
      path,
      user_id: userId,
      grant_level: grantLevel,
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path,user_id' })
    .select('workspace_id, path, user_id, grant_level, created_by, created_at, updated_at')
    .single()

  if (error) {
    console.error('[permissions] upsert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update permissions.' })
  }
  void notifyPermissionsChanged(workspaceId)
  return data
})
