import { ref, readonly, onUnmounted } from 'vue'
import type {
  ChatMessage,
  ChatMessageAttachment,
  ThinkingState,
  PendingQuestion,
  AgentMessagePayload,
  AgentThinkingPayload,
  AskUserPayload,
  BrowserSpawnedPayload,
  BrowserClosedPayload,
  UserMessagePayload,
  UserReplyPayload,
  StopAgentPayload,
  TitleRequestPayload,
  TitleResponsePayload,
  ToolUsePayload,
} from './types'
import type { SessionHandle } from './useSession'

const toolDisplayNames: Record<string, string> = {
  MessageAgent: 'Message Agent',
  CheckAgent: 'Check Agent',
  StopAgent: 'Stop Agent',
  ListAgents: 'List Agents',
  WebSearch: 'Web Search',
  Question: 'Question',
  Bash: 'Bash',
  SaveWorkflow: 'Save Workflow',
}

function humaniseToolName(name: string): string {
  return toolDisplayNames[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function useChat(session: SessionHandle, sessionId: string) {
  const messages = useState<ChatMessage[]>(`chat-messages-${sessionId}`, () => [])
  const thinking = ref<ThinkingState | null>(null)
  const pendingQuestion = ref<PendingQuestion | null>(null)
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
        detail: (last.detail ?? '') + '\n' + p.detail,
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

  function handleToolUse(p: ToolUsePayload) {
    if (p.agent_id !== 'orchestrator') return

    // If there was in-progress streaming text before the tool call, discard it
    // (the model produced intermediate reasoning, not a user-facing answer).
    if (streamingBuffer) {
      const updated = [...messages.value]
      const lastIdx = updated.length - 1
      if (lastIdx >= 0 && updated[lastIdx]!.role === 'agent') {
        updated.splice(lastIdx, 1)
        messages.value = updated
      }
      streamingBuffer = null
    }

    const display = humaniseToolName(p.tool_name)
    messages.value = [...messages.value, { role: 'tool', text: display, toolName: p.tool_name }]
  }

  function handleAskUser(p: AskUserPayload) {
    waitingForAgent.value = false
    pendingQuestion.value = {
      msgId: p.msg_id,
      question: p.question,
      options: p.options,
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
  session.on<AgentThinkingPayload>('agent_thinking', handleAgentThinking)
  session.on<ToolUsePayload>('tool_use', handleToolUse)
  session.on<AskUserPayload>('ask_user', handleAskUser)
  session.on<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  session.on<BrowserClosedPayload>('browser_closed', handleBrowserClosed)
  session.on<TitleResponsePayload>('title_response', handleTitleResponse)

  onUnmounted(() => {
    session.off('agent_message', handleAgentMessage)
    session.off('agent_thinking', handleAgentThinking)
    session.off('tool_use', handleToolUse)
    session.off('ask_user', handleAskUser)
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
    updated[index] = {
      ...updated[index],
      text: content,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
    messages.value = updated
  }

  function retryFromMessage(agentMessageIndex: number) {
    let userIndex = -1
    for (let i = agentMessageIndex - 1; i >= 0; i--) {
      if (messages.value[i]!.role === 'user') {
        userIndex = i
        break
      }
    }
    if (userIndex === -1) return

    const userMsg = messages.value[userIndex]!
    const content = userMsg.text
    const attachments = userMsg.attachments

    streamingBuffer = null
    thinking.value = null
    waitingForAgent.value = true

    messages.value = [...messages.value.slice(0, userIndex), { role: 'user', text: content, attachments }]

    const payload: UserMessagePayload = { content }
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(a => ({ id: a.id, name: a.name }))
    }
    session.send<UserMessagePayload>('user_message', payload)
  }

  function sendReply(replyTo: string, content: string) {
    pendingQuestion.value = null
    waitingForAgent.value = true
    messages.value = [...messages.value, { role: 'user', text: content }]
    session.send<UserReplyPayload>('user_reply', { reply_to: replyTo, content })
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
    pendingQuestion: readonly(pendingQuestion),
    summarisedTitle: readonly(summarisedTitle),
    waitingForAgent: readonly(waitingForAgent),
    sendMessage,
    editMessage,
    retryFromMessage,
    sendReply,
    stopAgent,
    requestTitle,
    loadHistory,
  }
}
