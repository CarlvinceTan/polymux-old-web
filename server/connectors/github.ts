import {
  GITHUB_SCOPES,
  buildGitHubAuthUrl,
  exchangeGitHubAuthCode,
  fetchGitHubUser,
  fetchGitHubPrimaryEmail,
} from '~~/server/utils/githubOAuth'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import type { ConnectorHandler } from './types'

export const githubConnector: ConnectorHandler = {
  id: 'github',
  scopes: {
    default: GITHUB_SCOPES,
    rationale: 'Browse repositories, create issues, and review pull requests.',
  },
  buildAuthUrl: state => buildGitHubAuthUrl(state),
  exchangeCode: async (code) => {
    const t = await exchangeGitHubAuthCode(code)
    // GitHub tokens don't expire and there's no refresh token.
    return { access_token: t.access_token, refresh_token: null, expires_in: null, scope: t.scope, raw: t }
  },
  fetchIdentity: async ({ access_token }) => {
    const user = await fetchGitHubUser(access_token)
    const email = user.email ?? (await fetchGitHubPrimaryEmail(access_token))
    return {
      email,
      displayName: user.name ?? user.login ?? null,
      providerSubject: String(user.id),
      raw: { ...user },
    }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity }) => {
    const user = (identity.raw ?? {}) as { login?: string, id?: number, avatar_url?: string }
    const scopes = (tokens.scope || GITHUB_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    return {
      workspace_id,
      provider: 'github',
      connected_by: user_id,
      account_email: identity.email,
      account_display_name: identity.displayName,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: null,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        github_login: user.login ?? null,
        github_user_id: user.id ?? null,
        avatar_url: user.avatar_url ?? null,
      },
    }
  },
}
