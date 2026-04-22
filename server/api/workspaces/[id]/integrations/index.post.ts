import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { isKnownProvider, isOAuthProvider } from '~~/server/utils/integrationRegistry'

// POST /api/workspaces/[id]/integrations
// Admin-only. Installs a non-OAuth integration (plugin, workflow) into the
// workspace inline. OAuth providers (connections) must go through the
// /api/integrations/[provider]/connect redirect instead — this route rejects
// them so the OAuth path is the only way tokens ever land in the DB.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<{ provider?: unknown }>(event)
  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''

  if (!provider || !isKnownProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
  }

  if (isOAuthProvider(provider)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'OAuth integrations must be connected via /api/integrations/[provider]/connect.',
    })
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

  const { data, error } = await supabase
    .from('workspace_integrations')
    .insert({
      workspace_id: workspaceId,
      provider,
      connected_by: user.sub,
    })
    .select('id, workspace_id, provider, connected_by, account_email, account_display_name, scopes, expires_at, root_folder_id, root_folder_name, metadata, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Integration already installed.' })
    }
    console.error('[integrations] insert error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to install integration.' })
  }

  return data
})
