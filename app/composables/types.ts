// ── Connection ────────────────────────────────────────────────────────────────

import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'
import type { UpgradePlanPayload } from '~/types/upgradePlan'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// ── Envelope ──────────────────────────────────────────────────────────────────

export interface Envelope<T = unknown> {
  type: string
  payload: T
  id: string
  timestamp: string
}

// ── Server → Client payloads ──────────────────────────────────────────────────

export interface AgentMessagePayload {
  content: string
  is_partial: boolean
  agent_id: string
  /** Persisted-row id of the assistant bubble. Set only on final frames; the
   *  frontend uses it for retry tracking and feedback attachment. */
  message_id?: string
}

/**
 * AgentMessageBoundaryPayload signals the UI to seal the current bubble and
 * start a fresh one for subsequent text. Fired between continuation rounds
 * within a single turn — without this, per-round narration concatenates into
 * one bubble and looks like literal text duplication when the model re-states
 * its plan.
 */
export interface AgentMessageBoundaryPayload {
  agent_id: string
}

export interface AgentThinkingPayload {
  agent_id: string
  action: string
  detail: string
  step?: number
  total_steps?: number
}

/**
 * CredentialRequestPayload arrives when the agent calls RequestCredential —
 * a browser sub-agent needs login details for `site` and the user has to
 * either pick an existing vault entry or save a fresh one. The frontend
 * replies with CredentialProvidedPayload referencing the chosen credential.
 */
export interface CredentialRequestPayload {
  msg_id: string
  site: string
  purpose: string
  suggested_username?: string
}

/**
 * CredentialProvidedPayload is the reply the frontend sends back. It carries
 * ONLY the credential_id and username — never the password. The server
 * decrypts the secret itself (service-role) and injects it into the browser
 * fill below the model, so the plaintext never leaves the server. Set
 * cancelled=true to signal the user dismissed the modal.
 */
export interface CredentialProvidedPayload {
  msg_id: string
  credential_id: string
  username: string
  /** User opt-in (default false) to let the agent enter this credential via the
   *  plain fill tools as a fallback, on top of the blindfold secure_login path. */
  allow_agent_fill?: boolean
  cancelled?: boolean
}

export interface BrowserSpawnedPayload {
  agent_id: string
  /** Initial task the agent was seeded with. Omitted by the server's
   *  visual-only hydration path and by user-initiated spawns that arrive with
   *  no initial task — always treat as optional. */
  task?: string
  /** Pool session name. Omitted on visual-only / REST-hydrated entries; only
   *  live in-memory agents carry it. */
  session_name?: string
  cdp_endpoint?: string
  label?: string
  /** Last-known lifecycle status. Sent on session_state re-sync (live agents
   *  AND DB-hydrated visual-only placeholders). `interrupted` is the marker
   *  the server sets on agents that were running when a 5-min grace window
   *  elapsed without a client. */
  status?: 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted' | string
  /** Last-navigated URL captured by the server. Lets the client paint the URL
   *  strip on a reload-restored viewport even when no live screencast is
   *  attached. */
  url?: string
  /** True when this entry came from the persisted last_browser_states column
   *  rather than a live in-memory agent. The viewport renders read-only: no
   *  screencast, no working/yellow status line, no tool messages. */
  is_visual_only?: boolean
}

export interface AgentLabelEntry {
  agent_id: string
  label: string
}

export interface BrowserClosedPayload {
  agent_id: string
  reason: string
  result_summary?: string
}

// Emitted by the workflow runner when a browser agent starts executing a
// workflow node, so the viewport gallery can label that viewport with the
// step it's currently on.
export interface WorkflowAgentNodePayload {
  run_id: string
  agent_id: string
  node_id: string
  node_title?: string
}

export interface AgentPriority {
  agent_id: string
  priority: 'high' | 'medium' | 'low'
  viewport_width?: number
  viewport_height?: number
}

export interface SessionStatePayload {
  browser_agents: BrowserSpawnedPayload[]
  stream_priorities: AgentPriority[]
  browser_agent_cap: number
  agent_labels?: AgentLabelEntry[]
  /** True while the workflow is genuinely executing — at least one browser
   *  agent in status=running OR a scheduled run in flight. Drives the
   *  workflow-list shimmer and the chat working-dots so a reloaded but idle
   *  workflow stops looking like it's working. */
  is_running?: boolean
  /** Classifies what's behind is_running so the SidePanel renders the right
   *  indicator: 'workflow' = workflow_run engine (manual run-from-dock or
   *  scheduled cron), 'chat' = orchestrator/agent activity in service of a
   *  chat turn. Empty/undefined when nothing is running. */
  running_kind?: 'chat' | 'workflow' | ''
  /** Per-session browser routing: 'server' (hosted Chromium) or 'extension'
   *  (user's paired MV3 Chrome). Echoed back on every session_state so the
   *  client can hydrate its picker on reconnect; the server canonicalises
   *  the value, treating any unknown string as 'server'. */
  browser_mode?: 'server' | 'extension'
  /** Per-session Agent Humaniser choice (Stealth tab). Echoed on every
   *  session_state so the toggle hydrates on reconnect. Only the midas browser
   *  driver acts on it. */
  humanize?: boolean
  /** Per-session cloaked-browser choice (Stealth tab). Echoed like humanize so
   *  the toggle hydrates on reconnect. Only the midas browser driver acts on it. */
  cloaked?: boolean
}

export interface WorkflowSaveRejectedPayload {
  name: string
  reason: string
}

export interface WorkflowRunEventPayload {
  run_id: string
  node_id?: string
  path?: string[]
  status?: string
  error?: string
  iteration?: number
  occurred_at?: string
}

export interface SpawnBrowserAgentPayload {
  /** Optional: seed the new agent with a "Navigate to <url>" task so the page is already
   * loaded when the viewport becomes visible. Used for restoring previous session URLs. */
  url?: string
}

export interface CloseBrowserAgentPayload {
  agent_id: string
}

export interface BrowserAgentReleasedPayload {
  agent_id: string
}

export interface TrackAddedPayload {
  agent_id: string
  track_id: string
  stream_id: string
}

export interface TrackRemovedPayload {
  agent_id: string
  track_id: string
}

export interface WebRTCAnswerPayload {
  sdp: string
}

export interface WebRTCRenegotiatePayload {
  sdp: string
}

export interface WebRTCICECandidatePayload {
  candidate: string
  sdp_mid: string
  sdp_mline_index: number
}

export interface ErrorPayload {
  code: string
  message: string
  recoverable: boolean
  agent_id?: string
}

export interface SessionExpiredPayload {
  reason: string
  idle_duration: string
}

export interface TitleResponsePayload {
  title: string
}

export interface ToolDescriptorPayload {
  agent_id: string
  text: string
}

export interface PageNavigatedPayload {
  agent_id: string
  url: string
}

/**
 * ExtensionReadyPayload is emitted by the server in two cases:
 *   - On session_state when the per-session browser mode is 'extension' and
 *     a paired extension is active (extension_id only, no port_token).
 *   - After a successful spawn in extension mode (carries session_name +
 *     port_token + TTL so the frontend can open a scoped screencast port).
 *
 * Port-token frames are single-use credentials for chrome.runtime.connect
 * to the user's extension; we trade them for a 'screencast' port that
 * carries JPEG frames as base64 strings.
 */
export interface ExtensionReadyPayload {
  extension_id: string
  session_name?: string
  port_token?: string
  ttl_seconds?: number
}

/**
 * CursorPositionPayload streams the live CDP cursor position the browser
 * driver (midas) is dispatching for an agent. (vw, vh) are the viewport's
 * CSS pixel dimensions, captured server-side, so the client can render the
 * overlay at a stable percentage regardless of how the screencast image is
 * scaled. Frames arrive only when the user has the "Display cursor" setting
 * enabled is irrelevant on the wire — the server always emits; the frontend
 * decides whether to render.
 */
export interface CursorPositionPayload {
  agent_id: string
  x: number
  y: number
  vw: number
  vh: number
}

export interface CursorState {
  x: number
  y: number
  vw: number
  vh: number
}

// ── Client → Server payloads ──────────────────────────────────────────────────

export interface UserMessagePayload {
  content: string
  attachments?: { id: string; name: string }[]
  agent_id?: string
  /** Persisted-row id for this user message. Frontend mints a UUID ahead of
   *  send so other features can reference it without waiting for the backend echo. */
  message_id?: string
  /** Set on the edit-resend path: the persisted-row id of the original prompt
   *  the user just edited. The server deletes that row + every later row from
   *  this transcript and truncates the orchestrator's in-memory History to
   *  match before persisting the replacement, so the LLM resumes from the
   *  same context the user sees in the chat panel. */
  replaces_message_id?: string
}

export interface StopAgentPayload {
  agent_id: string
}

export interface WebRTCOfferPayload {
  sdp: string
}

export interface WebRTCRenegotiateAnswerPayload {
  sdp: string
}

export interface StreamPriorityUpdatePayload {
  priorities: AgentPriority[]
}

export interface TitleRequestPayload {
  text: string
}

export interface UserLocationPayload {
  latitude: number
  longitude: number
  accuracy: number
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface ChatMessageAttachment {
  id: string
  name: string
  /** Character offset in `text` where this chip was anchored inline. Set by
   *  the composer on send/edit so display can interleave the chip with text;
   *  absent on server-loaded messages, which fall back to a grouped row. */
  position?: number
}

export interface ChatMessage {
  role: 'agent' | 'user'
  text: string
  /** For user messages: files attached when the message was sent */
  attachments?: ChatMessageAttachment[]
  /** Persisted-row id for this message (when known). User messages mint it
   *  client-side before send; assistant rows inherit it from the WS frame. */
  id?: string
  /** Inline vault picker when the orchestrator calls RequestCredential. */
  credentialRequest?: ChatCredentialRequest
  /** Inline 2FA code input when the orchestrator calls RequestOtp. */
  otpRequest?: ChatOtpRequest
  /** Inline artifact preview when a new gallery item is recorded. */
  artifactPreview?: SandboxArtifact
  /** Inline upgrade / weekly-budget prompt when a plan limit is hit during the
   *  chat (replaces the modal overlay while the chat view is visible). */
  upgradePrompt?: ChatUpgradePrompt
}

/** Viewport state for a browser agent — extends the UI config with `agentId` for backend association. */
export interface ViewportState {
  agentId: string
  url: string
  agentName: string
  currentAction: string
  isLoading: boolean
  /** Yellow status-line + 3-dot animation. True only when the server reports
   *  status=running for a live agent. Visual-only placeholders never set this. */
  isWorking: boolean
  /** Green status-line — agent finished its task successfully. */
  isDone: boolean
  /** Red status-line — agent ended in failed/stopped/interrupted. */
  isFailed: boolean
  /** Set when the viewport was hydrated from last_browser_states rather than a
   *  live agent. The screencast frame map will never receive a frame for it,
   *  the URL strip is the only meaningful surface. */
  isVisualOnly: boolean
  /** Client-side pin — pinned viewports sort to the top of the gallery. */
  isPinned?: boolean
  /** During a workflow run, the node this agent is currently executing. Set
   *  from `workflow_agent_node`; shown as a step badge so the viewport reflects
   *  which workflow node it's up to. Independent of `currentAction` (live tool
   *  action) so the two don't clobber each other. */
  currentNodeId?: string
  currentNodeTitle?: string
}

export interface ThinkingState {
  agentId: string
  action: string
  detail: string
  step?: number
  totalSteps?: number
}

/**
 * PendingCredentialRequest is the live state of an open vault picker for
 * the orchestrator. Cleared once the user provides creds (or cancels) and
 * the orchestrator has been notified via credential_provided.
 */
export interface PendingCredentialRequest {
  msgId: string
  site: string
  purpose: string
  suggestedUsername?: string
}

/** Inline credential picker embedded in an orchestrator chat message. */
export interface ChatCredentialRequest {
  msgId: string
  site: string
  purpose: string
  suggestedUsername?: string
  status: 'pending' | 'completed' | 'cancelled'
}

/**
 * OtpRequestPayload arrives when the agent calls RequestOtp — a browser
 * sub-agent hit a two-factor wall and needs the user to read the current
 * one-time code. The frontend renders an inline code input and replies with
 * OtpProvidedPayload.
 */
export interface OtpRequestPayload {
  msg_id: string
  site: string
  purpose: string
}

/**
 * OtpProvidedPayload is the client->server reply carrying the live 2FA code the
 * user entered. The server stashes it and injects it into the browser fill
 * below the model, so the code never travels through the model or transcript.
 * Set cancelled=true to signal the user dismissed the prompt.
 */
export interface OtpProvidedPayload {
  msg_id: string
  code: string
  cancelled?: boolean
}

/** Inline 2FA code input embedded in an orchestrator chat message. */
export interface ChatOtpRequest {
  msgId: string
  site: string
  purpose: string
  status: 'pending' | 'completed' | 'cancelled'
}

/**
 * ChatUpgradePrompt is an in-chat plan-limit prompt — the inline replacement
 * for the UpgradePlanModal overlay. Injected as a synthetic agent message when
 * a limit is hit while the chat view is visible. `payload` carries the same
 * reason/cap/onDismiss the modal would have received; `onDismiss` fires when
 * the user dismisses the card (e.g. clears the sticky over-budget flag).
 */
export interface ChatUpgradePrompt {
  msgId: string
  payload: UpgradePlanPayload
  status: 'pending' | 'dismissed'
}
