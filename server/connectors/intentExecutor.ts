// Intent executor — the only place a third-party integration's request can
// reach a first-party connector's bearer token.
//
// A third-party integration's tool webhook returns
//   { ok: true, intent: { action, args } }
// instead of touching upstream APIs directly. Polymux receives that, looks
// the action up in this registry, validates the workspace has both:
//   1. A grant for the action's Polymux-namespace scope (so the workspace
//      knew what it was authorizing at install time), and
//   2. A first-party connector install with the upstream OAuth scope the
//      action needs (so we can actually call the upstream API).
// Then we call the upstream API using *Polymux's* connector token, never
// exposing it to the integration. Result flows back as the dispatch response.
//
// Adding a new action: drop an entry into ACTION_REGISTRY. Each entry is
// completely self-contained: it declares which connector it uses, the
// Polymux scope a workspace must grant to the third-party integration to
// authorize this action, the upstream scope the connector token must have,
// and the executor that actually performs the call.

import { decryptToken } from '~~/server/utils/tokenCrypto'

export interface ActionContext {
  /** The first-party connector's decrypted upstream access token. */
  accessToken: string
  /** Args validated by the action's schema. Caller already type-narrowed. */
  args: Record<string, unknown>
  /** The workspace_integrations.metadata for the connector (e.g. Slack team_id). */
  connectorMetadata: Record<string, unknown>
}

export interface ActionDefinition {
  /** `<connector>.<verb>` namespace. Example: `slack.chat.postMessage`. */
  action: string
  /** First-party connector slug whose token we use. */
  connectorSlug: string
  /**
   * Polymux scope the third-party install must hold (in
   * workspace_integration_grants) to be allowed to issue this intent. Distinct
   * from the upstream OAuth scope — it's a Polymux-namespace approval string
   * shown to the workspace admin at install time.
   */
  polymuxScope: string
  /** Upstream OAuth scope that must appear on the connector install. */
  upstreamScope: string
  /** Validate-args + perform the upstream call. Throw on failure. */
  execute: (ctx: ActionContext) => Promise<unknown>
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ACTION_REGISTRY: Record<string, ActionDefinition> = {}

function register(def: ActionDefinition): void {
  ACTION_REGISTRY[def.action] = def
}

// Slack: post a message. Demonstrates the model end-to-end.
register({
  action: 'slack.chat.postMessage',
  connectorSlug: 'slack',
  polymuxScope: 'slack:chat.write',
  upstreamScope: 'chat:write',
  execute: async ({ accessToken, args }) => {
    const channel = typeof args.channel === 'string' ? args.channel : null
    const text = typeof args.text === 'string' ? args.text : null
    if (!channel || !text) {
      throw new IntentExecutionError('bad_args', 'slack.chat.postMessage requires {channel, text}')
    }
    const blocks = Array.isArray(args.blocks) ? args.blocks : undefined
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text, blocks }),
    })
    if (!res.ok) {
      throw new IntentExecutionError('upstream_error', `Slack returned ${res.status}`)
    }
    const json = await res.json() as { ok: boolean, error?: string, ts?: string, channel?: string }
    if (!json.ok) {
      throw new IntentExecutionError('upstream_error', `Slack: ${json.error ?? 'unknown'}`)
    }
    return { posted: true, ts: json.ts, channel: json.channel }
  },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class IntentExecutionError extends Error {
  constructor(public code: 'unknown_action' | 'no_grant' | 'no_connector' | 'no_scope' | 'bad_args' | 'upstream_error', message: string) {
    super(message)
    this.name = 'IntentExecutionError'
  }
}

export function lookupAction(action: string): ActionDefinition | null {
  return ACTION_REGISTRY[action] ?? null
}

export interface ExecuteIntentInput {
  workspaceId: string
  workspaceIntegrationId: string
  intent: { action: string, args: Record<string, unknown> }
}

/**
 * Execute an intent returned by a third-party integration. Service-role
 * Supabase access required (the connector token decrypt is privileged).
 *
 * `admin` is the value returned by `serverSupabaseServiceRole(event)`; typed
 * `any` because the auto-generated schema types don't cover the new
 * marketplace tables yet.
 */
export async function executeIntent(
  admin: any,
  input: ExecuteIntentInput,
): Promise<unknown> {
  const def = lookupAction(input.intent.action)
  if (!def) {
    throw new IntentExecutionError('unknown_action', `Unknown intent action: ${input.intent.action}`)
  }

  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle?: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          eq?: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }>
          }
        }
      }
    }
  }

  // 1. Verify the third-party install has been granted the polymuxScope.
  const grantQ = sb
    .from('workspace_integration_grants')
    .select('scope')
    .eq('workspace_integration_id', input.workspaceIntegrationId)
  const grantStep = grantQ.eq?.('scope', def.polymuxScope) as
    | { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> }
    | undefined
  const grantRes = await grantStep?.maybeSingle()
  if (!grantRes || grantRes.error || !grantRes.data) {
    throw new IntentExecutionError(
      'no_grant',
      `Workspace did not grant scope '${def.polymuxScope}' to this integration`,
    )
  }

  // 2. Look up the first-party connector install for the workspace.
  const connectorRowQ = sb
    .from('workspace_integrations')
    .select('id, provider, scopes, access_token_enc, metadata, status')
    .eq('workspace_id', input.workspaceId)
  const connectorStep = connectorRowQ.eq?.('provider', def.connectorSlug) as
    | { maybeSingle: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> }
    | undefined
  const connectorRes = await connectorStep?.maybeSingle()
  if (!connectorRes || connectorRes.error || !connectorRes.data) {
    throw new IntentExecutionError(
      'no_connector',
      `Workspace has not connected the '${def.connectorSlug}' integration that this action requires`,
    )
  }
  const connector = connectorRes.data as {
    scopes?: string[]
    access_token_enc?: string | null
    metadata?: Record<string, unknown>
    status?: string
  }
  if (connector.status === 'disabled') {
    throw new IntentExecutionError('no_connector', `${def.connectorSlug} install is disabled`)
  }
  if (!Array.isArray(connector.scopes) || !connector.scopes.includes(def.upstreamScope)) {
    throw new IntentExecutionError(
      'no_scope',
      `${def.connectorSlug} install does not have upstream scope '${def.upstreamScope}'`,
    )
  }
  if (!connector.access_token_enc) {
    throw new IntentExecutionError('no_connector', `${def.connectorSlug} has no token`)
  }

  // 3. Execute via the connector's decrypted token.
  const token = decryptToken(connector.access_token_enc)
  return await def.execute({
    accessToken: token,
    args: input.intent.args,
    connectorMetadata: connector.metadata ?? {},
  })
}
