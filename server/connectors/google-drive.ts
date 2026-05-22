import {
  GOOGLE_DRIVE_SCOPES,
  buildGoogleAuthUrl,
  exchangeAuthCode,
  fetchUserInfo,
  refreshAccessToken,
  createDriveFolder,
} from '~~/server/utils/oauth/googleOAuth'
import { encryptToken } from '~~/server/utils/security/tokenCrypto'
import type { ConnectorHandler, ConnectorTokens } from './types'

export const googleDriveConnector: ConnectorHandler = {
  id: 'google-drive',
  scopes: {
    default: GOOGLE_DRIVE_SCOPES,
    rationale: 'Read and manage Polymux-created files in Google Drive.',
  },
  buildAuthUrl: state => buildGoogleAuthUrl(state, { provider: 'google-drive', scopes: GOOGLE_DRIVE_SCOPES }),
  exchangeCode: async (code) => {
    const t = await exchangeAuthCode(code, 'google-drive')
    return { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_in: t.expires_in, scope: t.scope, raw: t }
  },
  fetchIdentity: async ({ access_token }) => {
    const u = await fetchUserInfo(access_token)
    return { email: u.email ?? null, displayName: u.name ?? null, providerSubject: u.sub }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity, migrate }, admin) => {
    const { data: workspace, error: wsError } = await admin
      .from('workspaces')
      .select('name')
      .eq('id', workspace_id)
      .single()
    if (wsError || !workspace) {
      throw createError({ statusCode: 404, statusMessage: 'Workspace not found.' })
    }
    const folderName = `Polymux / ${(workspace as { name?: string }).name ?? 'workspace'}`
    const folder = await createDriveFolder(tokens.access_token, folderName)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null
    const scopes = (tokens.scope || GOOGLE_DRIVE_SCOPES.join(' ')).split(/\s+/).filter(Boolean)
    return {
      workspace_id,
      provider: 'google-drive',
      connected_by: user_id,
      account_email: identity.email,
      account_display_name: identity.displayName,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expires_at: expiresAt,
      root_folder_id: folder.id,
      root_folder_name: folder.name,
      metadata: { google_sub: identity.providerSubject ?? null, migrate_requested: !!migrate },
    }
  },
  refreshAccessToken: async (rt) => {
    const t = await refreshAccessToken(rt)
    return { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_in: t.expires_in, scope: t.scope, raw: t }
  },
}
