import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'

// GET /api/workspaces/[id]/integrations/by-id/[wiId]/layout
//
// Returns the rendered body + metadata for a custom-layout install. Used by
// the iframe page to fetch the HTML/CSS/JS the author wrote. Membership-gated
// — only members of the workspace can read.
//
// Resolution: workspace_integrations.id → provider (slug) → integrations.id →
// integration_layout_refs.body. We use the service role for the layout-refs
// lookup because the install row's RLS already gates membership, and the refs
// row may be private (visibility=private on the parent listing). Returning
// the body to a member of an installed workspace is correct: install is the
// proof of access.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  const wiId = getRouterParam(event, 'wiId')
  if (!workspaceId || !wiId) {
    throw createError({ statusCode: 400, statusMessage: 'workspace id and workspace_integration id are required.' })
  }

  // Membership check via user-scoped client so RLS applies.
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

  // Read the install row (under RLS).
  const { data: install, error: installError } = await supabase
    .from('workspace_integrations')
    .select('id, workspace_id, provider, metadata')
    .eq('id', wiId)
    .eq('workspace_id', workspaceId)
    .single()
  if (installError || !install) {
    throw createError({ statusCode: 404, statusMessage: 'Install not found.' })
  }
  const meta = (install.metadata ?? {}) as Record<string, unknown>
  if (meta.kind !== 'layout') {
    throw createError({ statusCode: 400, statusMessage: 'This install is not a layout.' })
  }

  // Resolve the layout body via service role (covers private listings).
  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
        }
      }
    }
  }
  const integ = await sb.from('integrations').select('id, name').eq('slug', install.provider as string).maybeSingle()
  const integRow = integ.data as { id: string, name: string } | null
  if (!integRow) {
    throw createError({ statusCode: 404, statusMessage: 'Layout listing missing.' })
  }
  const refRes = await sb.from('integration_layout_refs').select('body, target_section, updated_at').eq('integration_id', integRow.id).maybeSingle()
  const ref = refRes.data as { body: string, target_section: string, updated_at: string } | null
  if (!ref) {
    throw createError({ statusCode: 404, statusMessage: 'Layout body not found.' })
  }

  // Client caches per-install for a few seconds. Custom-layout edits are
  // re-publishes; a short cache is fine for snappier tab switches.
  setHeader(event, 'Cache-Control', 'private, max-age=10, stale-while-revalidate=60')

  return {
    workspace_integration_id: install.id,
    provider: install.provider,
    name: integRow.name,
    // tab_label always == catalog row's name. Kept in the response shape so
    // the frontend doesn't have to do a separate catalog lookup for the
    // iframe header title.
    tab_label: integRow.name,
    target_section: ref.target_section,
    body: ref.body,
    updated_at: ref.updated_at,
  }
})
