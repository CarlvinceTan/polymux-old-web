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
// When the deleted row's catalog kind is 'plugin', cascade: also delete every
// workspace_integrations row in this workspace whose installed_via_plugin_id
// matches the plugin's integrations.id. The child rows lose their FK back to
// the plugin shell once we delete the catalog reference, so we resolve the
// children BEFORE deleting the shell.
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

  // Resolve the catalog row up-front: first-party connector OR catalog slug.
  // Anything else is rejected.
  const admin = serverSupabaseServiceRole(event)
  const adminSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
          eq?: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
          }
        }
      }
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
  }
  let catalog: { id: string, kind: 'integration' | 'workflow' | 'plugin' } | null = null
  if (!isConnectorId(provider)) {
    const lookup = await adminSb.from('integrations').select('id, kind').eq('slug', provider).maybeSingle()
    catalog = (lookup?.data as { id: string, kind: 'integration' | 'workflow' | 'plugin' } | null) ?? null
    if (!catalog) {
      throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
    }
  }

  // Admin gate via the user-scoped client (RLS applies).
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

  // Plugin uninstall: cascade children first, then delete the shell. Use the
  // service-role client so we delete across the workspace consistently.
  if (catalog?.kind === 'plugin') {
    const childrenDel = await adminSb
      .from('workspace_integrations')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('installed_via_plugin_id', catalog.id)
    if (childrenDel.error) {
      console.error('[integrations] plugin children delete failed', childrenDel.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to uninstall plugin children.' })
    }
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

  // Audit the uninstall (best-effort). Skip for first-party connectors that
  // aren't in the catalog (shouldn't happen post-Phase-1, but defend against
  // a deleted seed row).
  if (catalog) {
    await adminSb.from('integration_install_events').insert({
      workspace_id: workspaceId,
      integration_id: catalog.id,
      event_type: 'uninstall',
      actor_user_id: user.sub,
      metadata: { slug: provider, kind: catalog.kind },
    })
  }

  return { ok: true as const }
})
