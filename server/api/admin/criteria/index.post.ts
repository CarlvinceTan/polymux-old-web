import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// POST /api/admin/criteria { label, prompt } — append a judge criterion.
export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const body = await readBody<{ label?: unknown, prompt?: unknown }>(event)
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!label) throw createError({ statusCode: 400, statusMessage: 'label is required.' })
  if (!prompt) throw createError({ statusCode: 400, statusMessage: 'prompt is required.' })

  const { client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const { data: tail, error: tailErr } = await sb.from('judge_criteria').select('position').order('position', { ascending: false }).limit(1)
  if (tailErr) {
    if (tailErr.code === '42P01') throw createError({ statusCode: 503, statusMessage: 'judge_criteria table is not migrated in this environment.' })
    throw createError({ statusCode: 500, statusMessage: 'Failed to read criteria.' })
  }
  const nextPos = ((tail?.[0]?.position as number | undefined) ?? -1) + 1
  const updatedBy = await envMaintainerId(client, m.email)

  const { data, error } = await sb.from('judge_criteria').insert({ label, prompt, position: nextPos, updated_by: updatedBy }).select().single()
  if (error) {
    if (error.code === '42P01') throw createError({ statusCode: 503, statusMessage: 'judge_criteria table is not migrated in this environment.' })
    console.error('[admin/criteria] create error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create criterion.' })
  }
  return data
})
