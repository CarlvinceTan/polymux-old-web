import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { isConnectorId } from '~~/server/connectors/registry'

// DELETE /api/workspaces/[id]/integrations/[provider]
//
// Admin-only. Disconnects/uninstalls an integration. Accepts both first-party
// connector slugs (validated via the in-tree connector registry) and
// third-party slugs (validated by looking up `integrations.slug` in the
// catalog). For OAuth connectors we still just delete the row — revocation
// against the upstream provider is a future enhancement.
//
// Note: Drive uses its own override at `google-drive/index.delete.ts`
// because the static `google-drive/` directory shadows this dynamic file
// for that one slug. Other connectors flow through here.

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
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is required.' })
  }

  // Validate the slug: either it's an in-tree first-party connector or it
  // exists in the catalog (third-party). Anything else is rejected so we
  // don't accept arbitrary delete targets.
  let knownThirdParty = false
  if (!isConnectorId(provider)) {
    const admin = serverSupabaseServiceRole(event)
    const sb = admin as unknown as {
      from: (t: string) => { select: (cols: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } }
    }
    const lookup = await sb.from('integrations').select('id').eq('slug', provider).maybeSingle()
    if (!lookup?.data) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
    }
    knownThirdParty = true
  }
  void knownThirdParty // (reserved for divergent uninstall flows later)

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
