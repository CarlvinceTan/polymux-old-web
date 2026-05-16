import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { isValidProvider } from '~~/server/utils/billing/planLimits'

// DELETE /api/workspaces/[id]/llm-keys/[provider]
//
// Removes the BYOK key for the (workspace, provider) pair. After deletion
// the polymux server falls back to its own configured key for that provider
// for any subsequent Chat() calls in this workspace — the resolver cache
// is invalidated on the next miss.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  const provider = getRouterParam(event, 'provider')
  if (!workspaceId || !provider) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID and provider are required.' })
  }
  if (!isValidProvider(provider.toLowerCase())) {
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
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage LLM keys.' })
  }

  const { error } = await supabase
    .from('workspace_llm_keys')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', provider.toLowerCase())

  if (error) {
    console.error('[llm-keys] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete LLM key.' })
  }

  return { ok: true }
})
