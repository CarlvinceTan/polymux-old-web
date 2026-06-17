import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// DELETE /api/workspaces/[id]/integration-credentials?integration_id=...&credential_key=...
//
// Removes a workspace's BYO override for one integration credential (reverting
// to the Polymux-managed default, if any). Owner/admin gated.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })

  const q = getQuery(event)
  const integrationId = typeof q.integration_id === 'string' ? q.integration_id : ''
  const key = typeof q.credential_key === 'string' ? q.credential_key : ''
  if (!integrationId || !key) throw createError({ statusCode: 400, statusMessage: 'integration_id and credential_key query params are required.' })

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: mErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (mErr || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage credentials.' })
  }

  const sb = supabase as unknown as { from: (t: string) => any }
  const { error } = await sb
    .from('workspace_integration_credentials')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('integration_id', integrationId)
    .eq('credential_key', key)
  if (error) {
    console.error('[ws integration-credentials] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove credential.' })
  }
  return { ok: true }
})
