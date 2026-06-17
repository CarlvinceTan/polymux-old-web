import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/judgments/[id]
//
// One judgment + its workflow + the workflow's chat messages (with feedback
// ratings merged in). Mirrors the console's getJudgement + adminGetWorkflow +
// adminListMessages, in the admin-selected environment.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const { data: judgment, error } = await sb.from('session_judgments').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[admin/judgments detail] load error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load judgment.' })
  }
  if (!judgment) throw createError({ statusCode: 404, statusMessage: 'Judgment not found.' })

  let workflow: Record<string, unknown> | null = null
  let messages: Array<Record<string, unknown>> = []
  let runs: Array<Record<string, unknown>> = []
  if (judgment.workflow_id) {
    const w = await sb.from('workflows').select('id, name, workspace_id, created_by, created_at, updated_at').eq('id', judgment.workflow_id).maybeSingle()
    workflow = w.data ?? null

    const m = await sb.from('messages').select('id, role, content, created_at, metadata').eq('workflow_id', judgment.workflow_id).order('created_at', { ascending: true })
    messages = m.data ?? []

    const fb = await sb.from('message_feedback').select('message_id, rating').eq('workflow_id', judgment.workflow_id)
    const ratingBy = new Map<string, string>()
    for (const r of fb.data ?? []) ratingBy.set(r.message_id, r.rating)
    for (const msg of messages) {
      const r = ratingBy.get(msg.id as string)
      if (r) msg.feedback = r
    }

    const rr = await sb.from('workflow_runs').select('id, status, started_at, finished_at, error').eq('workflow_id', judgment.workflow_id).order('started_at', { ascending: false }).limit(50)
    runs = rr.data ?? []
  }

  return { env, judgment, workflow, messages, runs }
})
