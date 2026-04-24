import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const supabase = await serverSupabaseClient(event)

  // RLS on file_shares already enforces that the caller must be a member of shared_with_workspace_id.
  // Non-members simply get an empty array rather than a 403.
  const { data, error } = await supabase
    .from('file_shares')
    .select('workspace_id, file_path, permission_level, created_by, created_at')
    .eq('shared_with_workspace_id', workspaceId)

  if (error) {
    console.error('[shared-with-me] fetch error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list shared files.' })
  }

  return data ?? []
})
