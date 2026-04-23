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

export interface AgentThinkingPayload {
  agent_id: string
  action: string
  detail: string
  step?: number
  total_steps?: number
}

export interface AskUserPayload {
  msg_id: string
  question: string
  options?: string[]
}

export interface BrowserSpawnedPayload {
  agent_id: string
  task: string
  session_name: string
  cdp_endpoint?: string
  label?: string
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
  mode?: 'builder' | 'general'
}

export type SessionMode = 'builder' | 'general'

export interface SetSessionModePayload {
  mode: SessionMode
}

export interface SessionModeChangedPayload {
  mode: SessionMode
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

export interface UserReplyPayload {
  reply_to: string
  content: string
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

export interface PendingQuestion {
  msgId: string
  question: string
  options?: string[]
}
