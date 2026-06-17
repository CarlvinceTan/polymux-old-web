import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient, availableAdminEnvs } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/plugins?status=pending_review|approved|rejected|all
//
// Maintainer-gated review queue. Lists third-party catalog items in the
// admin-selected environment (dev/prod), with review_status + author. Defaults
// to the pending-review queue. First-party rows are excluded — they're already
// trusted and aren't reviewed here.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const q = getQuery(event)
  const status = typeof q.status === 'string' ? q.status : 'pending_review'

  let query = sb
    .from('integrations')
    .select('id, slug, name, description, kind, visibility, is_first_party, is_verified, review_status, review_notes, author_name, author_user_id, current_version_id, install_count, created_at, updated_at')
    .eq('is_first_party', false)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (status !== 'all') {
    query = query.eq('review_status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin/plugins] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list plugins.' })
  }

  return {
    env,
    available_envs: availableAdminEnvs(),
    status,
    plugins: data ?? [],
  }
})
