import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient, availableAdminEnvs } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/criteria — judge evaluation criteria (env-switchable).
// Returns [] + table_missing:true if judge_criteria hasn't been migrated.
export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }
  const { data, error } = await sb
    .from('judge_criteria')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (error.code === '42P01') return { env, available_envs: availableAdminEnvs(), criteria: [], table_missing: true }
    console.error('[admin/criteria] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list criteria.' })
  }
  return { env, available_envs: availableAdminEnvs(), criteria: data ?? [], table_missing: false }
})
