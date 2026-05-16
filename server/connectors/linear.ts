import {
  LINEAR_SCOPES,
  buildLinearAuthUrl,
  exchangeLinearAuthCode,
  fetchLinearViewer,
} from '~~/server/utils/oauth/linearOAuth'
import { encryptToken } from '~~/server/utils/security/tokenCrypto'
import type { ConnectorHandler } from './types'

export const linearConnector: ConnectorHandler = {
  id: 'linear',
  scopes: {
    default: LINEAR_SCOPES,
    rationale: 'Manage issues, projects, and sprints in your Linear organization.',
  },
  buildAuthUrl: state => buildLinearAuthUrl(state),
  exchangeCode: async (code) => {
    const t = await exchangeLinearAuthCode(code)
    return { access_token: t.access_token, refresh_token: null, expires_in: t.expires_in, scope: t.scope, raw: t }
  },
  fetchIdentity: async ({ access_token }) => {
    const viewer = await fetchLinearViewer(access_token)
    return {
      email: viewer?.email ?? null,
      displayName: viewer?.displayName ?? viewer?.name ?? null,
      providerSubject: viewer?.id ?? null,
      raw: viewer ? { ...viewer } : {},
    }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity }) => {
    const viewer = (identity.raw ?? {}) as { id?: string, organization?: unknown }
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null
    const scopes = (tokens.scope || LINEAR_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    return {
      workspace_id,
      provider: 'linear',
      connected_by: user_id,
      account_email: identity.email,
      account_display_name: identity.displayName,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: expiresAt,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        linear_user_id: viewer.id ?? null,
        organization: viewer.organization ?? null,
      },
    }
  },
}
