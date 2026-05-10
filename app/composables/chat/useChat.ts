import { ref, readonly, onUnmounted } from 'vue'
import type {
  ChatMessage,
  ChatMessageAttachment,
  ThinkingState,
  PendingCredentialRequest,
  AgentMessagePayload,
  AgentMessageBoundaryPayload,
  AgentThinkingPayload,
  BrowserSpawnedPayload,
  BrowserClosedPayload,
  CredentialRequestPayload,
  CredentialProvidedPayload,
  UserMessagePayload,
  StopAgentPayload,
  TitleRequestPayload,
  TitleResponsePayload,
} from '../types'
import type { SessionHandle } from '../auth/useSession'

const toolDisplayNames: Record<string, string> = {
  MessageAgent: 'Message Agent',
  CheckAgent: 'Check Agent',
  StopAgent: 'Stop Agent',
  ListAgents: 'List Agents',
  WebSearch: 'Web Search',
  Bash: 'Bash',
  SaveWorkflow: 'Save Workflow',
  FetchLocation: 'Fetch Location',
}

function humaniseToolName(name: string): string {
  return toolDisplayNames[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function useChat(session: SessionHandle, sessionId: string) {
  const messages = useState<ChatMessage[]>(`chat-messages-${sessionId}`, () => [])
  const thinking = ref<ThinkingState | null>(null)
  const pendingCredentialRequest = ref<PendingCredentialRequest | null>(null)
  const summarisedTitle = ref<string | null>(null)
  const waitingForAgent = ref(false)

  let streamingBuffer: { agentId: string; text: string } | null = null

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAgentMessage(p: AgentMessagePayload) {
    if (p.is_partial) {
      if (!streamingBuffer || streamingBuffer.agentId !== p.agent_id) {
        streamingBuffer = { agentId: p.agent_id, text: p.content }
        messages.value = [...messages.value, { role: 'agent', text: p.content }]
      } else {
        streamingBuffer.text += p.content
        const updated = [...messages.value]
        updated[updated.length - 1] = { role: 'agent', text: streamingBuffer.text }
        messages.value = updated
      }
    } else {
      if (streamingBuffer) {
        const finalText = streamingBuffer.text + p.content
        const updated = [...messages.value]
        updated[updated.length - 1] = { role: 'agent', text: finalText }
        messages.value = updated
      } else if (p.content) {
        messages.value = [...messages.value, { role: 'agent', text: p.content }]
      }
      streamingBuffer = null
      thinking.value = null
      waitingForAgent.value = false
    }
  }

  function handleAgentMessageBoundary(_p: AgentMessageBoundaryPayload) {
    // Mid-turn boundary: seal the current bubble so the next chunk starts a
    // fresh one. The turn is still active — leave thinking/waitingForAgent.
    streamingBuffer = null
  }

  function handleAgentThinking(p: AgentThinkingPayload) {
    if (p.agent_id !== 'orchestrator') return

    thinking.value = {
      agentId: p.agent_id,
      action: p.action,
      detail: p.detail,
      step: p.step,
      totalSteps: p.total_steps,
    }

    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'thinking') {
      const updated = [...messages.value]
      updated[updated.length - 1] = {
        role: 'thinking',
        text: p.action,
        action: p.action,
        detail: (last.detail ?? '') + p.detail,
      }
      messages.value = updated
      return
    }

    messages.value = [...messages.value, {
      role: 'thinking',
      text: p.action,
      action: p.action,
      detail: p.detail,
    }]
  }

  function handleCredentialRequest(p: CredentialRequestPayload) {
    waitingForAgent.value = false
    pendingCredentialRequest.value = {
      msgId: p.msg_id,
      site: p.site,
      purpose: p.purpose,
      suggestedUsername: p.suggested_username,
    }
  }

  function handleBrowserSpawned(_p: BrowserSpawnedPayload) {
    if (streamingBuffer) {
      streamingBuffer = null
      thinking.value = null
    }
  }

  function handleBrowserClosed(_p: BrowserClosedPayload) {
    // No-op; viewport removal is handled by useViewports.
  }

  function handleTitleResponse(p: TitleResponsePayload) {
    if (p.title) {
      summarisedTitle.value = p.title
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  session.on<AgentMessagePayload>('agent_message', handleAgentMessage)
  session.on<AgentMessageBoundaryPayload>('agent_message_boundary', handleAgentMessageBoundary)
  session.on<AgentThinkingPayload>('agent_thinking', handleAgentThinking)
  session.on<CredentialRequestPayload>('credential_request', handleCredentialRequest)
  session.on<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  session.on<BrowserClosedPayload>('browser_closed', handleBrowserClosed)
  session.on<TitleResponsePayload>('title_response', handleTitleResponse)

  onUnmounted(() => {
    session.off('agent_message', handleAgentMessage)
    session.off('agent_message_boundary', handleAgentMessageBoundary)
    session.off('agent_thinking', handleAgentThinking)
    session.off('credential_request', handleCredentialRequest)
    session.off('browser_spawned', handleBrowserSpawned)
    session.off('browser_closed', handleBrowserClosed)
    session.off('title_response', handleTitleResponse)
  })

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function sendMessage(content: string, attachments?: ChatMessageAttachment[]) {
    const msg: ChatMessage = { role: 'user', text: content }
    if (attachments && attachments.length > 0) {
      msg.attachments = attachments
    }
    messages.value = [...messages.value, msg]
    waitingForAgent.value = true

    const payload: UserMessagePayload = { content }
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(a => ({ id: a.id, name: a.name }))
    }
    session.send<UserMessagePayload>('user_message', payload)
  }

  function editMessage(index: number, content: string, attachments: ChatMessageAttachment[]) {
    const updated = [...messages.value]
    const existing = updated[index]
    if (!existing) return
    updated[index] = {
      ...existing,
      text: content,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
    messages.value = updated
  }

  /**
   * provideCredential ships a vault-picker result back to the orchestrator.
   * Pass cancelled=true (with the other fields blank) to abandon the request
   * — the orchestrator will surface the blocker to the user on its next turn
   * instead of stalling on the awaiting tool call.
   */
  function provideCredential(
    msgId: string,
    payload: { credentialId: string, username: string, password: string } | { cancelled: true },
  ) {
    pendingCredentialRequest.value = null
    waitingForAgent.value = true
    if ('cancelled' in payload) {
      session.send<CredentialProvidedPayload>('credential_provided', {
        msg_id: msgId,
        credential_id: '',
        username: '',
        password: '',
        cancelled: true,
      })
      return
    }
    session.send<CredentialProvidedPayload>('credential_provided', {
      msg_id: msgId,
      credential_id: payload.credentialId,
      username: payload.username,
      password: payload.password,
    })
  }

  function stopAgent(agentId: string) {
    session.send<StopAgentPayload>('stop_agent', { agent_id: agentId })
    thinking.value = null
    waitingForAgent.value = false
  }

  function requestTitle(text: string) {
    session.send<TitleRequestPayload>('title_request', { text })
  }

  function loadHistory(history: ChatMessage[]) {
    if (history.length > 0 && messages.value.length === 0) {
      messages.value = history
    }
  }

  return {
    messages: readonly(messages),
    thinking: readonly(thinking),
    pendingCredentialRequest: readonly(pendingCredentialRequest),
    summarisedTitle: readonly(summarisedTitle),
    waitingForAgent: readonly(waitingForAgent),
    sendMessage,
    editMessage,
    provideCredential,
    stopAgent,
    requestTitle,
    loadHistory,
  }
}
