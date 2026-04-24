import { serverSupabaseServiceRole } from '#supabase/server'
import { isKnownProvider, isOAuthProvider } from '~~/server/utils/integrationRegistry'
import { verifyOAuthState, STATE_COOKIE } from '~~/server/utils/oauthState'
import {
  exchangeAuthCode,
  fetchUserInfo,
  createDriveFolder,
  GOOGLE_DRIVE_SCOPES,
  GMAIL_SCOPES,
} from '~~/server/utils/googleOAuth'
import {
  exchangeGitHubAuthCode,
  fetchGitHubUser,
  fetchGitHubPrimaryEmail,
  GITHUB_SCOPES,
} from '~~/server/utils/githubOAuth'
import {
  exchangeSlackAuthCode,
  fetchSlackIdentity,
  SLACK_BOT_SCOPES,
} from '~~/server/utils/slackOAuth'
import { exchangeNotionAuthCode } from '~~/server/utils/notionOAuth'
import {
  exchangeLinearAuthCode,
  fetchLinearViewer,
  LINEAR_SCOPES,
} from '~~/server/utils/linearOAuth'
import { encryptToken } from '~~/server/utils/tokenCrypto'

// GET /api/integrations/[provider]/callback?code=...&state=...
//
// Validates state JWT against the nonce cookie, exchanges the auth code for
// tokens, fetches account info, and persists the connection (tokens encrypted
// at rest). Drive additionally creates a per-workspace root folder. On the
// way out we 302 to /integrations/installed?connected=<provider> so the user
// lands back in app.

interface IntegrationRow {
  workspace_id: string
  provider: string
  connected_by: string
  account_email: string | null
  account_display_name: string | null
  scopes: string[]
  access_token_enc: string
  refresh_token_enc: string | null
  expires_at: string | null
  root_folder_id: string | null
  root_folder_name: string | null
  metadata: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const oauthError = typeof query.error === 'string' ? query.error : ''

  if (!provider || !isKnownProvider(provider) || !isOAuthProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown OAuth provider.' })
  }

  if (oauthError) {
    return await sendRedirect(
      event,
      `/integrations/installed?error=${encodeURIComponent(oauthError)}`,
      302,
    )
  }

  if (!code || !state) {
    throw createError({ statusCode: 400, statusMessage: 'Missing code or state.' })
  }

  const nonce = getCookie(event, STATE_COOKIE) ?? ''
  if (!nonce) {
    throw createError({ statusCode: 400, statusMessage: 'Missing OAuth nonce cookie. Restart the connect flow.' })
  }
  const payload = verifyOAuthState(state, nonce)
  if (payload.provider !== provider) {
    throw createError({ statusCode: 400, statusMessage: 'OAuth state provider mismatch.' })
  }
  // One-shot cookie — clear it now whatever happens next.
  setCookie(event, STATE_COOKIE, '', { path: '/', maxAge: 0 })

  const admin = serverSupabaseServiceRole(event)

  let row: IntegrationRow

  if (provider === 'google-drive' || provider === 'gmail') {
    const tokens = await exchangeAuthCode(code, provider)
    const userInfo = await fetchUserInfo(tokens.access_token)

    let rootFolderId: string | null = null
    let rootFolderName: string | null = null

    if (provider === 'google-drive') {
      const { data: workspace, error: wsError } = await admin
        .from('workspaces')
        .select('name')
        .eq('id', payload.workspace_id)
        .single()
      if (wsError || !workspace) {
        throw createError({ statusCode: 404, statusMessage: 'Workspace not found.' })
      }
      const folderName = `Polymux / ${workspace.name ?? 'workspace'}`
      const folder = await createDriveFolder(tokens.access_token, folderName)
      rootFolderId = folder.id
      rootFolderName = folder.name
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    const defaultScopes = provider === 'gmail' ? GMAIL_SCOPES : GOOGLE_DRIVE_SCOPES
    const scopes = (tokens.scope || defaultScopes.join(' ')).split(/\s+/).filter(Boolean)

    row = {
      workspace_id: payload.workspace_id,
      provider,
      connected_by: payload.user_id,
      account_email: userInfo.email ?? null,
      account_display_name: userInfo.name ?? null,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expires_at: expiresAt,
      root_folder_id: rootFolderId,
      root_folder_name: rootFolderName,
      metadata: { google_sub: userInfo.sub, migrate_requested: payload.migrate },
    }
  }
  else if (provider === 'github') {
    const tokens = await exchangeGitHubAuthCode(code)
    const user = await fetchGitHubUser(tokens.access_token)
    const email = user.email ?? (await fetchGitHubPrimaryEmail(tokens.access_token))
    const scopes = (tokens.scope || GITHUB_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    row = {
      workspace_id: payload.workspace_id,
      provider,
      connected_by: payload.user_id,
      account_email: email,
      account_display_name: user.name ?? user.login ?? null,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: null,
      root_folder_id: null,
      root_folder_name: null,
      metadata: { github_login: user.login, github_user_id: user.id, avatar_url: user.avatar_url },
    }
  }
  else if (provider === 'slack') {
    const tokens = await exchangeSlackAuthCode(code)
    const accessToken = tokens.access_token!
    let identityEmail: string | null = null
    let identityName: string | null = null
    if (tokens.authed_user?.access_token) {
      const identity = await fetchSlackIdentity(tokens.authed_user.access_token)
      identityEmail = identity?.user?.email ?? null
      identityName = identity?.user?.name ?? null
    }
    const scopes = (tokens.scope || SLACK_BOT_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    row = {
      workspace_id: payload.workspace_id,
      provider,
      connected_by: payload.user_id,
      account_email: identityEmail,
      account_display_name: identityName ?? tokens.team?.name ?? null,
      scopes,
      access_token_enc: encryptToken(accessToken),
      refresh_token_enc: null,
      expires_at: null,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        team_id: tokens.team?.id,
        team_name: tokens.team?.name,
        bot_user_id: tokens.bot_user_id,
        app_id: tokens.app_id,
        authed_user_id: tokens.authed_user?.id,
        enterprise: tokens.enterprise ?? null,
      },
    }
  }
  else if (provider === 'notion') {
    const tokens = await exchangeNotionAuthCode(code)
    const ownerEmail = tokens.owner?.user?.person?.email ?? null
    const ownerName = tokens.owner?.user?.name ?? null
    row = {
      workspace_id: payload.workspace_id,
      provider,
      connected_by: payload.user_id,
      account_email: ownerEmail,
      account_display_name: ownerName ?? tokens.workspace_name ?? null,
      scopes: [],
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: null,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        bot_id: tokens.bot_id,
        notion_workspace_id: tokens.workspace_id,
        notion_workspace_name: tokens.workspace_name,
        notion_workspace_icon: tokens.workspace_icon,
        owner_user_id: tokens.owner?.user?.id ?? null,
      },
    }
  }
  else if (provider === 'linear') {
    const tokens = await exchangeLinearAuthCode(code)
    const viewer = await fetchLinearViewer(tokens.access_token)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null
    const scopes = (tokens.scope || LINEAR_SCOPES.join(',')).split(/[,\s]+/).filter(Boolean)
    row = {
      workspace_id: payload.workspace_id,
      provider,
      connected_by: payload.user_id,
      account_email: viewer?.email ?? null,
      account_display_name: viewer?.displayName ?? viewer?.name ?? null,
      scopes,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: null,
      expires_at: expiresAt,
      root_folder_id: null,
      root_folder_name: null,
      metadata: {
        linear_user_id: viewer?.id ?? null,
        organization: viewer?.organization ?? null,
      },
    }
  }
  else {
    throw createError({
      statusCode: 501,
      statusMessage: `OAuth callback for ${provider} is not implemented yet.`,
    })
  }

  const { error: upsertError } = await admin
    .from('workspace_integrations')
    .upsert(row, { onConflict: 'workspace_id,provider' })

  if (upsertError) {
    console.error(`[${provider} callback] upsert failed`, upsertError)
    throw createError({ statusCode: 500, statusMessage: `Failed to persist ${provider} connection.` })
  }

  const target = `/integrations/installed?connected=${provider}${payload.migrate ? '&migrate=1' : ''}`
  return await sendRedirect(event, target, 302)
})
