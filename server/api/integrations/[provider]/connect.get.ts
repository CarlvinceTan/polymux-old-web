import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { issueOAuthState, STATE_COOKIE } from '~~/server/utils/oauth/oauthState'
import { getConnector } from '~~/server/connectors/registry'

// GET /api/integrations/[provider]/connect?workspace_id=...&migrate=1
//
// Per-workspace, admin-only. Signs a 5-min state token, sets the matching
// nonce cookie, and 302s to the provider consent screen. The callback at
// /api/integrations/[provider]/callback verifies state+nonce, exchanges the
// code, and persists the connection.
//
// Provider dispatch lives in `server/connectors/registry.ts`. To add a new
// first-party OAuth provider, implement `ConnectorHandler` and register it
// there — no changes needed in this file.

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const workspaceId = typeof query.workspace_id === 'string' ? query.workspace_id : ''
  const migrate = query.migrate === '1' || query.migrate === 'true'

  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is required.' })
  }
  const connector = getConnector(provider)
  if (!connector) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider.' })
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

  return await sendRedirect(event, connector.buildAuthUrl(state), 302)
})
