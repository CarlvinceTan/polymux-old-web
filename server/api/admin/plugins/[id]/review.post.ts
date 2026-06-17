import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// POST /api/admin/plugins/[id]/review
// Body: { decision: 'approve' | 'reject' | 'changes', notes?: string }
//
// Maintainer-gated review decision. 'approve' clears the integration for the
// marketplace (review_status=approved, visibility=public, is_verified=true);
// 'reject' / 'changes' record the status + notes for the author. First-party
// rows are excluded — they're already trusted.

export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const body = await readBody<{ decision?: string, notes?: string }>(event)
  const decision = body?.decision ?? ''
  if (!['approve', 'reject', 'changes'].includes(decision)) {
    throw createError({ statusCode: 400, statusMessage: 'decision must be approve|reject|changes.' })
  }

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }
  const reviewerId = await envMaintainerId(client, m.email)

  const patch: Record<string, unknown> = {
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
  }
  if (decision === 'approve') {
    patch.review_status = 'approved'
    patch.visibility = 'public'
    patch.is_verified = true
  }
  else if (decision === 'reject') {
    patch.review_status = 'rejected'
  }
  else {
    patch.review_status = 'changes_requested'
  }

  const { data, error } = await sb
    .from('integrations')
    .update(patch)
    .eq('id', id)
    .eq('is_first_party', false)
    .select('id, slug, name, visibility, review_status, review_notes, is_verified, reviewed_at')
    .single()
  if (error || !data) {
    console.error('[admin/plugins review] update failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record review decision.' })
  }
  return { env, integration: data }
})
