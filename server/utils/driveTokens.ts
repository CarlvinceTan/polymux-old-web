import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'
import { refreshAccessToken } from '~~/server/utils/googleOAuth'

// Use a structural type to match what `serverSupabaseServiceRole(event)`
// returns (a fully-typed SupabaseClient<Database, ...>) without re-importing
// the generated Database type — keeps this util independent of the bindings
// generation cadence.
type AdminClient = ReturnType<typeof import('#supabase/server').serverSupabaseServiceRole>

// Decrypt + auto-refresh helper for the per-workspace Google Drive integration.
//
// Returns a usable access token. If the stored token is within REFRESH_BUFFER
// of expiry, refreshes it and writes the new ciphertext back. The same admin
// SupabaseClient is reused for read + update so the caller controls auth.
//
// Throws CONNECTION_BROKEN if the integration is missing or the refresh fails
// — callers (signed-URL minters, migration job) surface that to the user as a
// "reconnect Google Drive" banner.

const REFRESH_BUFFER_MS = 60 * 1000 // refresh if expiring within 60s

export interface DriveAccess {
  accessToken: string
  rootFolderId: string
  rootFolderName: string
  expiresAt: string
}

interface IntegrationRow {
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: string | null
  root_folder_id: string | null
  root_folder_name: string | null
}

export async function resolveDriveAccess(
  admin: AdminClient,
  workspaceId: string,
): Promise<DriveAccess> {
  // workspace_integrations isn't in the generated types yet — see callback.get.ts
  // for the same pattern. Cast through unknown to keep the runtime path clean.
  const { data, error } = await admin
    .from('workspace_integrations')
    .select('access_token_enc, refresh_token_enc, expires_at, root_folder_id, root_folder_name')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')
    .maybeSingle()

  if (error) {
    console.error('[driveTokens] read failed', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read Drive integration.' })
  }
  const row = data as unknown as IntegrationRow | null
  if (!row) {
    throw createError({
      statusCode: 409,
      statusMessage: 'CONNECTION_BROKEN: workspace is not connected to Google Drive.',
    })
  }
  if (!row.access_token_enc || !row.root_folder_id || !row.root_folder_name) {
    throw createError({
      statusCode: 409,
      statusMessage: 'CONNECTION_BROKEN: Drive connection is missing tokens or root folder.',
    })
  }

  const accessToken = decryptToken(row.access_token_enc)
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : 0

  if (expiresMs - Date.now() > REFRESH_BUFFER_MS) {
    return {
      accessToken,
      rootFolderId: row.root_folder_id,
      rootFolderName: row.root_folder_name,
      expiresAt: row.expires_at!,
    }
  }

  if (!row.refresh_token_enc) {
    throw createError({
      statusCode: 409,
      statusMessage: 'CONNECTION_BROKEN: Drive refresh token missing — reconnect required.',
    })
  }

  let refreshed
  try {
    refreshed = await refreshAccessToken(decryptToken(row.refresh_token_enc))
  } catch (err) {
    console.error('[driveTokens] refresh failed', err)
    throw createError({
      statusCode: 409,
      statusMessage: 'CONNECTION_BROKEN: Drive refresh failed — reconnect required.',
    })
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: updateErr } = await admin
    .from('workspace_integrations')
    .update({
      access_token_enc: encryptToken(refreshed.access_token),
      expires_at: newExpiresAt,
      // Google may rotate the refresh token; keep the new one if returned.
      ...(refreshed.refresh_token
        ? { refresh_token_enc: encryptToken(refreshed.refresh_token) }
        : {}),
    })
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')

  if (updateErr) {
    console.warn('[driveTokens] failed to persist refreshed token', updateErr)
  }

  return {
    accessToken: refreshed.access_token,
    rootFolderId: row.root_folder_id,
    rootFolderName: row.root_folder_name,
    expiresAt: newExpiresAt,
  }
}
