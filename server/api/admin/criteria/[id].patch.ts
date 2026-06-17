import { requireMaintainer, envMaintainerId } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// PATCH /api/admin/criteria/[id] { label?, prompt?, position? }
export default defineEventHandler(async (event) => {
  const m = await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const body = await readBody<{ label?: unknown, prompt?: unknown, position?: unknown }>(event)
  const { client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const patch: Record<string, unknown> = { updated_by: await envMaintainerId(client, m.email) }
  if (body?.label !== undefined) {
    const l = String(body.label).trim()
    if (!l) throw createError({ statusCode: 400, statusMessage: 'label must not be empty.' })
    patch.label = l
  }
  if (body?.prompt !== undefined) {
    const p = String(body.prompt).trim()
    if (!p) throw createError({ statusCode: 400, statusMessage: 'prompt must not be empty.' })
    patch.prompt = p
  }
  if (body?.position !== undefined) {
    const n = Number(body.position)
    if (!Number.isFinite(n)) throw createError({ statusCode: 400, statusMessage: 'position must be a number.' })
    patch.position = n
  }

  const { data, error } = await sb.from('judge_criteria').update(patch).eq('id', id).select().single()
  if (error) {
    if (error.code === '42P01') throw createError({ statusCode: 503, statusMessage: 'judge_criteria table is not migrated in this environment.' })
    console.error('[admin/criteria] update error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update criterion.' })
  }
  return data
})
