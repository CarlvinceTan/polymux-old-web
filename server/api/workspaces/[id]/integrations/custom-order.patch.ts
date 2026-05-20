import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { isLayoutTargetSection } from '~~/server/utils/integrations/layoutSections'

// PATCH /api/workspaces/[id]/integrations/custom-order
//
// Persists the new order of custom-layout tabs within a workspace section.
// Body:
//   { section: 'integrations' | 'storage' | 'vault' | 'dashboard',
//     order: ['<workspace_integrations.id>', '<...>', ...] }
//
// Admin-gated (only owners/admins reorder shared workspace tabs). Each id in
// `order` must reference a row in this workspace whose metadata.kind ==
// 'layout' and metadata.target_section == section. Each row's
// metadata.tab_index is updated to its index in the array.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace ID is required.' })
  }

  const body = await readBody<{ section?: unknown, order?: unknown }>(event)
  const section = typeof body?.section === 'string' ? body.section : ''
  if (!isLayoutTargetSection(section)) {
    throw createError({ statusCode: 400, statusMessage: 'section must be a known target section.' })
  }
  if (!Array.isArray(body?.order) || !body.order.every(v => typeof v === 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'order must be an array of workspace_integration ids.' })
  }
  const order = body.order as string[]

  // Admin gate.
  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can reorder tabs.' })
  }

  // Fetch the rows we're about to update; verify each one is a layout in this
  // section. Service role for the merge because metadata is jsonb and we want
  // to set just the tab_index key without touching the rest.
  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: Array<{ id: string, metadata: Record<string, unknown> | null }> | null, error: { message: string } | null }>
      }
      update: (p: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
      }
    }
  }
  const fetchRes = await sb.from('workspace_integrations').select('id, metadata').eq('workspace_id', workspaceId)
  if (fetchRes.error) {
    console.error('[integrations] custom-order fetch failed', fetchRes.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load current tabs.' })
  }
  const rowsById = new Map<string, Record<string, unknown> | null>()
  for (const r of fetchRes.data ?? []) rowsById.set(r.id, r.metadata)

  for (const id of order) {
    const meta = rowsById.get(id)
    if (!meta || meta.kind !== 'layout' || meta.target_section !== section) {
      throw createError({ statusCode: 400, statusMessage: `Row ${id} is not a ${section} layout.` })
    }
  }

  // Apply updates one at a time. The list is bounded (handful of tabs per
  // workspace+section); a bulk RPC would be premature.
  for (let i = 0; i < order.length; i++) {
    const id = order[i]
    if (!id) continue
    const meta = rowsById.get(id) ?? {}
    const nextMeta = { ...meta, tab_index: i }
    const upd = await sb.from('workspace_integrations').update({ metadata: nextMeta }).eq('id', id)
    if (upd.error) {
      console.error('[integrations] custom-order update failed', upd.error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to persist new order.' })
    }
  }

  return { ok: true as const, count: order.length }
})
