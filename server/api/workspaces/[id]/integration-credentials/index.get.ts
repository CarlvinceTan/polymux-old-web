import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'

// GET /api/workspaces/[id]/integration-credentials
//
// Lists a workspace's bring-your-own credential overrides — metadata + hint
// only, never the encrypted secret. Owner/admin gated. Mirrors the BYOK
// llm-keys metadata endpoint.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })

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

  // Service role for the read (after the membership gate above) so the embedded
  // integrations join isn't constrained by that table's RLS.
  const admin = serverSupabaseServiceRole(event) as unknown as { from: (t: string) => any }
  const { data, error } = await admin
    .from('workspace_integration_credentials')
    .select('id, integration_id, credential_key, credential_type, hint, created_at, updated_at, integrations(slug, name)')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('[ws integration-credentials] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list credentials.' })
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    integration_id: r.integration_id,
    integration_slug: r.integrations?.slug ?? null,
    integration_name: r.integrations?.name ?? null,
    credential_key: r.credential_key,
    credential_type: r.credential_type,
    hint: r.hint,
    updated_at: r.updated_at,
  }))
})
