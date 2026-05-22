import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useServerPostHog } from '~~/server/utils/posthog'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    reason?: unknown
    detail?: unknown
  }>(event)

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const detail = typeof body.detail === 'string' ? body.detail.trim() : ''

  if (!reason) {
    throw createError({ statusCode: 400, statusMessage: 'A reason is required.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { error } = await admin.auth.admin.deleteUser(user.sub)

  if (error) {
    console.error('[account/delete] supabase error', { userId: user.sub, reason, detail, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete account. Please try again.' })
  }

  console.info('[account/delete] user deleted', { userId: user.sub, reason, detail })

  const sessionId = getHeader(event, 'x-posthog-session-id')
  const distinctId = getHeader(event, 'x-posthog-distinct-id')
  useServerPostHog().capture({
    distinctId: distinctId ?? user.sub,
    event: 'account_deleted',
    properties: {
      $session_id: sessionId,
      reason,
    },
  })

  return { ok: true as const }
})
