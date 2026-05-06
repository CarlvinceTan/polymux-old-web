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

  const body = await readBody<{
    agreement?: unknown
    version?: unknown
    locale?: unknown
  }>(event)

  const agreement = typeof body.agreement === 'string' ? body.agreement.trim() : ''
  const version = typeof body.version === 'string' ? body.version.trim() : ''
  const locale = typeof body.locale === 'string' ? body.locale.trim().slice(0, 16) : null

  if (!ALLOWED_AGREEMENTS.has(agreement)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown agreement.' })
  }
  if (!VERSION_PATTERN.test(version)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid version.' })
  }

  // Trust proxy headers — we deploy behind Vercel/Cloudflare, which set the
  // real client IP in x-forwarded-for. The first entry is the client.
  const ipAddress = getRequestIP(event, { xForwardedFor: true }) ?? null
  const userAgent = getRequestHeader(event, 'user-agent')?.slice(0, 1024) ?? null

  const admin = serverSupabaseServiceRole(event)

  const { error } = await admin.from('agreement_acceptances').insert({
    user_id: user.sub,
    agreement,
    version,
    ip_address: ipAddress,
    user_agent: userAgent,
    locale,
  })

  if (error) {
    console.error('[agreements/accept] supabase error', { userId: user.sub, agreement, version, error })
    throw createError({ statusCode: 500, statusMessage: 'Failed to record agreement.' })
  }

  return { ok: true as const }
})
