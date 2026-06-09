// Mints a one-time extension pairing code for the signed-in user by
// proxying to the Polymux Go server's POST /extension/pair endpoint.
//
// The browser-side auto-pair plugin calls this with the user's Supabase
// JWT in Authorization: Bearer <token>. We forward that header verbatim;
// the Go server's jwtAuthMiddleware verifies it and ties the issued code
// to the same user_id (sub claim).

interface PairResponse {
  code: string
  expires_at: string
  server_url: string
}

export default defineEventHandler(async (event): Promise<PairResponse> => {
  const auth = getHeader(event, 'authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token.' })
  }

  const cfg = useRuntimeConfig()
  const serverUrl = cfg.public.serverUrl
  if (!serverUrl) {
    throw createError({ statusCode: 500, statusMessage: 'Polymux server URL not configured.' })
  }

  try {
    return await $fetch<PairResponse>(`${serverUrl}/extension/pair`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
    })
  } catch (err: unknown) {
    const e = err as { statusCode?: number; data?: { error?: string }; message?: string }
    throw createError({
      statusCode: e.statusCode ?? 502,
      statusMessage: e.data?.error ?? e.message ?? 'Pairing failed.',
    })
  }
})
