import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

const ALLOWED_AGREEMENTS = new Set([
  'beta',
  'terms-of-service',
  'privacy-policy',
  'cookie-policy',
])

const VERSION_PATTERN = /^[a-z0-9._-]{1,64}$/i

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const query = getQuery(event)
  const agreement = typeof query.agreement === 'string' ? query.agreement.trim() : ''
  const version = typeof query.version === 'string' ? query.version.trim() : ''

  if (!ALLOWED_AGREEMENTS.has(agreement)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown agreement.' })
  }
  if (!VERSION_PATTERN.test(version)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid version.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data, error } = await admin
    .from('agreement_acceptances')
    .select('id')
    .eq('user_id', user.sub)
    .eq('agreement', agreement)
    .eq('version', version)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[agreements/status] supabase error', { userId: user.sub, agreement, version, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to check agreement status.' })
  }

  return { accepted: !!data }
})
