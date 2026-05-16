// Linear OAuth helpers. Linear uses OAuth 2.0 with form-encoded token exchange
// and identifies the user via a small GraphQL `viewer` query against
// https://api.linear.app/graphql. Tokens are long-lived (10 years per Linear's
// docs) so we leave refresh_token_enc null.

const AUTH_ENDPOINT = 'https://linear.app/oauth/authorize'
const TOKEN_ENDPOINT = 'https://api.linear.app/oauth/token'
const GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql'

// `read` covers issues, projects, comments. `write` lets the agent create or
// update issues. Add `admin` later only if a flow needs it.
export const LINEAR_SCOPES = ['read', 'write']

export interface LinearCreds {
  clientId: string
  clientSecret: string
}

export function linearCreds(): LinearCreds {
  const cfg = useRuntimeConfig()
  if (!cfg.linearClientId || !cfg.linearClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET not configured on the server.',
    })
  }
  return { clientId: cfg.linearClientId as string, clientSecret: cfg.linearClientSecret as string }
}

export function linearRedirectUri(): string {
  const appUrl = useRuntimeConfig().public.appUrl
  return `${appUrl.replace(/\/+$/, '')}/api/integrations/linear/callback`
}

export function buildLinearAuthUrl(state: string): string {
  const { clientId } = linearCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: linearRedirectUri(),
    response_type: 'code',
    scope: LINEAR_SCOPES.join(','),
    state,
    prompt: 'consent',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface LinearTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

export async function exchangeLinearAuthCode(code: string): Promise<LinearTokenResponse> {
  const { clientId, clientSecret } = linearCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: linearRedirectUri(),
    grant_type: 'authorization_code',
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
      statusMessage: `Linear token exchange failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as LinearTokenResponse
}

export interface LinearViewer {
  id: string
  name?: string | null
  displayName?: string | null
  email?: string | null
  organization?: { id: string, name?: string | null, urlKey?: string | null } | null
}

// Single GraphQL request to identify the installer + their org, used to fill
// account_email / account_display_name / metadata on the row.
export async function fetchLinearViewer(accessToken: string): Promise<LinearViewer | null> {
  const query = `query { viewer { id name displayName email organization { id name urlKey } } }`
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: { viewer?: LinearViewer } }
  return json.data?.viewer ?? null
}
