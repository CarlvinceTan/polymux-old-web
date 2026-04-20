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

  const body = await readBody<{
    targetWorkspaceId?: unknown
    filePath?: unknown
    permissionLevel?: unknown
  }>(event)

  const targetWorkspaceId = typeof body.targetWorkspaceId === 'string' ? body.targetWorkspaceId : ''
  const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''
  const permissionLevel = body.permissionLevel === 'editor' ? 'editor' : 'viewer'

  if (!targetWorkspaceId || !filePath) {
    throw createError({ statusCode: 400, statusMessage: 'targetWorkspaceId and filePath are required.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can share directories.' })
  }

  if (targetWorkspaceId === workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot share with your own workspace.' })
  }

  const { data: targetMembership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', targetWorkspaceId)
    .eq('user_id', user.id)
    .single()

  if (!targetMembership) {
    throw createError({ statusCode: 403, statusMessage: 'You are not a member of the target workspace.' })
  }

  const { data, error } = await supabase
    .from('file_shares')
    .insert({
      workspace_id: workspaceId,
      shared_with_workspace_id: targetWorkspaceId,
      file_path: filePath,
      permission_level: permissionLevel,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This directory is already shared with that workspace.' })
    }
    console.error('[shares] insert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to share directory.' })
  }

  return data
})
