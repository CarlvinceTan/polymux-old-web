// Minimal MCP (Model Context Protocol) client over the Streamable HTTP
// transport. Used for `transport: 'mcp'` integrations — remote MCP servers
// the *author* hosts. Polymux is only the client: it opens no long-lived
// process, it POSTs JSON-RPC and reads the reply. That keeps the hosting cost
// (and the security surface of running third-party code) on the author's side.
//
// We deliberately don't pull in `@modelcontextprotocol/sdk`: the slice we need
// (initialize → tools/list / tools/call) is a handful of JSON-RPC round-trips,
// and the SDK's stateful session/transport machinery fights our stateless,
// per-call dispatch model. Each call re-initializes; for the request/response
// tools that make up the marketplace that's correct and serverless-friendly.
//
// All network egress goes through `safeFetch`, so SSRF defenses (no private
// IPs, https-only, size + timeout caps, no redirect following) apply to MCP
// endpoints exactly as they do to webhook calls.

import { safeFetch, SafeFetchError } from '~~/server/utils/integrations/integrationFetch'

const MCP_PROTOCOL_VERSION = '2025-06-18'
const SESSION_HEADER = 'mcp-session-id'

export interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export interface McpCallResult {
  /** Structured payload if the server returned `structuredContent`. */
  structuredContent?: unknown
  /** Raw MCP content blocks (text/json/etc.). */
  content?: unknown
  isError: boolean
}

export type McpError =
  | { reason: 'network', message: string, statusCode?: number }
  | { reason: 'ssrf', message: string }
  | { reason: 'protocol', message: string }

export class McpClientError extends Error {
  constructor(public detail: McpError) {
    super(detail.message)
    this.name = 'McpClientError'
  }
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number | string
  result?: unknown
  error?: { code: number, message: string, data?: unknown }
}

export interface McpRequestOptions {
  /** Extra headers (e.g. an Authorization bearer resolved from credentials). */
  headers?: Record<string, string>
  timeoutMs?: number
}

/**
 * A Streamable-HTTP response may be a single JSON object (`application/json`)
 * or an SSE stream (`text/event-stream`) carrying one or more `data:` events.
 * We extract the JSON-RPC message matching `id` (or the first that carries a
 * result/error) from either framing.
 */
function parseRpcBody(text: string, contentType: string, id: number): JsonRpcResponse {
  const isSse = contentType.toLowerCase().includes('text/event-stream')
  if (!isSse) {
    try {
      return JSON.parse(text) as JsonRpcResponse
    }
    catch {
      throw new McpClientError({ reason: 'protocol', message: 'MCP response was not valid JSON' })
    }
  }
  // SSE: collect `data:` payloads, parse each, pick the matching JSON-RPC reply.
  const messages: JsonRpcResponse[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.startsWith('data:') ? line.slice(5).trimStart() : ''
    if (!trimmed) continue
    try {
      messages.push(JSON.parse(trimmed) as JsonRpcResponse)
    }
    catch {
      // Ignore non-JSON SSE comments / keep-alives.
    }
  }
  const match = messages.find(m => m.id === id) ?? messages.find(m => m.result !== undefined || m.error !== undefined)
  if (!match) {
    throw new McpClientError({ reason: 'protocol', message: 'No JSON-RPC message found in MCP SSE stream' })
  }
  return match
}

async function rpc(
  endpoint: string,
  id: number,
  method: string,
  params: unknown,
  sessionId: string | undefined,
  opts: McpRequestOptions,
): Promise<{ result: unknown, sessionId?: string }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json, text/event-stream',
    ...(sessionId ? { [SESSION_HEADER]: sessionId } : {}),
    ...(opts.headers ?? {}),
  }
  let res
  try {
    res = await safeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      timeoutMs: opts.timeoutMs,
    })
  }
  catch (err) {
    if (err instanceof SafeFetchError) {
      if (err.reason === 'private_ip' || err.reason === 'scheme' || err.reason === 'dns') {
        throw new McpClientError({ reason: 'ssrf', message: err.message })
      }
      throw new McpClientError({ reason: 'network', message: err.message, statusCode: err.statusCode })
    }
    throw new McpClientError({ reason: 'network', message: (err as Error).message })
  }
  if (!res.ok) {
    throw new McpClientError({ reason: 'network', message: `MCP server returned ${res.status}`, statusCode: res.status })
  }
  const parsed = parseRpcBody(res.text, res.headers.get('content-type') ?? '', id)
  if (parsed.error) {
    throw new McpClientError({ reason: 'protocol', message: `MCP error ${parsed.error.code}: ${parsed.error.message}` })
  }
  return { result: parsed.result, sessionId: res.headers.get(SESSION_HEADER) ?? sessionId }
}

/** initialize handshake. Returns the (optional) session id the server assigned. */
async function initialize(endpoint: string, opts: McpRequestOptions): Promise<string | undefined> {
  const { sessionId } = await rpc(endpoint, 1, 'initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'polymux', version: '1.0' },
  }, undefined, opts)
  // `notifications/initialized` is fire-and-forget (server replies 202). We
  // best-effort it so spec-strict servers don't reject the follow-up call.
  try {
    await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        ...(sessionId ? { [SESSION_HEADER]: sessionId } : {}),
        ...(opts.headers ?? {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      timeoutMs: opts.timeoutMs,
    })
  }
  catch {
    // Non-fatal — many servers don't require the notification.
  }
  return sessionId
}

/** Introspect a remote MCP server: handshake + list its tools. */
export async function mcpListTools(endpoint: string, opts: McpRequestOptions = {}): Promise<McpTool[]> {
  const sessionId = await initialize(endpoint, opts)
  const { result } = await rpc(endpoint, 2, 'tools/list', {}, sessionId, opts)
  if (!result || typeof result !== 'object' || !Array.isArray((result as { tools?: unknown }).tools)) {
    throw new McpClientError({ reason: 'protocol', message: 'tools/list did not return a tools array' })
  }
  return (result as { tools: McpTool[] }).tools
}

/** Call one tool on a remote MCP server (handshake + tools/call). */
export async function mcpCallTool(
  endpoint: string,
  name: string,
  args: unknown,
  opts: McpRequestOptions = {},
): Promise<McpCallResult> {
  const sessionId = await initialize(endpoint, opts)
  const { result } = await rpc(endpoint, 2, 'tools/call', { name, arguments: args ?? {} }, sessionId, opts)
  const r = (result ?? {}) as { structuredContent?: unknown, content?: unknown, isError?: unknown }
  return {
    structuredContent: r.structuredContent,
    content: r.content,
    isError: r.isError === true,
  }
}
