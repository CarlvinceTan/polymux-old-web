import { serverSupabaseServiceRole } from '#supabase/server'
import { requirePolymuxSecret } from '~~/server/utils/internalAuth'
import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'
import { resolveWorkspaceId } from '~~/server/utils/workspaceFiles'
import { refreshAccessToken } from '~~/server/utils/googleOAuth'

// POST /api/internal/workspaces/[id]/filesystem/refresh-token?provider=google-drive
//
// Go calls this when an access token is near expiry. Nuxt uses the stored
// encrypted refresh_token to mint a new access token from the provider, writes
// the new ciphertext back, and returns the fresh access token + expires_at.
//
// If the provider refuses the refresh (user revoked, refresh token rotated
// and we lost it, etc.), returns `CONNECTION_BROKEN` so the agent surfaces
// a clean error instead of a generic 500.

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)

  const workspaceId = resolveWorkspaceId(event)
  const query = getQuery(event)
  const provider = typeof query.provider === 'string' ? query.provider : ''
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'provider query parameter is required.' })
  }
  if (provider !== 'google-drive') {
    throw createError({
      statusCode: 400,
      statusMessage: `Refresh for provider ${provider} is not implemented.`,
    })
  }

  const admin = serverSupabaseServiceRole(event)
  const { data: row, error: rowErr } = await admin
    .from('workspace_integrations')
    .select('id, refresh_token_enc')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle()
  if (rowErr) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load integration.' })
  }
  if (!row || !row.refresh_token_enc) {
    return { error: 'CONNECTION_BROKEN', detail: 'No refresh token on file.' }
  }

  let refreshed
  try {
    refreshed = await refreshAccessToken(decryptToken(row.refresh_token_enc))
  } catch (err) {
    console.warn('[internal/refresh-token] provider refused refresh', { workspace: workspaceId, err })
    return {
      error: 'CONNECTION_BROKEN',
      detail: (err as { statusMessage?: string })?.statusMessage ?? 'Refresh failed.',
    }
  }

  const expiresAt = new Date(
    Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000,
  ).toISOString()

  const update: Record<string, unknown> = {
    access_token_enc: encryptToken(refreshed.access_token),
    expires_at: expiresAt,
  }
  if (refreshed.refresh_token) {
    update.refresh_token_enc = encryptToken(refreshed.refresh_token)
  }

  const { error: updErr } = await admin
    .from('workspace_integrations')
    .update(update)
    .eq('id', row.id)
  if (updErr) {
    console.error('[internal/refresh-token] update failed', updErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to persist refreshed token.' })
  }

  return {
    access_token: refreshed.access_token,
    expires_at: expiresAt,
  }
})
