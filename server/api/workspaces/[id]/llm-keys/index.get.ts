import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// GET /api/workspaces/[id]/llm-keys
//
// Lists the BYOK keys configured on this workspace. Projection is metadata
// only — provider, last_four, created/updated timestamps — never the
// ciphertext column. Members can read; the UI gates the Add/Delete buttons
// to owners/admins client-side via the workspace role from useWorkspaces.

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

  // The RLS policy on workspace_llm_keys restricts SELECT to owners/admins.
  // A regular member hitting this endpoint will see an empty list, which is
  // accurate: they can't see the keys, so there's nothing to render.
  const { data, error } = await supabase
    .from('workspace_llm_keys')
    .select('id, workspace_id, provider, api_base, last_four, created_by, created_at, updated_at, last_used_at')
    .eq('workspace_id', workspaceId)
    .order('provider', { ascending: true })

  if (error) {
    console.error('[llm-keys] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list LLM keys.' })
  }

  return data ?? []
})
