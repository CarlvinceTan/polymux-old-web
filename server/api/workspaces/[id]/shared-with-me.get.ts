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

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'You are not a member of this workspace.' })
  }

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
