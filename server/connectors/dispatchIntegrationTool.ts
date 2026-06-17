// Dispatcher that calls a third-party integration's tool webhook.
//
// Lookup chain:
//   workspace_integrations row → integration_versions row (manifest) →
//   manifest.runtime.base_url + manifest.tools[].handler.path → POST.
//
// Request shape (signed by integrationSignature.ts):
//   POST <base_url><handler.path>
//   X-Polymux-Signature: v1=<hmac-sha256 of "<ts>.<body>">
//   X-Polymux-Timestamp: <unix seconds>
//   X-Polymux-Nonce: <random base64>
//   Content-Type: application/json
//   Body: {
//     workspace_id: string,
//     tool: string,
//     input: <user-supplied JSON>,
//     timestamp: <unix seconds>,
//     nonce: <random>
//   }
//
// Response shape (validated below):
//   { ok: true, data?: <opaque>, intent?: { action: string, args: object } }
//   { ok: false, error: { code: string, message: string } }
//
// `intent` is the privileged path: when present, Polymux passes it to
// `intentExecutor` which validates the requested action against the
// workspace's grants and runs it against a first-party connector token.
// The third-party integration never sees the connector's bearer token.

import { decryptToken } from '~~/server/utils/security/tokenCrypto'
import { safeFetch, SafeFetchError } from '~~/server/utils/integrations/integrationFetch'
import { signRequest } from '~~/server/utils/integrations/integrationSignature'
import { mcpCallTool, McpClientError } from '~~/server/utils/integrations/mcpClient'
import { getClientToolInvoker } from '~~/server/connectors/clientToolInvoker'
import {
  validateManifest,
  type IntegrationManifest,
  type IntegrationManifestTool,
} from '~~/server/utils/integrations/integrationManifest'

const DEFAULT_TIMEOUT_MS = 8000

export interface DispatchInput {
  workspaceId: string
  /** Catalog slug, matches `workspace_integrations.provider`. */
  slug: string
  /** Tool name from the manifest's `tools[]`. */
  tool: string
  /** Tool input — passed through to the integration unchanged. */
  input: unknown
  /** Plain manifest (already validated) — caller may pass a cached copy. */
  manifest: IntegrationManifest
  /**
   * Plaintext signing secret for `transport: 'https'` webhook calls. Caller
   * decrypts it from integration_versions.webhook_signing_secret_enc. Not used
   * (and not required) for 'mcp' or 'client' transports.
   */
  signingSecret?: string
  /**
   * Extra headers for `transport: 'mcp'` — e.g. an `Authorization` bearer the
   * caller resolved from the integration's credentials. Optional; public MCP
   * servers need none.
   */
  mcpHeaders?: Record<string, string>
}

export interface IntegrationIntent {
  action: string
  args: Record<string, unknown>
}

export type DispatchResult =
  | { ok: true, data?: unknown, intent?: IntegrationIntent }
  | { ok: false, code: 'tool_not_found' | 'http_error' | 'timeout' | 'bad_response' | 'integration_error' | 'ssrf' | 'mcp_error' | 'client_unavailable' | 'misconfigured', message: string, status?: number }

/**
 * Dispatch a tool call. Routes by `runtime.transport`:
 *  - 'https'  → HMAC-signed webhook (author-hosted HTTPS service).
 *  - 'mcp'    → remote MCP server `tools/call` (author-hosted, Tier 1).
 *  - 'client' → reverse-RPC to the user's app/extension (Tier 2).
 * In every case Polymux is the *client*; it never hosts the plugin's compute.
 */
export async function dispatchIntegrationTool(input: DispatchInput): Promise<DispatchResult> {
  const tool = (input.manifest.tools ?? []).find((t: IntegrationManifestTool) => t.name === input.tool)
  if (!tool) {
    return { ok: false, code: 'tool_not_found', message: `Tool '${input.tool}' not declared in manifest` }
  }
  switch (input.manifest.runtime.transport) {
    case 'https':
      return dispatchViaHttps(input, tool)
    case 'mcp':
      return dispatchViaMcp(input)
    case 'client':
      return dispatchViaClient(input)
    default:
      return { ok: false, code: 'misconfigured', message: `Unsupported transport '${input.manifest.runtime.transport}'` }
  }
}

// ---- Tier 0: author-hosted HTTPS webhook -------------------------------------

async function dispatchViaHttps(input: DispatchInput, tool: IntegrationManifestTool): Promise<DispatchResult> {
  if (!tool.handler) {
    return { ok: false, code: 'misconfigured', message: `Tool '${input.tool}' has no handler for https transport` }
  }
  if (!input.manifest.runtime.base_url) {
    return { ok: false, code: 'misconfigured', message: 'https transport requires runtime.base_url' }
  }
  if (!input.signingSecret) {
    return { ok: false, code: 'misconfigured', message: 'https transport requires a signing secret' }
  }
  const baseUrl = input.manifest.runtime.base_url.replace(/\/+$/, '')
  const url = `${baseUrl}${tool.handler.path}`
  const timeoutMs = input.manifest.runtime.request_timeout_ms ?? DEFAULT_TIMEOUT_MS

  const payload = {
    workspace_id: input.workspaceId,
    tool: input.tool,
    input: input.input,
    timestamp: Math.floor(Date.now() / 1000),
  }
  const body = JSON.stringify(payload)
  const signed = signRequest(input.signingSecret, body)

  let res
  try {
    res = await safeFetch(url, {
      method: tool.handler.method === 'GET' ? 'GET' : 'POST',
      headers: {
        ...signed.headers,
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: tool.handler.method === 'POST' ? signed.body : undefined,
      timeoutMs,
    })
  }
  catch (err) {
    if (err instanceof SafeFetchError) {
      if (err.reason === 'timeout') return { ok: false, code: 'timeout', message: err.message }
      if (err.reason === 'private_ip' || err.reason === 'scheme' || err.reason === 'dns') {
        return { ok: false, code: 'ssrf', message: err.message }
      }
      return { ok: false, code: 'http_error', message: err.message, status: err.statusCode }
    }
    return { ok: false, code: 'http_error', message: (err as Error).message }
  }

  if (!res.ok) {
    return { ok: false, code: 'http_error', message: `Integration returned ${res.status}`, status: res.status }
  }

  let json: unknown
  try {
    json = JSON.parse(res.text)
  }
  catch {
    return { ok: false, code: 'bad_response', message: 'Response was not valid JSON' }
  }
  return parseDispatchResult(json)
}

// ---- Tier 1: author-hosted remote MCP server ---------------------------------

async function dispatchViaMcp(input: DispatchInput): Promise<DispatchResult> {
  const endpoint = input.manifest.runtime.base_url
  if (!endpoint) {
    return { ok: false, code: 'misconfigured', message: 'mcp transport requires runtime.base_url' }
  }
  const timeoutMs = input.manifest.runtime.request_timeout_ms ?? DEFAULT_TIMEOUT_MS
  try {
    const result = await mcpCallTool(endpoint, input.tool, input.input, { headers: input.mcpHeaders, timeoutMs })
    if (result.isError) {
      const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
      return { ok: false, code: 'integration_error', message: `MCP tool reported an error: ${text}` }
    }
    // Prefer the typed payload; fall back to raw content blocks.
    return { ok: true, data: result.structuredContent ?? result.content }
  }
  catch (err) {
    if (err instanceof McpClientError) {
      if (err.detail.reason === 'ssrf') return { ok: false, code: 'ssrf', message: err.detail.message }
      if (err.detail.reason === 'network') return { ok: false, code: 'http_error', message: err.detail.message, status: err.detail.statusCode }
      return { ok: false, code: 'mcp_error', message: err.detail.message }
    }
    return { ok: false, code: 'mcp_error', message: (err as Error).message }
  }
}

// ---- Tier 2: client-side (native app / extension) ----------------------------

async function dispatchViaClient(input: DispatchInput): Promise<DispatchResult> {
  const invoker = getClientToolInvoker()
  if (!invoker) {
    return { ok: false, code: 'client_unavailable', message: 'No client bridge is registered to run client-side tools' }
  }
  const timeoutMs = input.manifest.runtime.request_timeout_ms ?? DEFAULT_TIMEOUT_MS
  if (!(await invoker.isAvailable(input.workspaceId))) {
    return { ok: false, code: 'client_unavailable', message: 'No connected app/extension can run this tool right now' }
  }
  const res = await invoker.invoke(
    { workspaceId: input.workspaceId, slug: input.slug, tool: input.tool, input: input.input },
    { timeoutMs },
  )
  if (res.ok) {
    return { ok: true, data: res.data }
  }
  if (res.code === 'timeout') return { ok: false, code: 'timeout', message: res.message }
  if (res.code === 'client_unavailable') return { ok: false, code: 'client_unavailable', message: res.message }
  return { ok: false, code: 'integration_error', message: res.message }
}

function parseDispatchResult(json: unknown): DispatchResult {
  if (typeof json !== 'object' || json === null) {
    return { ok: false, code: 'bad_response', message: 'Response must be a JSON object' }
  }
  const r = json as { ok?: unknown, data?: unknown, intent?: unknown, error?: unknown }
  if (r.ok === false) {
    const err = (typeof r.error === 'object' && r.error !== null) ? r.error as { code?: string, message?: string } : {}
    return { ok: false, code: 'integration_error', message: err.message ?? 'Integration reported an error', status: undefined }
  }
  if (r.ok !== true) {
    return { ok: false, code: 'bad_response', message: "Response missing 'ok: true'" }
  }
  let intent: IntegrationIntent | undefined
  if (r.intent !== undefined) {
    if (typeof r.intent !== 'object' || r.intent === null) {
      return { ok: false, code: 'bad_response', message: '`intent` must be an object' }
    }
    const i = r.intent as { action?: unknown, args?: unknown }
    if (typeof i.action !== 'string') {
      return { ok: false, code: 'bad_response', message: '`intent.action` must be a string' }
    }
    if (typeof i.args !== 'object' || i.args === null || Array.isArray(i.args)) {
      return { ok: false, code: 'bad_response', message: '`intent.args` must be an object' }
    }
    intent = { action: i.action, args: i.args as Record<string, unknown> }
  }
  return { ok: true, data: r.data, intent }
}

/** Convenience: load + parse + decrypt the manifest/secret for a workspace install. */
// `admin` here is the value returned by `serverSupabaseServiceRole(event)`.
// We type it as `any` because the schema-typed Supabase client doesn't yet
// know about the new `integrations` / `integration_versions` tables — once
// `supabase gen types` is re-run, this can tighten back to the real type.
export async function loadIntegrationVersionForDispatch(
  admin: any,
  workspaceIntegrationId: string,
): Promise<{ manifest: IntegrationManifest, signingSecret?: string, slug: string } | { error: string }> {
  // We use the service role here because RLS on integration_versions tightens
  // around the *user* — but a tool dispatch happens during a request the user
  // already authenticated, and the `workspace_integrations` row authoritatively
  // ties us to a specific integration_version_id.
  const sb = admin as unknown as {
    from: (t: string) => { select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: Record<string, unknown> | null, error: { message: string } | null }> } } }
  }
  const { data: install, error: installErr } = await sb
    .from('workspace_integrations')
    .select('id, provider, integration_version_id, status')
    .eq('id', workspaceIntegrationId)
    .single()
  if (installErr || !install) {
    return { error: installErr?.message ?? 'Install row not found' }
  }
  const i = install as { provider: string, integration_version_id?: string, status: string }
  if (i.status === 'disabled') {
    return { error: 'Install is disabled' }
  }
  if (!i.integration_version_id) {
    return { error: 'Install is not pinned to an integration version' }
  }
  const { data: version, error: versionErr } = await sb
    .from('integration_versions')
    .select('manifest, webhook_signing_secret_enc, status')
    .eq('id', i.integration_version_id)
    .single()
  if (versionErr || !version) {
    return { error: versionErr?.message ?? 'Integration version not found' }
  }
  const v = version as { manifest: unknown, webhook_signing_secret_enc?: string | null, status: string }
  if (v.status !== 'published') {
    return { error: `Integration version status is ${v.status}` }
  }
  let manifest: IntegrationManifest
  try {
    manifest = validateManifest(v.manifest)
  }
  catch (err) {
    return { error: `Manifest invalid: ${(err as Error).message}` }
  }
  // Only the HTTPS webhook transport signs requests; 'mcp' and 'client' have
  // no per-version signing secret.
  let signingSecret: string | undefined
  if (manifest.runtime.transport === 'https') {
    if (!v.webhook_signing_secret_enc) {
      return { error: 'Integration version has no signing secret (first-party only?)' }
    }
    signingSecret = decryptToken(v.webhook_signing_secret_enc)
  }
  return {
    manifest,
    signingSecret,
    slug: i.provider,
  }
}
