import { ref, reactive, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type {
  ChatMessage,
  ChatMessageAttachment,
  ThinkingState,
  PendingQuestion,
  AgentMessagePayload,
  AgentThinkingPayload,
  AskUserPayload,
  BrowserSpawnedPayload,
  BrowserAgentReleasedPayload,
  UserMessagePayload,
  UserReplyPayload,
  StopAgentPayload,
  TitleRequestPayload,
  TitleResponsePayload,
} from './types'
import type { SessionHandle } from './useSession'

interface ChatState {
  messages: Ref<ChatMessage[]>
  thinking: Ref<ThinkingState | null>
  pendingQuestion: Ref<PendingQuestion | null>
  waitingForAgent: Ref<boolean>
  streamingBuffer: { agentId: string; text: string } | null
}

export interface ChatHandle {
  readonly messages: Ref<ChatMessage[]>
  readonly thinking: Ref<ThinkingState | null>
  readonly pendingQuestion: Ref<PendingQuestion | null>
  readonly waitingForAgent: Ref<boolean>
  sendMessage(content: string, attachments?: ChatMessageAttachment[]): void
  editMessage(index: number, text: string, attachments: ChatMessageAttachment[]): void
  retryFromMessage(index: number): void
  sendReply(replyTo: string, content: string): void
  stopAgent(): void
  loadHistory(history: ChatMessage[]): void
}

export function useAgentChats(session: SessionHandle, sessionId: string) {
  const orchestratorState: ChatState = {
    messages: useState<ChatMessage[]>(`chat-messages-${sessionId}`, () => []),
    thinking: ref<ThinkingState | null>(null),
    pendingQuestion: ref<PendingQuestion | null>(null),
    waitingForAgent: ref(false),
    streamingBuffer: null,
  }

  const agentStates = new Map<string, ChatState>()
  const summarisedTitle = ref<string | null>(null)
  const drafts = reactive<Record<string, string>>({})

  function getState(chatId: string): ChatState {
    if (chatId === 'orchestrator') return orchestratorState
    if (!agentStates.has(chatId)) {
      agentStates.set(chatId, {
        messages: ref<ChatMessage[]>([]),
        thinking: ref<ThinkingState | null>(null),
        pendingQuestion: ref<PendingQuestion | null>(null),
        waitingForAgent: ref(false),
        streamingBuffer: null,
      })
    }
    return agentStates.get(chatId)!
  }

  function buildHandle(chatId: string): ChatHandle {
    const state = getState(chatId)

    function sendMessage(content: string, attachments?: ChatMessageAttachment[]) {
      const msg: ChatMessage = { role: 'user', text: content }
      if (attachments?.length) msg.attachments = attachments
      state.messages.value = [...state.messages.value, msg]
      state.waitingForAgent.value = true

      const payload: UserMessagePayload = { content }
      if (chatId !== 'orchestrator') payload.agent_id = chatId
      if (attachments?.length) payload.attachments = attachments.map(a => ({ id: a.id, name: a.name }))
      session.send<UserMessagePayload>('user_message', payload)
    }

    function editMessage(index: number, text: string, attachments: ChatMessageAttachment[]) {
      const updated = [...state.messages.value]
      const existing = updated[index]
      if (!existing) return
      updated[index] = { role: existing.role, text, action: existing.action, detail: existing.detail, attachments: attachments.length > 0 ? attachments : undefined }
      state.messages.value = updated
    }

    function retryFromMessage(agentMessageIndex: number) {
      let userIndex = -1
      for (let i = agentMessageIndex - 1; i >= 0; i--) {
        if (state.messages.value[i]!.role === 'user') { userIndex = i; break }
      }
      if (userIndex === -1) return

      const userMsg = state.messages.value[userIndex]
      if (!userMsg) return
      const content = userMsg.text
      const attachments = userMsg.attachments

      state.streamingBuffer = null
      state.thinking.value = null
      state.waitingForAgent.value = true
      state.messages.value = [...state.messages.value.slice(0, userIndex), { role: 'user', text: content, attachments }]

      const payload: UserMessagePayload = { content }
      if (chatId !== 'orchestrator') payload.agent_id = chatId
      if (attachments?.length) payload.attachments = attachments.map(a => ({ id: a.id, name: a.name }))
      session.send<UserMessagePayload>('user_message', payload)
    }

    function sendReply(replyTo: string, content: string) {
      state.pendingQuestion.value = null
      state.waitingForAgent.value = true
      state.messages.value = [...state.messages.value, { role: 'user', text: content }]
      session.send<UserReplyPayload>('user_reply', { reply_to: replyTo, content })
    }

    function stopAgent() {
      session.send<StopAgentPayload>('stop_agent', { agent_id: chatId })
      state.thinking.value = null
      state.waitingForAgent.value = false
    }

    function loadHistory(history: ChatMessage[]) {
      if (history.length > 0 && state.messages.value.length === 0) {
        state.messages.value = history
      }
    }

    return {
      messages: state.messages,
      thinking: state.thinking,
      pendingQuestion: state.pendingQuestion,
      waitingForAgent: state.waitingForAgent,
      sendMessage,
      editMessage,
      retryFromMessage,
      sendReply,
      stopAgent,
      loadHistory,
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  function handleAgentMessage(p: AgentMessagePayload) {
    const chatId = p.agent_id || 'orchestrator'
    const state = getState(chatId)

    if (p.is_partial) {
      if (!state.streamingBuffer || state.streamingBuffer.agentId !== p.agent_id) {
        state.streamingBuffer = { agentId: p.agent_id, text: p.content }
        state.messages.value = [...state.messages.value, { role: 'agent', text: p.content }]
      } else {
        state.streamingBuffer.text += p.content
        const updated = [...state.messages.value]
        updated[updated.length - 1] = { role: 'agent', text: state.streamingBuffer.text }
        state.messages.value = updated
      }
    } else {
      if (state.streamingBuffer) {
        const finalText = state.streamingBuffer.text + p.content
        const updated = [...state.messages.value]
        updated[updated.length - 1] = { role: 'agent', text: finalText }
        state.messages.value = updated
      } else if (p.content) {
        state.messages.value = [...state.messages.value, { role: 'agent', text: p.content }]
      }
      state.streamingBuffer = null
      state.thinking.value = null
      state.waitingForAgent.value = false
    }
  }

  function handleAgentThinking(p: AgentThinkingPayload) {
    const chatId = p.agent_id || 'orchestrator'
    const state = getState(chatId)

    state.thinking.value = {
      agentId: p.agent_id,
      action: p.action,
      detail: p.detail,
      step: p.step,
      totalSteps: p.total_steps,
    }

    const last = state.messages.value[state.messages.value.length - 1]
    if (last?.role === 'thinking') {
      const updated = [...state.messages.value]
      updated[updated.length - 1] = {
        role: 'thinking',
        text: p.action,
        action: p.action,
        detail: (last.detail ?? '') + '\n' + p.detail,
      }
      state.messages.value = updated
      return
    }

    state.messages.value = [...state.messages.value, {
      role: 'thinking',
      text: p.action,
      action: p.action,
      detail: p.detail,
    }]
  }

  function handleAskUser(p: AskUserPayload) {
    orchestratorState.waitingForAgent.value = false
    orchestratorState.pendingQuestion.value = {
      msgId: p.msg_id,
      question: p.question,
      options: p.options,
    }
  }

  function handleBrowserSpawned(_p: BrowserSpawnedPayload) {
    if (orchestratorState.streamingBuffer) {
      orchestratorState.streamingBuffer = null
      orchestratorState.thinking.value = null
    }
  }

  function handleBrowserAgentReleased(p: BrowserAgentReleasedPayload) {
    agentStates.delete(p.agent_id)
    delete drafts[p.agent_id]
  }

  function handleTitleResponse(p: TitleResponsePayload) {
    if (p.title) summarisedTitle.value = p.title
  }

  session.on<AgentMessagePayload>('agent_message', handleAgentMessage)
  session.on<AgentThinkingPayload>('agent_thinking', handleAgentThinking)
  session.on<AskUserPayload>('ask_user', handleAskUser)
  session.on<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  session.on<BrowserAgentReleasedPayload>('browser_agent_released', handleBrowserAgentReleased)
  session.on<TitleResponsePayload>('title_response', handleTitleResponse)

  onUnmounted(() => {
    session.off('agent_message', handleAgentMessage)
    session.off('agent_thinking', handleAgentThinking)
    session.off('ask_user', handleAskUser)
    session.off('browser_spawned', handleBrowserSpawned)
    session.off('browser_agent_released', handleBrowserAgentReleased)
    session.off('title_response', handleTitleResponse)
  })

  return {
    drafts,
    summarisedTitle,
    orchestrator: buildHandle('orchestrator'),
    get(agentId: string): ChatHandle { return buildHandle(agentId) },
    drop(agentId: string) {
      agentStates.delete(agentId)
      delete drafts[agentId]
    },
    requestTitle(text: string) {
      session.send<TitleRequestPayload>('title_request', { text })
    },
  }
}
