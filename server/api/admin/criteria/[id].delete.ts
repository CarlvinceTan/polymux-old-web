import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient } from '~~/server/utils/admin/adminEnv'

// DELETE /api/admin/criteria/[id]
export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })

  const { client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }
  const { error } = await sb.from('judge_criteria').delete().eq('id', id)
  if (error) {
    if (error.code === '42P01') throw createError({ statusCode: 503, statusMessage: 'judge_criteria table is not migrated in this environment.' })
    console.error('[admin/criteria] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete criterion.' })
  }
  return { ok: true }
})
