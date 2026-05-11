import { serverSupabaseServiceRole } from '#supabase/server'
import { verifyOAuthState, STATE_COOKIE } from '~~/server/utils/oauthState'
import { getConnector } from '~~/server/connectors/registry'

// GET /api/integrations/[provider]/callback?code=...&state=...
//
// Validates state JWT against the nonce cookie, then delegates token exchange,
// identity fetch, and row construction to the provider's `ConnectorHandler`
// (`server/connectors/registry.ts`). Drive's per-workspace root folder
// creation lives inside the Drive connector's `buildIntegrationRow`.
//
// On success, 302s back to /integrations/installed?connected=<provider> so
// the user lands in the app.

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const oauthError = typeof query.error === 'string' ? query.error : ''

  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Provider is required.' })
  }
  const connector = getConnector(provider)
  if (!connector) {
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

  const tokens = await connector.exchangeCode(code)
  const identity = await connector.fetchIdentity(tokens)
  const row = await connector.buildIntegrationRow(
    {
      workspace_id: payload.workspace_id,
      user_id: payload.user_id,
      tokens,
      identity,
      migrate: payload.migrate,
    },
    admin,
  )

  // IntegrationRow's `metadata: Record<string, unknown>` is structurally a
  // subset of the DB column's `Json` type, but TS won't widen it implicitly
  // (Json is a recursive union). Cast at the boundary; the runtime shape is
  // guaranteed by the connector's buildIntegrationRow contract.
  const { error: upsertError } = await admin
    .from('workspace_integrations')
    .upsert(row as never, { onConflict: 'workspace_id,provider' })

  if (upsertError) {
    console.error(`[${provider} callback] upsert failed`, upsertError)
    throw createError({ statusCode: 500, statusMessage: `Failed to persist ${provider} connection.` })
  }

  const target = `/integrations/installed?connected=${provider}${payload.migrate ? '&migrate=1' : ''}`
  return await sendRedirect(event, target, 302)
})
