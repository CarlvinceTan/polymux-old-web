import { serverSupabaseUser, serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { dispatchIntegrationTool, loadIntegrationVersionForDispatch } from '~~/server/connectors/dispatchIntegrationTool'
import { executeIntent, IntentExecutionError } from '~~/server/connectors/intentExecutor'

// POST /api/workspaces/[id]/integrations/[provider]/invoke
//
// Manual end-to-end test endpoint for a third-party integration's tool.
// Lets us validate the publish → install → dispatch → intent → execute
// chain without waiting for the orchestrator wiring (Phase 2 also covers
// that, but Go-side; this gives us a knob to test from the web side).
//
// Body: { tool: string, input: object }
//
// Flow:
//   1. Membership check (any workspace member can invoke an installed tool).
//   2. Look up the workspace_integrations row for `provider`. Must be
//      pinned to an integration_version_id (third-party only).
//   3. Load + decrypt the manifest and signing secret.
//   4. Dispatch with HMAC + 8s timeout.
//   5. If response carries an `intent`, execute it via the connector.
//   6. Return the integration's `data` and the intent execution result.

interface InvokeBody {
  tool?: unknown
  input?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = getRouterParam(event, 'id')
  const provider = getRouterParam(event, 'provider')
  if (!workspaceId || !provider) {
    throw createError({ statusCode: 400, statusMessage: 'workspace id and provider are required.' })
  }

  const body = await readBody<InvokeBody>(event)
  const tool = typeof body?.tool === 'string' ? body.tool : ''
  const input = (typeof body?.input === 'object' && body.input !== null) ? body.input : {}
  if (!tool) {
    throw createError({ statusCode: 400, statusMessage: 'tool is required.' })
  }

  // Membership check.
  const supabase = await serverSupabaseClient(event)
  const sbUser = supabase as unknown as {
    from: (t: string) => { select: (cols: string) => { eq: (col: string, val: string) => { eq?: (col: string, val: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } } }
  }
  const memberRes = await sbUser
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq?.('user_id', user.sub)
    .single()
  if (!memberRes?.data) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace.' })
  }

  // Look up the install row.
  const admin = serverSupabaseServiceRole(event)
  const sbAdmin = admin as unknown as {
    from: (t: string) => { select: (cols: string) => { eq: (col: string, val: string) => { eq?: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } } }
  }
  const installRes = await sbAdmin
    .from('workspace_integrations')
    .select('id, integration_version_id, status, provider')
    .eq('workspace_id', workspaceId)
    .eq?.('provider', provider)
    .maybeSingle()
  const install = installRes?.data as { id: string, integration_version_id?: string | null, status: string } | null
  if (!install) {
    throw createError({ statusCode: 404, statusMessage: `Integration '${provider}' not installed in this workspace.` })
  }
  if (install.status !== 'active') {
    throw createError({ statusCode: 409, statusMessage: `Integration is not active (status=${install.status}).` })
  }
  if (!install.integration_version_id) {
    throw createError({ statusCode: 400, statusMessage: 'Install is not pinned to an integration version (first-party connector?).' })
  }

  // Load the manifest + signing secret.
  const loaded = await loadIntegrationVersionForDispatch(admin, install.id)
  if ('error' in loaded) {
    throw createError({ statusCode: 500, statusMessage: loaded.error })
  }

  // Dispatch the tool call to the integration.
  const dispatch = await dispatchIntegrationTool({
    workspaceId,
    slug: provider,
    tool,
    input,
    manifest: loaded.manifest,
    signingSecret: loaded.signingSecret,
  })
  if (!dispatch.ok) {
    const statusCode = (dispatch.code === 'tool_not_found' || dispatch.code === 'misconfigured')
      ? 400
      : dispatch.code === 'client_unavailable'
          ? 409
          : 502
    throw createError({
      statusCode,
      statusMessage: `Dispatch failed (${dispatch.code}): ${dispatch.message}`,
    })
  }

  // If there's an intent in the response, execute it via the connector.
  let intentResult: unknown = undefined
  if (dispatch.intent) {
    try {
      intentResult = await executeIntent(admin, {
        workspaceId,
        workspaceIntegrationId: install.id,
        intent: dispatch.intent,
      })
    }
    catch (err) {
      if (err instanceof IntentExecutionError) {
        throw createError({ statusCode: 400, statusMessage: `Intent rejected (${err.code}): ${err.message}` })
      }
      throw err
    }
  }

  return {
    ok: true as const,
    data: dispatch.data ?? null,
    intent: dispatch.intent ?? null,
    intent_result: intentResult ?? null,
  }
})
