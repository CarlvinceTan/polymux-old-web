// GitHub OAuth helpers for the workspace_integrations connect/callback routes.
//
// GitHub access tokens are long-lived (no refresh token), so we just persist
// access_token_enc and leave refresh_token_enc + expires_at null. The user
// rotates by re-connecting (same upsert path as Drive).

const AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize'
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'
const USER_ENDPOINT = 'https://api.github.com/user'
const USER_EMAILS_ENDPOINT = 'https://api.github.com/user/emails'

// `repo` covers private + public repository access; `read:user` and `user:email`
// fill in the account row. Wider scopes (admin:org, gist) are out of scope here.
export const GITHUB_SCOPES = ['repo', 'read:user', 'user:email']

export interface GitHubCreds {
  clientId: string
  clientSecret: string
}

export function githubCreds(): GitHubCreds {
  const cfg = useRuntimeConfig()
  if (!cfg.githubClientId || !cfg.githubClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not configured on the server.',
    })
  }
  return { clientId: cfg.githubClientId as string, clientSecret: cfg.githubClientSecret as string }
}

export function githubRedirectUri(): string {
  const appUrl = useRuntimeConfig().public.appUrl
  return `${appUrl.replace(/\/+$/, '')}/api/integrations/github/callback`
}

export function buildGitHubAuthUrl(state: string): string {
  const { clientId } = githubCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: githubRedirectUri(),
    scope: GITHUB_SCOPES.join(' '),
    state,
    allow_signup: 'true',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GitHubTokenResponse {
  access_token: string
  scope: string
  token_type: string
}

export async function exchangeGitHubAuthCode(code: string): Promise<GitHubTokenResponse> {
  const { clientId, clientSecret } = githubCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: githubRedirectUri(),
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `GitHub token exchange failed: ${res.status} ${text}`.trim(),
    })
  }
  const json = (await res.json()) as Partial<GitHubTokenResponse> & { error?: string, error_description?: string }
  if (json.error || !json.access_token) {
    throw createError({
      statusCode: 502,
      statusMessage: `GitHub token exchange error: ${json.error_description ?? json.error ?? 'no access_token returned'}`,
    })
  }
  return json as GitHubTokenResponse
}

export interface GitHubUser {
  id: number
  login: string
  name?: string | null
  email?: string | null
  avatar_url?: string
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(USER_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'polymux',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `GitHub user fetch failed: ${res.status} ${text}`.trim(),
    })
  }
  return (await res.json()) as GitHubUser
}

// /user.email is null when the account hides it. Pull the primary email from
// /user/emails as a fallback.
export async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USER_EMAILS_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'polymux',
    },
  })
  if (!res.ok) return null
  const list = (await res.json()) as Array<{ email: string, primary: boolean, verified: boolean }>
  const primary = list.find(e => e.primary && e.verified) ?? list.find(e => e.verified) ?? list[0]
  return primary?.email ?? null
}
