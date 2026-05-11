import { ref, reactive, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type {
  ChatMessage,
  ChatMessageAttachment,
  ThinkingState,
  PendingCredentialRequest,
  AgentMessagePayload,
  AgentMessageBoundaryPayload,
  AgentThinkingPayload,
  BrowserSpawnedPayload,
  BrowserAgentReleasedPayload,
  CredentialRequestPayload,
  CredentialProvidedPayload,
  UserMessagePayload,
  TitleRequestPayload,
  TitleResponsePayload,
  SessionStatePayload,
  StopAgentPayload,
} from '../types'

interface ChatState {
  messages: Ref<ChatMessage[]>
  thinking: Ref<ThinkingState | null>
  waitingForAgent: Ref<boolean>
  // True while a partial agent_message is actively producing text (streamingBuffer set,
  // not yet sealed by agent_message_boundary or the final agent_message). The chat UI
  // uses this with waitingForAgent to keep the working indicator visible during silent
  // gaps in the turn — between continuation rounds, while a browser sub-agent is running,
  // or before the first text chunk arrives.
  isStreaming: Ref<boolean>
  streamingBuffer: { agentId: string; text: string } | null
}

export interface ChatHandle {
  readonly messages: Ref<ChatMessage[]>
  readonly thinking: Ref<ThinkingState | null>
  readonly waitingForAgent: Ref<boolean>
  readonly isStreaming: Ref<boolean>
  sendMessage(content: string, attachments?: ChatMessageAttachment[]): void
  editMessage(index: number, text: string, attachments: ChatMessageAttachment[]): void
  loadHistory(history: ChatMessage[]): void
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Pre-randomUUID fallback (mirrors the one in useDeviceId).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function newChatState(): ChatState {
  return {
    messages: ref<ChatMessage[]>([]),
    thinking: ref<ThinkingState | null>(null),
    waitingForAgent: ref(false),
    isStreaming: ref(false),
    streamingBuffer: null,
  }
}

export function useAgentChats(session: SessionHandle) {
  // Plain `ref`, not `useState`: workflow switches remount the parent page, and
  // an unmounted-then-remounted workflow must rehydrate from the DB rather than
  // from a stale slot that captured a half-streamed partial before the previous
  // WS was torn down. Sub-agent state (see `getState` below) was already a
  // plain `ref` for the same reason; the orchestrator was the lone outlier.
  const orchestratorState: ChatState = newChatState()

  const agentStates = new Map<string, ChatState>()
  const summarisedTitle = ref<string | null>(null)
  const drafts = reactive<Record<string, string>>({})

  function getState(chatId: string): ChatState {
    if (chatId === 'orchestrator') return orchestratorState
    if (!agentStates.has(chatId)) {
      agentStates.set(chatId, newChatState())
    }
    return agentStates.get(chatId)!
  }

  function buildHandle(chatId: string): ChatHandle {
    const state = getState(chatId)

    function sendMessage(content: string, attachments?: ChatMessageAttachment[]) {
      const id = newId()
      const msg: ChatMessage = { role: 'user', text: content, id }
      if (attachments?.length) msg.attachments = attachments
      // Seal any in-progress streaming bubble before pushing the user message:
      // a mid-turn send interrupts the orchestrator (the backend's defer fires
      // OnMessage("", false), and a few in-flight partial chunks may still
      // arrive). Both code paths in handleAgentMessage rewrite messages[length-1]
      // when streamingBuffer is set — without this reset, that rewrites the
      // user message we just appended and the prompt disappears from the panel.
      state.streamingBuffer = null
      state.isStreaming.value = false
      state.messages.value = [...state.messages.value, msg]
      state.waitingForAgent.value = true

      const payload: UserMessagePayload = { content, message_id: id }
      if (chatId !== 'orchestrator') payload.agent_id = chatId
      if (attachments?.length) payload.attachments = attachments.map(a => ({ id: a.id, name: a.name }))
      session.send<UserMessagePayload>('user_message', payload)
    }

    function editMessage(index: number, text: string, attachments: ChatMessageAttachment[]) {
      const existing = state.messages.value[index]
      if (!existing || existing.role !== 'user') return

      const atts = attachments.length > 0 ? attachments : undefined
      const id = newId()
      const edited: ChatMessage = { role: 'user', text, id }
      if (atts) edited.attachments = atts

      // Carry the original prompt's persisted id back to the server so it can
      // delete that row + every reply that followed it from the DB and
      // truncate the orchestrator's in-memory History before the new turn
      // starts. Without this, on reload the user sees the original prompt
      // and its reply re-appear above the edited message. May be undefined
      // for legacy in-memory rows that predate client-side id minting; the
      // server treats absent/unknown ids as a no-op truncation.
      const replacesMessageID = existing.id

      state.streamingBuffer = null
      state.isStreaming.value = false
      state.thinking.value = null
      state.waitingForAgent.value = true
      state.messages.value = [...state.messages.value.slice(0, index), edited]

      const payload: UserMessagePayload = { content: text, message_id: id }
      if (chatId !== 'orchestrator') payload.agent_id = chatId
      if (atts) payload.attachments = atts.map(a => ({ id: a.id, name: a.name }))
      if (replacesMessageID) payload.replaces_message_id = replacesMessageID
      session.send<UserMessagePayload>('user_message', payload)
    }

    function loadHistory(history: ChatMessage[]) {
      if (history.length === 0) return
      // Always replace from DB on rehydrate. Race we're closing: when a
      // workflow remounts, useWorkflowSession's WS connect runs in parallel with
      // [id].vue's fetchMessages. If a live agent_thinking / agent_message
      // event lands before the DB read resolves, it appends to state.messages
      // — and the old guard (`messages.value.length !== 0` → bail) then
      // dropped the entire persisted history on the floor. The user sees
      // only fragments of the live turn until they refresh. Replacing
      // unconditionally here gives the DB the final word; subsequent live
      // events continue from the rehydrated tail. We also drop the
      // pre-fetch stream/thinking residue so the next chunk starts a clean
      // bubble instead of trying to extend a now-deleted partial.
      state.messages.value = history
      state.streamingBuffer = null
      state.isStreaming.value = false
      state.thinking.value = null
      // Restore the working indicator iff the orchestrator was still mid-turn
      // when we last left this workflow (last persisted message is the user's
      // prompt with no agent reply yet). Otherwise clear it — coming back to
      // a workflow whose response landed in the DB while we were away should
      // not look like it's still thinking.
      state.waitingForAgent.value = history[history.length - 1]?.role === 'user'
    }

    return {
      messages: state.messages,
      thinking: state.thinking,
      waitingForAgent: state.waitingForAgent,
      isStreaming: state.isStreaming,
      sendMessage,
      editMessage,
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
        const target = updated[updated.length - 1]
        if (target && target.role === 'agent') {
          updated[updated.length - 1] = { ...target, text: state.streamingBuffer.text }
          state.messages.value = updated
        }
      }
      state.isStreaming.value = true
      // Re-arm waitingForAgent: covers the case where the user returned to
      // this workflow mid-turn (after the first continuation round had
      // already sealed to the DB) and loadHistory cleared the flag because
      // the last persisted message looked terminal. Live partials prove
      // the orchestrator is still working.
      state.waitingForAgent.value = true
    } else {
      if (state.streamingBuffer) {
        const finalText = state.streamingBuffer.text + p.content
        const updated = [...state.messages.value]
        const target = updated[updated.length - 1]
        if (target && target.role === 'agent') {
          updated[updated.length - 1] = { ...target, text: finalText, id: p.message_id || target.id }
          state.messages.value = updated
        }
      } else if (p.content) {
        state.messages.value = [...state.messages.value, { role: 'agent', text: p.content, id: p.message_id }]
      }
      state.streamingBuffer = null
      state.isStreaming.value = false
      state.thinking.value = null
      state.waitingForAgent.value = false
    }
  }

  function handleAgentMessageBoundary(p: AgentMessageBoundaryPayload) {
    const chatId = p.agent_id || 'orchestrator'
    const state = getState(chatId)
    state.streamingBuffer = null
    // Sealing the bubble between continuation rounds: the turn is still alive
    // (waitingForAgent stays true) but we are no longer producing text. Drop
    // isStreaming so the working indicator surfaces during the gap before the
    // next round begins streaming.
    state.isStreaming.value = false
  }

  function handleAgentThinking(p: AgentThinkingPayload) {
    const chatId = p.agent_id || 'orchestrator'
    const state = getState(chatId)

    // Re-arm waitingForAgent (see handleAgentMessage partial path for why):
    // a thinking event proves the agent is actively working, even if the
    // most recent persisted message looked terminal at remount time.
    state.waitingForAgent.value = true

    state.thinking.value = {
      agentId: p.agent_id,
      action: p.action,
      detail: p.detail,
      step: p.step,
      totalSteps: p.total_steps,
    }
  }

  // pendingCredentialRequest is orchestrator-only — credential capture is
  // always initiated by the orchestrator when a sub-agent hits a login wall;
  // browser sub-agents never invoke RequestCredential directly.
  const pendingCredentialRequest = ref<PendingCredentialRequest | null>(null)

  function handleCredentialRequest(p: CredentialRequestPayload) {
    orchestratorState.waitingForAgent.value = false
    pendingCredentialRequest.value = {
      msgId: p.msg_id,
      site: p.site,
      purpose: p.purpose,
      suggestedUsername: p.suggested_username,
    }
  }

  function handleBrowserSpawned(_p: BrowserSpawnedPayload) {
    // Re-arm waitingForAgent — same reason as the partial / thinking paths:
    // the orchestrator is actively delegating, so the indicator should stay
    // up even if loadHistory just cleared it on rehydrate.
    orchestratorState.waitingForAgent.value = true
    if (orchestratorState.streamingBuffer) {
      orchestratorState.streamingBuffer = null
      orchestratorState.isStreaming.value = false
      orchestratorState.thinking.value = null
    }
  }

  function handleBrowserAgentReleased(p: BrowserAgentReleasedPayload) {
    agentStates.delete(p.agent_id)
    delete drafts[p.agent_id]
  }

  // session_state lands on every WS (re)connect. If any browser sub-agent is
  // still running, the orchestrator is necessarily mid-turn — only it can
  // spawn them and only it consumes their results — so the working indicator
  // should stay up even though loadHistory may have cleared waitingForAgent
  // based on the last persisted message. Without this, returning to a
  // workflow during a long-running browser delegation looks like the chat
  // settled even though work is still happening in the viewport.
  function handleSessionState(p: SessionStatePayload) {
    const anyRunning = (p.browser_agents ?? []).some(a => a.status === 'running')
    if (anyRunning) orchestratorState.waitingForAgent.value = true
  }

  function handleTitleResponse(p: TitleResponsePayload) {
    if (p.title) summarisedTitle.value = p.title
  }

  // Register handler + queue its teardown in one call so registration and
  // cleanup stay in lockstep (no risk of adding a `session.on` and forgetting
  // the matching `session.off` in onUnmounted).
  const teardowns: Array<() => void> = []
  function bind<T>(type: string, handler: (payload: T) => void) {
    session.on<T>(type, handler)
    teardowns.push(() => session.off(type, handler))
  }

  bind<AgentMessagePayload>('agent_message', handleAgentMessage)
  bind<AgentMessageBoundaryPayload>('agent_message_boundary', handleAgentMessageBoundary)
  bind<AgentThinkingPayload>('agent_thinking', handleAgentThinking)
  bind<CredentialRequestPayload>('credential_request', handleCredentialRequest)
  bind<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  bind<BrowserAgentReleasedPayload>('browser_agent_released', handleBrowserAgentReleased)
  bind<TitleResponsePayload>('title_response', handleTitleResponse)
  bind<SessionStatePayload>('session_state', handleSessionState)

  onUnmounted(() => {
    for (const teardown of teardowns) teardown()
  })

  /**
   * provideCredential ships a vault-picker result back to the orchestrator.
   * Pass cancelled=true (with the other fields blank) to abandon the
   * request — the orchestrator will surface the blocker on its next turn
   * instead of stalling on the awaiting tool call.
   */
  function provideCredential(
    msgId: string,
    payload: { credentialId: string, username: string, password: string } | { cancelled: true },
  ) {
    pendingCredentialRequest.value = null
    orchestratorState.waitingForAgent.value = true
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

  return {
    drafts,
    summarisedTitle,
    pendingCredentialRequest,
    provideCredential,
    orchestrator: buildHandle('orchestrator'),
    get(agentId: string): ChatHandle { return buildHandle(agentId) },
    drop(agentId: string) {
      agentStates.delete(agentId)
      delete drafts[agentId]
    },
    requestTitle(text: string) {
      session.send<TitleRequestPayload>('title_request', { text })
    },
    stopAgent(agentId: string) {
      session.send<StopAgentPayload>('stop_agent', { agent_id: agentId })
    },
  }
}

export type AgentChatsHandle = ReturnType<typeof useAgentChats>
