import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

// DELETE /api/workspaces/[id]/integrations/google-drive
//
// Mirrors `[provider].delete.ts`, but lives inside the `google-drive/`
// directory so Nitro's file-system router resolves it instead of treating the
// static directory (which holds /migrate, /import, /usage) as shadowing the
// sibling dynamic delete handler. Without this file, DELETE on google-drive
// 404s with "Page not found" because the static segment wins resolution.

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

  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can manage integrations.' })
  }

  const { error } = await supabase
    .from('workspace_integrations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')

  if (error) {
    console.error('[integrations] google-drive delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to disconnect integration.' })
  }

  return { ok: true as const }
})
