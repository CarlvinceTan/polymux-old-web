import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { adminServiceClient, availableAdminEnvs } from '~~/server/utils/admin/adminEnv'

// GET /api/admin/judgments?status=approved,failed,corrected,unreviewed&limit=100
//
// Lists session_judgments (LLM-judge results) for the review queue, in the
// admin-selected environment. Ported from the console's judgments list.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const { env, client } = adminServiceClient(event)
  const sb = client as unknown as { from: (t: string) => any }

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number.parseInt(String(q.limit ?? '100'), 10) || 100, 1), 500)
  const wanted = (typeof q.status === 'string' ? q.status : '').split(',').map(s => s.trim()).filter(Boolean)

  let query = sb
    .from('session_judgments')
    .select('id, workflow_id, judge_model, status, score, review_status, reviewed_by_email, reviewed_by_judge, reviewed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (wanted.length) {
    const wantsUnreviewed = wanted.includes('unreviewed')
    const concrete = wanted.filter(s => s !== 'unreviewed')
    if (wantsUnreviewed && concrete.length) query = query.or(`review_status.is.null,review_status.in.(${concrete.join(',')})`)
    else if (wantsUnreviewed) query = query.is('review_status', null)
    else if (concrete.length === 1) query = query.eq('review_status', concrete[0])
    else if (concrete.length > 1) query = query.in('review_status', concrete)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin/judgments] list error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list judgments.' })
  }
  return { env, available_envs: availableAdminEnvs(), judgments: data ?? [] }
})
