import { serverSupabaseServiceRole } from '#supabase/server'
import { requireOwner } from '~~/server/utils/security/requireMaintainer'

// DELETE /api/admin/maintainers/[id] — remove a maintainer (owner-gated).
// Only deletes the public.maintainers row — the underlying Polymux account is
// untouched. Guards: can't remove yourself; can't remove the last owner.

export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required.' })
  if (id === owner.userId) throw createError({ statusCode: 400, statusMessage: "You can't remove yourself." })

  const admin = serverSupabaseServiceRole(event) as unknown as { from: (t: string) => any }
  const { data: target } = await admin.from('maintainers').select('user_id, is_owner').eq('user_id', id).maybeSingle()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Maintainer not found.' })

  if (target.is_owner) {
    const { count } = await admin.from('maintainers').select('user_id', { count: 'exact', head: true }).eq('is_owner', true)
    if ((count ?? 0) <= 1) throw createError({ statusCode: 400, statusMessage: "Can't remove the last owner." })
  }

  const { error } = await admin.from('maintainers').delete().eq('user_id', id)
  if (error) {
    console.error('[admin/maintainers] delete error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove maintainer.' })
  }
  return { ok: true }
})
