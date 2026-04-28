import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

// POST /api/marketplace/integrations/[id]/yank
//
// Marks the integration's *current* version as yanked. Existing installs
// pinned to the yanked version will be marked `status='disabled'` by a
// later sweep job (out of scope for this MVP — for now the dispatcher
// already refuses to call disabled rows).
//
// Body: { reason?: string }

interface YankBody {
  reason?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  }

  const body = await readBody<YankBody>(event)
  const reason = typeof body?.reason === 'string' ? body.reason : null

  const admin = serverSupabaseServiceRole(event)
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } }
      update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
  }

  // Verify ownership.
  const owner = await sb.from('integrations').select('id, author_user_id, is_first_party, current_version_id').eq('id', id).single()
  if (owner.error || !owner.data) {
    throw createError({ statusCode: 404, statusMessage: 'Integration not found.' })
  }
  const o = owner.data as { author_user_id?: string | null, is_first_party?: boolean, current_version_id?: string | null }
  if (o.is_first_party) {
    throw createError({ statusCode: 403, statusMessage: 'First-party integrations cannot be yanked.' })
  }
  if (o.author_user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: "You don't own this integration." })
  }
  if (!o.current_version_id) {
    throw createError({ statusCode: 400, statusMessage: 'No current version to yank.' })
  }

  const upd = await sb.from('integration_versions').update({
    status: 'yanked',
    yanked_at: new Date().toISOString(),
    yank_reason: reason,
  }).eq('id', o.current_version_id)
  if (upd.error) {
    console.error('[marketplace yank] update failed', upd.error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to yank version.' })
  }
  return { ok: true as const, version_id: o.current_version_id }
})
