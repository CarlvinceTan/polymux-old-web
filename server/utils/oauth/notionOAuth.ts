// Notion OAuth helpers. Notion's flow uses HTTP Basic auth on the token
// endpoint (client_id:client_secret base64-encoded) and returns a bot token
// scoped to the workspace the installer chose. No refresh token; access_token
// is long-lived.

const AUTH_ENDPOINT = 'https://api.notion.com/v1/oauth/authorize'
const TOKEN_ENDPOINT = 'https://api.notion.com/v1/oauth/token'

export interface NotionCreds {
  clientId: string
  clientSecret: string
}

export function notionCreds(): NotionCreds {
  const cfg = useRuntimeConfig()
  if (!cfg.notionClientId || !cfg.notionClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NOTION_CLIENT_ID / NOTION_CLIENT_SECRET not configured on the server.',
    })
  }
  return { clientId: cfg.notionClientId as string, clientSecret: cfg.notionClientSecret as string }
}

export function notionRedirectUri(): string {
  const appUrl = useRuntimeConfig().public.appUrl
  return `${appUrl.replace(/\/+$/, '')}/api/integrations/notion/callback`
}

export function buildNotionAuthUrl(state: string): string {
  const { clientId } = notionCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: notionRedirectUri(),
    response_type: 'code',
    owner: 'user',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface NotionTokenResponse {
  access_token: string
  token_type: string
  bot_id: string
  workspace_name?: string | null
  workspace_icon?: string | null
  workspace_id: string
  owner?: {
    type: string
    user?: {
      id: string
      name?: string | null
      avatar_url?: string | null
      person?: { email?: string | null } | null
    } | null
  } | null
  duplicated_template_id?: string | null
}

export async function exchangeNotionAuthCode(code: string): Promise<NotionTokenResponse> {
  const { clientId, clientSecret } = notionCreds()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: notionRedirectUri(),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Notion token exchange failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as NotionTokenResponse
}
