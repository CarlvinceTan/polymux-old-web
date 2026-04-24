import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const shareId = getRouterParam(event, 'shareId')
  if (!shareId) {
    throw createError({ statusCode: 400, statusMessage: 'Share ID is required.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: share, error: fetchError } = await supabase
    .from('file_shares')
    .select('workspace_id')
    .eq('id', shareId)
    .single()

  if (fetchError || !share) {
    throw createError({ statusCode: 404, statusMessage: 'Share not found.' })
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', share.workspace_id)
    .eq('user_id', user.sub)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can unshare directories.' })
  }

  const { error: deleteError } = await supabase
    .from('file_shares')
    .delete()
    .eq('id', shareId)

  if (deleteError) {
    console.error('[shares] delete error', deleteError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to unshare directory.' })
  }

  return { ok: true as const }
})
