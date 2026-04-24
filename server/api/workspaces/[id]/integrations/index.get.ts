import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// GET /api/workspaces/[id]/integrations
// Lists all integrations connected to the workspace. Projects only
// client-safe columns — encrypted token columns never leave the server.

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

  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()

  if (memberError || !membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }

  const { data, error } = await supabase
    .from('workspace_integrations')
    .select('id, workspace_id, provider, connected_by, account_email, account_display_name, scopes, expires_at, root_folder_id, root_folder_name, metadata, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[integrations] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load integrations.' })
  }

  return data ?? []
})
