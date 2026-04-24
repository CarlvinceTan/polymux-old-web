// Slack OAuth v2 helpers. The flow yields a *bot token* (scoped to the workspace
// the user installed into), the team id/name, and the installer identity. We
// persist the bot token + team metadata; the installer's user identity goes
// into account_email/display_name for the connection card.
//
// Slack's bot tokens don't expire, so refresh_token_enc + expires_at stay null
// (matching the GitHub shape).

const AUTH_ENDPOINT = 'https://slack.com/oauth/v2/authorize'
const TOKEN_ENDPOINT = 'https://slack.com/api/oauth.v2.access'

// Bot scopes — wide enough to read channels + post messages + look up users.
// Tighten in a follow-up if specific agent flows need a smaller surface.
export const SLACK_BOT_SCOPES = [
  'channels:read',
  'channels:history',
  'chat:write',
  'users:read',
  'users:read.email',
  'team:read',
]

// User scopes are minimal — just enough to identify the installer.
export const SLACK_USER_SCOPES = ['identity.basic', 'identity.email']

export interface SlackCreds {
  clientId: string
  clientSecret: string
}

export function slackCreds(): SlackCreds {
  const cfg = useRuntimeConfig()
  if (!cfg.slackClientId || !cfg.slackClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not configured on the server.',
    })
  }
  return { clientId: cfg.slackClientId as string, clientSecret: cfg.slackClientSecret as string }
}

export function slackRedirectUri(): string {
  const appUrl = useRuntimeConfig().public.appUrl
  return `${appUrl.replace(/\/+$/, '')}/api/integrations/slack/callback`
}

export function buildSlackAuthUrl(state: string): string {
  const { clientId } = slackCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: slackRedirectUri(),
    scope: SLACK_BOT_SCOPES.join(','),
    user_scope: SLACK_USER_SCOPES.join(','),
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface SlackOAuthV2Response {
  ok: boolean
  error?: string
  app_id?: string
  access_token?: string
  token_type?: string
  scope?: string
  bot_user_id?: string
  team?: { id: string, name: string }
  enterprise?: { id: string, name: string } | null
  authed_user?: {
    id: string
    scope?: string
    access_token?: string
    token_type?: string
  }
}

export async function exchangeSlackAuthCode(code: string): Promise<SlackOAuthV2Response> {
  const { clientId, clientSecret } = slackCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: slackRedirectUri(),
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Slack token exchange failed: ${res.status} ${text}`.trim(),
    })
  }
  const json = (await res.json()) as SlackOAuthV2Response
  if (!json.ok || !json.access_token) {
    throw createError({
      statusCode: 502,
      statusMessage: `Slack token exchange error: ${json.error ?? 'no access_token returned'}`,
    })
  }
  return json
}

export interface SlackUserIdentity {
  user: { id: string, name?: string, email?: string }
  team: { id: string, name?: string }
}

// Calls users.identity using the user-scoped access token (separate from the
// bot token). Used to populate the installer's display name + email on the
// integration row.
export async function fetchSlackIdentity(userAccessToken: string): Promise<SlackUserIdentity | null> {
  const res = await fetch('https://slack.com/api/users.identity', {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { ok: boolean } & SlackUserIdentity
  return json.ok ? json : null
}
