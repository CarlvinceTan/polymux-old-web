import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { isKnownProvider, isOAuthProvider } from '~~/server/utils/integrationRegistry'
import { issueOAuthState, STATE_COOKIE } from '~~/server/utils/oauthState'
import { buildGoogleAuthUrl, GMAIL_SCOPES } from '~~/server/utils/googleOAuth'
import { buildGitHubAuthUrl } from '~~/server/utils/githubOAuth'
import { buildSlackAuthUrl } from '~~/server/utils/slackOAuth'
import { buildNotionAuthUrl } from '~~/server/utils/notionOAuth'
import { buildLinearAuthUrl } from '~~/server/utils/linearOAuth'

// GET /api/integrations/[provider]/connect?workspace_id=...&migrate=1
//
// Per-workspace, admin-only. Signs a 5-min state token, sets the matching
// nonce cookie, and 302s to the provider consent screen. The callback at
// /api/integrations/[provider]/callback verifies state+nonce, exchanges the
// code, and persists the connection.

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const workspaceId = typeof query.workspace_id === 'string' ? query.workspace_id : ''
  const migrate = query.migrate === '1' || query.migrate === 'true'

  if (!provider || !isKnownProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
  }
  if (!isOAuthProvider(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is not an OAuth connection.' })
  }
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspace_id is required.' })
  }

  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only owners and admins can connect integrations.' })
  }

  const { state, nonce } = issueOAuthState({
    workspaceId,
    userId: user.sub,
    provider,
    migrate,
  })

  setCookie(event, STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 5,
  })

  let redirectUrl: string
  switch (provider) {
    case 'google-drive':
      redirectUrl = buildGoogleAuthUrl(state)
      break
    case 'gmail':
      redirectUrl = buildGoogleAuthUrl(state, { provider: 'gmail', scopes: GMAIL_SCOPES })
      break
    case 'github':
      redirectUrl = buildGitHubAuthUrl(state)
      break
    case 'slack':
      redirectUrl = buildSlackAuthUrl(state)
      break
    case 'notion':
      redirectUrl = buildNotionAuthUrl(state)
      break
    case 'linear':
      redirectUrl = buildLinearAuthUrl(state)
      break
    default:
      throw createError({
        statusCode: 501,
        statusMessage: `OAuth connect for ${provider} is not implemented yet.`,
      })
  }

  return await sendRedirect(event, redirectUrl, 302)
})
