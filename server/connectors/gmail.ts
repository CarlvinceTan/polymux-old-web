import {
  GMAIL_SCOPES,
  buildGoogleAuthUrl,
  exchangeAuthCode,
  fetchUserInfo,
  refreshAccessToken,
} from '~~/server/utils/googleOAuth'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import type { ConnectorHandler } from './types'

export const gmailConnector: ConnectorHandler = {
  id: 'gmail',
  scopes: {
    default: GMAIL_SCOPES,
    rationale: 'Read, send, and label emails on the connected Gmail account.',
  },
  buildAuthUrl: state => buildGoogleAuthUrl(state, { provider: 'gmail', scopes: GMAIL_SCOPES }),
  exchangeCode: async (code) => {
    const t = await exchangeAuthCode(code, 'gmail')
    return { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_in: t.expires_in, scope: t.scope, raw: t }
  },
  fetchIdentity: async ({ access_token }) => {
    const u = await fetchUserInfo(access_token)
    return { email: u.email ?? null, displayName: u.name ?? null, providerSubject: u.sub }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity }) => {
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null
    const scopes = (tokens.scope || GMAIL_SCOPES.join(' ')).split(/\s+/).filter(Boolean)
    return {
      workspace_id,
      provider: 'gmail',
      connected_by: user_id,
      account_email: identity.email,
      account_display_name: identity.displayName,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expires_at: expiresAt,
      root_folder_id: null,
      root_folder_name: null,
      metadata: { google_sub: identity.providerSubject ?? null },
    }
  },
  refreshAccessToken: async (rt) => {
    const t = await refreshAccessToken(rt)
    return { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_in: t.expires_in, scope: t.scope, raw: t }
  },
}
