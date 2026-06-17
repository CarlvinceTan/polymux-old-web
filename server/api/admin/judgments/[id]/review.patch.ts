import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// PATCH /api/admin/judgments/[id]/review
// Body: { review_status: 'approved'|'failed'|'corrected', notes?, corrected_classifications? }
//
// Records a maintainer's verdict on a judgment (sticky — the judge can't
// overwrite it). Mirrors the console's updateJudgementReview. reviewed_by is
// resolved to the reviewer's id in the *target* environment so the FK holds.

export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const body = await readBody<{ review_status?: string, notes?: string, corrected_classifications?: unknown }>(event)
  const status = body?.review_status ?? ''
  if (!['approved', 'failed', 'corrected'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'review_status must be approved|failed|corrected.' })
  }

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }
  const reviewerId = await envMaintainerId(client, m.email)

  const patch: Record<string, unknown> = {
    review_status: status,
    reviewed_by: reviewerId,
    reviewed_by_email: m.email || null,
    reviewed_by_judge: false,
    reviewed_at: new Date().toISOString(),
  }
  if (typeof body?.notes === 'string' && body.notes.trim()) patch.review_notes = body.notes.trim()
  if (body?.corrected_classifications != null) patch.corrected_classifications = body.corrected_classifications

  const { data, error } = await sb.from('session_judgments').update(patch).eq('id', id).select().single()
  if (error || !data) {
    console.error('[admin/judgments review] update error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record review.' })
  }
  return { env, judgment: data }
})
