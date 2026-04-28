// ── Connection ────────────────────────────────────────────────────────────────

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
 * CredentialProvidedPayload is the reply the frontend sends back. password
 * is included so the orchestrator can hand it straight to the browser
 * sub-agent for the immediate fill — credential_id keeps a reference for
 * future runs to fetch silently via FetchCredential. Set cancelled=true to
 * signal the user dismissed the modal.
 */
export interface CredentialProvidedPayload {
  msg_id: string
  credential_id: string
  username: string
  password: string
  cancelled?: boolean
}

export interface BrowserSpawnedPayload {
  agent_id: string
  task: string
  session_name: string
  cdp_endpoint?: string
  label?: string
  /** Last-known lifecycle status; only set on session_state re-sync. */
  status?: 'running' | 'completed' | 'failed' | 'stopped' | string
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

// ── Client → Server payloads ──────────────────────────────────────────────────

export interface UserMessagePayload {
  content: string
  attachments?: { id: string; name: string }[]
  agent_id?: string
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
}

export interface ChatMessage {
  role: 'agent' | 'user' | 'thinking'
  text: string
  /** For thinking entries: the collapsed action summary line */
  action?: string
  /** For thinking entries: accumulated detail text (expandable) */
  detail?: string
  /** For user messages: files attached when the message was sent */
  attachments?: ChatMessageAttachment[]
}

/** Viewport state for a browser agent — extends the UI config with `agentId` for backend association. */
export interface ViewportState {
  agentId: string
  url: string
  agentName: string
  currentAction: string
  isLoading: boolean
  isWorking: boolean
  isDone: boolean
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
