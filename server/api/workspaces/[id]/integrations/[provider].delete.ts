import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { isKnownProvider } from '~~/server/utils/integrationRegistry'

// DELETE /api/workspaces/[id]/integrations/[provider]
// Admin-only. Disconnects / uninstalls the integration. For OAuth providers
// we also want to revoke tokens with the provider when possible — that lives
// in Phase F since we'd need provider-specific revoke calls. For Phase A this
// just removes the row; revoking the Polymux-side row is sufficient for any
// non-OAuth integration (workflow/plugin) and is the first step for OAuth too.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  const provider = getRouterParam(event, 'provider')

  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }
  if (!provider || !isKnownProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
  }

  const supabase = await serverSupabaseClient(event)

  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()

  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage integrations.' })
  }

  const { error } = await supabase
    .from('workspace_integrations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)

  if (error) {
    console.error('[integrations] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to disconnect integration.' })
  }

  return { ok: true as const }
})
