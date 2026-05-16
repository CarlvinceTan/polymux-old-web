import {
  buildNotionAuthUrl,
  exchangeNotionAuthCode,
  type NotionTokenResponse,
} from '~~/server/utils/oauth/notionOAuth'
import { encryptToken } from '~~/server/utils/security/tokenCrypto'
import type { ConnectorHandler } from './types'

export const notionConnector: ConnectorHandler = {
  id: 'notion',
  scopes: {
    default: [],
    rationale: 'Read and write Notion pages, databases, and blocks in the workspace you select.',
  },
  buildAuthUrl: state => buildNotionAuthUrl(state),
  exchangeCode: async (code) => {
    const t = await exchangeNotionAuthCode(code)
    // Notion bot tokens are long-lived and don't refresh. We carry the full
    // response so buildIntegrationRow can pick up workspace_id / bot_id /
    // owner without an extra round trip.
    return {
      access_token: t.access_token,
      refresh_token: null,
      expires_in: null,
      scope: null,
      raw: t,
    }
  },
  fetchIdentity: async ({ raw }) => {
    const r = raw as NotionTokenResponse
    return {
      email: r.owner?.user?.person?.email ?? null,
      displayName: r.owner?.user?.name ?? r.workspace_name ?? null,
      providerSubject: r.owner?.user?.id ?? null,
    }
  },
  buildIntegrationRow: async ({ workspace_id, user_id, tokens, identity }) => {
    const r = tokens.raw as NotionTokenResponse
    return {
      workspace_id,
      provider: 'notion',
      connected_by: user_id,
      account_email: identity.email,
      account_display_name: identity.displayName,
      scopes: [],
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: null,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        bot_id: r.bot_id,
        notion_workspace_id: r.workspace_id,
        notion_workspace_name: r.workspace_name,
        notion_workspace_icon: r.workspace_icon,
        owner_user_id: r.owner?.user?.id ?? null,
      },
    }
  },
}
