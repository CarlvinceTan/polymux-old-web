// Tier 2 seam: client-side tool execution.
//
// For `transport: 'client'` integrations the tool's compute runs on the
// *user's* machine — the Polymux native app or browser extension — not on our
// servers. The dispatcher can't open an HTTP connection for these; instead it
// hands the call to whatever bridge is connected to the user's session over
// the realtime channel, which performs a reverse-RPC:
//
//   server  --(mcp.call {callId, tool, input})-->  app/extension
//   app     runs the local MCP server / in-process tool
//   app     --(mcp.result {callId, ok, data})-->   server
//
// This module is only the registration point and the contract. The actual
// channel wiring is owned elsewhere (the Go orchestrator's session channel and
// the extension's native-messaging host); whichever process holds the live
// connection calls `registerClientToolInvoker()` at startup. Until something
// registers, the dispatcher reports `client_unavailable` — which is the honest
// answer for a client-only tool when no client is connected (e.g. a background
// scheduled run while the user's app is closed).

export interface ClientToolCall {
  workspaceId: string
  /** Catalog slug of the integration. */
  slug: string
  /** Tool name from the manifest's `tools[]`. */
  tool: string
  /** Tool input — passed through to the client unchanged. */
  input: unknown
}

export type ClientInvokeResult =
  | { ok: true, data?: unknown }
  | { ok: false, code: 'client_unavailable' | 'client_error' | 'timeout', message: string }

export interface ClientToolInvoker {
  /**
   * Is a client capable of serving this workspace currently connected? Lets the
   * dispatcher fail fast (and the orchestrator decide whether to queue the run
   * for when the app reconnects) instead of waiting for a timeout.
   */
  isAvailable(workspaceId: string): boolean | Promise<boolean>
  /** Perform the reverse-RPC and resolve with the client's result. */
  invoke(call: ClientToolCall, opts: { timeoutMs: number }): Promise<ClientInvokeResult>
}

let registered: ClientToolInvoker | null = null

/**
 * Register the process-wide client invoker. Called once by whichever component
 * owns the live realtime channel to user apps/extensions. Replaces any prior
 * registration (last writer wins); pass `null` to clear.
 */
export function registerClientToolInvoker(invoker: ClientToolInvoker | null): void {
  registered = invoker
}

export function getClientToolInvoker(): ClientToolInvoker | null {
  return registered
}
