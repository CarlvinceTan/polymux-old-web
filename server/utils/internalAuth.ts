import type { H3Event } from 'h3'

// Verify the Authorization header matches runtimeConfig.internalServiceToken.
//
// These routes are only callable by the Go backend, which holds the shared
// secret in its own config. Never accept requests without it — unlike the
// public file routes, these bypass user auth and return tokens/permissions.
//
// Use `crypto.timingSafeEqual` to prevent token-length side channels. We
// hash both sides to equal-length digests first; that also avoids the
// "buffer length mismatch" throw when the lengths differ.
export async function requireInternalToken(event: H3Event): Promise<void> {
  const expected = useRuntimeConfig().internalServiceToken
  if (!expected) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_SERVICE_TOKEN is not configured on the server.',
    })
  }

  const auth = getRequestHeader(event, 'authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  if (!m) {
    throw createError({ statusCode: 401, statusMessage: 'Missing internal service token.' })
  }
  const presented = m[1]!

  const { createHash, timingSafeEqual } = await import('node:crypto')
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(presented).digest()
  if (!timingSafeEqual(a, b)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid internal service token.' })
  }
}
