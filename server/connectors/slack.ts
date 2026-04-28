import {
  SLACK_BOT_SCOPES,
  buildSlackAuthUrl,
  exchangeSlackAuthCode,
  fetchSlackIdentity,
  type SlackOAuthV2Response,
} from '~~/server/utils/slackOAuth'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import type { ConnectorHandler } from './types'

export const slackConnector: ConnectorHandler = {
  id: 'slack',
  scopes: {
    default: SLACK_BOT_SCOPES,
    rationale: 'Send messages, read channel history, and look up users in your Slack workspace.',
  },
  buildAuthUrl: state => buildSlackAuthUrl(state),
  exchangeCode: async (code) => {
    const t = await exchangeSlackAuthCode(code)
    // Slack returns both a bot token (top-level) and a user token under
    // `authed_user.access_token`. We persist the bot token; the user token is
    // only used during the install to look up the installer's identity.
    return {
      access_token: t.access_token!,
      refresh_token: null,
      expires_in: null,
      scope: t.scope ?? null,
      raw: t,
    }
  },
  fetchIdentity: async ({ raw }) => {
    const r = raw as SlackOAuthV2Response
    let email: string | null = null
    let displayName: string | null = null
    if (r.authed_user?.access_token) {
      const identity = await fetchSlackIdentity(r.authed_user.access_token)
      email = identity?.user?.email ?? null
      displayName = identity?.user?.name ?? null
    }
    return {
      email,
      displayName: displayName ?? r.team?.name ?? null,
      providerSubject: r.authed_user?.id ?? null,
    }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity }) => {
    const r = tokens.raw as SlackOAuthV2Response
    const scopes = (tokens.scope || SLACK_BOT_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    return {
      workspace_id,
      provider: 'slack',
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
        team_id: r.team?.id,
        team_name: r.team?.name,
        bot_user_id: r.bot_user_id,
        app_id: r.app_id,
        authed_user_id: r.authed_user?.id,
        enterprise: r.enterprise ?? null,
      },
    }
  },
}
