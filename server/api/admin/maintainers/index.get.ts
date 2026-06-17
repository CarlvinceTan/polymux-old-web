import { serverSupabaseServiceRole } from '#supabase/server'
import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'

// GET /api/admin/maintainers — list maintainers (any maintainer may view).
export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const admin = serverSupabaseServiceRole(event) as unknown as { from: (t: string) => any }
  const { data, error } = await admin
    .from('maintainers')
    .select('user_id, email, is_owner, created_at')
    .order('is_owner', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[admin/maintainers] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list maintainers.' })
  }
  return data ?? []
})
