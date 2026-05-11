<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, CursorState, ViewportState } from '~/composables/types'
import type { SessionHandle } from '~/composables/workflows/useWorkflowSession'
import type { ViewMode } from '~/components/chat/ChatLayout.vue'

const sessionId = inject<Ref<string>>('workflow-id')!
const chats = inject<any>('chat-chats')!
const messageFeedback = inject<{
  feedback: Ref<Map<string, 'up' | 'down'>>
  setRating: (id: string, rating: 'up' | 'down' | null) => Promise<void>
}>('chat-message-feedback')!
const vp = inject<any>('chat-vp')!
const screencast = inject<any>('chat-screencast')!
const chatTitle = inject<Ref<string>>('chat-title')!
const isNewChat = inject<Ref<boolean>>('chat-is-new')!
const welcome = inject<Ref<boolean>>('chat-welcome')!
const viewportList = inject<Ref<any>>('chat-viewport-list')!
const userName = inject<string>('chat-user-name')!
const welcomeSuggestion = inject<string>('chat-welcome-suggestion')!
const presetPrompt = inject<string>('chat-preset-prompt')!
const titleRequested = inject<Ref<boolean>>('chat-title-requested')!
const viewMode = inject<Ref<ViewMode>>('chat-view-mode')!
const armAutoSwitch = inject<() => void>('chat-arm-auto-switch')!
const onRename = inject<(title: string) => Promise<void>>('chat-on-rename')!
const onCloseViewport = inject<(agentId: string) => void>('chat-on-close-viewport')!
const onSpawnBrowserAgent = inject<() => void>('chat-on-spawn-browser-agent')!
const session = inject<SessionHandle>('chat-session')!

const reconnecting = computed(
  () => session.status.value === 'connecting' || session.status.value === 'reconnecting',
)

const { settings: userSettings } = useUserSettings()
const showCursor = computed(() => userSettings.value.show_cursor_overlay)

// Drives the working indicator across silent gaps: while the orchestrator is
// waiting on a browser sub-agent's result, no agent_thinking / agent_message
// events fire on the orchestrator, but work is still happening — the dots
// should keep pulsing.
const browserAgentsActive = computed(() =>
  (vp.viewports.value as ViewportState[]).some(v => v.isWorking),
)

const { consumePendingPrompt } = useWorkflowList()

// All chat goes to the orchestrator. Individual browser-agent chat is
// intentionally unreachable — the orchestrator is the sole manager.
const currentChat = computed(() => chats.orchestrator)

const command = computed({
  get: () => chats.drafts['orchestrator'] ?? '',
  set: (val: string) => {
    chats.drafts['orchestrator'] = val
  },
})

function onSend(value: string, attachments?: ChatMessageAttachment[]) {
  const t = value.trim()
  if (!t) return
  command.value = ''

  if (!titleRequested.value && isNewChat.value) {
    titleRequested.value = true
    chats.requestTitle(`User: ${t}`)
  }

  armAutoSwitch()
  currentChat.value.sendMessage(t, attachments)
}

function onEditMessage(index: number, text: string, attachments: ChatMessageAttachment[]) {
  armAutoSwitch()
  currentChat.value.editMessage(index, text, attachments)
}

function onFeedbackChange(messageId: string, rating: 'up' | 'down' | null) {
  void messageFeedback.setRating(messageId, rating)
}

// Stop a single browser agent's current work. Routes through the chat layer
// because `stop_agent` is processed via the orchestrator's StopSubagent path
// (cancel mid-task + release the pool slot) — same primitive the orchestrator
// itself uses, just user-triggered from the viewport's run/stop control.
function onStopAgent(agentId: string) {
  chats.stopAgent(agentId)
}

// "Continue" / re-run hook for an idle viewport. No first-class server API
// exists for resuming a sub-agent yet, so this is intentionally a no-op
// scaffold — the Viewport's onRun prop is still wired so the play button
// renders enabled in the UI, but the click doesn't drive any backend action
// until a continue/resume message type lands on the protocol.
function onRunAgent(_agentId: string) {
  // TODO: wire to a server-side "continue agent" message when available.
}

// Pick up a draft stashed during session promotion and fire it immediately.
// Calling onSend now pushes the optimistic user bubble into orchestrator
// state synchronously — the welcome view goes away on the same tick the
// page mounts. The WS frame itself is buffered inside useWorkflowSession until the
// socket reaches OPEN, so we don't have to wait here.
onMounted(() => {
  const pending = consumePendingPrompt(sessionId.value)
  if (!pending) return
  onSend(pending.text, pending.attachments)
})
</script>

<template>
  <ChatLayout
    v-model:command="command"
    v-model:viewport-list="viewportList"
    v-model:view-mode="viewMode"
    :welcome="welcome"
    :chat-title="chatTitle"
    :renameable="!isNewChat"
    :user-name="userName"
    :welcome-suggestion="welcomeSuggestion"
    :messages="(currentChat.messages.value as ChatMessage[])"
    :is-streaming="currentChat.isStreaming.value"
    :waiting-for-agent="currentChat.waitingForAgent.value"
    :browser-agents-active="browserAgentsActive"
    :frame-urls="(screencast.frameUrls.value as Map<string, string>)"
    :cursor-positions="(screencast.cursorPositions.value as Map<string, CursorState>)"
    :show-cursor="showCursor"
    :session-id="sessionId"
    :browser-agent-cap="vp.browserAgentCap.value"
    :reconnecting="reconnecting"
    :feedback="messageFeedback.feedback.value"
    @welcome-suggestion="onSend(presetPrompt)"
    @send="onSend"
    @rename="onRename"
    @close-viewport="onCloseViewport"
    @spawn-browser-agent="onSpawnBrowserAgent"
    @stop-agent="onStopAgent"
    @run-agent="onRunAgent"
    @edit-message="onEditMessage"
    @feedback-change="onFeedbackChange"
  />
</template>
