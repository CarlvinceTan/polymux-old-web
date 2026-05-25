<script setup lang="ts">
// Cache this page when hopping to Schedule / Artifacts so ChatLayout + WorkflowNodeCanvas
// stay warm — flow pan/zoom, selection, collapsed parallels, undo stack survive tab swaps.
definePageMeta({ keepalive: true })

import type { ChatMessage, ChatMessageAttachment, CursorState, ViewportState } from '~/composables/types'
import type { SessionHandle } from '~/composables/workflows/useWorkflowSession'
import type { AgentChatsHandle } from '~/composables/chat/useAgentChats'
import type { ViewportsHandle } from '~/composables/viewport/useViewports'
import type { ScreencastHandle } from '~/composables/viewport/useScreencast'
import type { ViewMode } from '~/components/chat/ChatLayout.vue'

const sessionId = inject<Ref<string>>('workflow-id')!
const chats = inject<AgentChatsHandle>('chat-chats')!
const messageFeedback = inject<{
  feedback: Ref<Map<string, 'up' | 'down'>>
  setRating: (id: string, rating: 'up' | 'down' | null) => Promise<void>
}>('chat-message-feedback')!
const vp = inject<ViewportsHandle>('chat-vp')!
const screencast = inject<ScreencastHandle>('chat-screencast')!
const chatTitle = inject<Ref<string>>('chat-title')!
const isNewChat = inject<Ref<boolean>>('chat-is-new')!
const welcome = inject<Ref<boolean>>('chat-welcome')!
const viewportList = inject<Ref<any>>('chat-viewport-list')!
const userName = inject<ComputedRef<string>>('chat-user-name')!
const welcomeSuggestion = inject<string>('chat-welcome-suggestion')!
const presetPrompt = inject<string>('chat-preset-prompt')!
const titleRequested = inject<Ref<boolean>>('chat-title-requested')!
const viewMode = inject<Ref<ViewMode>>('chat-view-mode')!
const browserMode = inject<Ref<'server' | 'extension'>>('chat-browser-mode')!
const armAutoSwitch = inject<() => void>('chat-arm-auto-switch')!
const onRename = inject<(title: string) => Promise<void>>('chat-on-rename')!
const onCloseViewport = inject<(agentId: string) => void>('chat-on-close-viewport')!
const onSpawnBrowserAgent = inject<() => void>('chat-on-spawn-browser-agent')!
const session = inject<SessionHandle>('chat-session')!
const workflowWorkspaceId = inject(
  'workflow-workspace-id',
  computed(() => ''),
) as ComputedRef<string>
const workspacePlan = inject(
  'workflow-workspace-plan',
  computed(() => null as string | null),
) as ComputedRef<string | null>
const budgetRestorePrompt = inject(
  'chat-budget-restore-prompt',
  ref<string | null>(null),
)

const reconnecting = computed(
  () => session.status.value === 'connecting' || session.status.value === 'reconnecting',
)

const { canSendPromptSync, canSendPromptAsync } = useChatPromptSendGuard(
  computed(() => workflowWorkspaceId.value ?? ''),
  computed(() => workspacePlan.value),
)

const { settings: userSettings } = useUserSettings()
const showCursor = computed(() => userSettings.value.show_cursor_overlay)

const orchestratorChat = computed(() => chats.orchestrator)
const chatMessages = computed(() => orchestratorChat.value.messages.value)
const chatIsStreaming = computed(() => orchestratorChat.value.isStreaming.value)
const chatThinking = computed(() => orchestratorChat.value.thinking.value)
const chatWaitingForAgent = computed(() => orchestratorChat.value.waitingForAgent.value)

const { browserAgentsActive, showWorkingIndicator } = useChatActivity({
  isStreaming: chatIsStreaming,
  thinking: chatThinking,
  waitingForAgent: chatWaitingForAgent,
  viewports: computed(() => vp.viewports.value as ViewportState[]),
})

const { consumePendingPrompt } = useWorkflowList()

// All chat goes to the orchestrator. Individual browser-agent chat is
// intentionally unreachable — the orchestrator is the sole manager.
const currentChat = orchestratorChat

const command = computed({
  get: () => chats.drafts['orchestrator'] ?? '',
  set: (val: string) => {
    chats.drafts['orchestrator'] = val
  },
})

watch(budgetRestorePrompt, (v) => {
  if (v == null || v === '') return
  command.value = v
  budgetRestorePrompt.value = null
})

// Pre-emit gate is sync-only so the optimistic chat UI (user bubble + working
// dots) can apply the instant the user clicks send. The async weekly-cap RPC
// runs after the optimistic apply, inside the wireGuard passed to
// sendMessage/editMessage — if it rejects, the chat handle rolls the bubble
// back and restores the prompt to the composer.
function beforeSendPrompt(text: string, _attachments: ChatMessageAttachment[]) {
  const t = text.trim()
  if (!t) return false
  return canSendPromptSync(t)
}

function beforeEditMessage(text: string, _attachments: ChatMessageAttachment[]) {
  return canSendPromptSync(text.trim())
}

async function onWelcomeSuggestion() {
  const t = presetPrompt.trim()
  if (!canSendPromptSync(t)) return
  onSend(presetPrompt)
}

function onSend(value: string, attachments?: ChatMessageAttachment[]) {
  const t = value.trim()
  if (!t) return
  command.value = ''

  if (!titleRequested.value && isNewChat.value) {
    titleRequested.value = true
    chats.requestTitle(`User: ${t}`)
  }

  armAutoSwitch()
  currentChat.value.sendMessage(t, attachments, () => canSendPromptAsync(t))
}

function onEditMessage(index: number, text: string, attachments: ChatMessageAttachment[]) {
  armAutoSwitch()
  currentChat.value.editMessage(index, text, attachments, () => canSendPromptAsync(text.trim()))
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

function onTogglePinViewport(agentId: string) {
  vp.togglePin(agentId)
}

// Pick up a draft stashed during session promotion and fire it immediately.
// Calling onSend now pushes the optimistic user bubble into orchestrator
// state synchronously — the welcome view goes away on the same tick the
// page mounts. The WS frame itself is buffered inside useWorkflowSession until the
// socket reaches OPEN, so we don't have to wait here.
onMounted(() => {
  const pending = consumePendingPrompt(sessionId.value)
  if (!pending) return
  const trimmed = pending.text.trim()
  // Sync gate only — onSend itself folds the async weekly-cap check into the
  // wireGuard it passes to sendMessage, so awaiting it here would re-introduce
  // the delay we just eliminated and the welcome view would linger past mount.
  if (!canSendPromptSync(trimmed)) return
  onSend(pending.text, pending.attachments)
})
</script>

<template>
  <ChatLayout
    v-model:command="command"
    v-model:viewport-list="viewportList"
    v-model:view-mode="viewMode"
    v-model:browser-mode="browserMode"
    :welcome="welcome"
    :chat-title="chatTitle"
    :renameable="!isNewChat"
    :user-name="userName"
    :welcome-suggestion="welcomeSuggestion"
    :messages="(chatMessages as ChatMessage[])"
    :is-streaming="chatIsStreaming"
    :show-working-indicator="showWorkingIndicator"
    :waiting-for-agent="chatWaitingForAgent"
    :browser-agents-active="browserAgentsActive"
    :frame-urls="(screencast.frameUrls.value as Map<string, string>)"
    :cursor-positions="(screencast.cursorPositions.value as Map<string, CursorState>)"
    :show-cursor="showCursor"
    :session-id="sessionId"
    :workspace-id="workflowWorkspaceId"
    :browser-agent-cap="vp.browserAgentCap.value"
    :reconnecting="reconnecting"
    :feedback="messageFeedback.feedback.value"
    :before-send-prompt="beforeSendPrompt"
    :before-edit="beforeEditMessage"
    @welcome-suggestion="onWelcomeSuggestion"
    @send="onSend"
    @rename="onRename"
    @close-viewport="onCloseViewport"
    @toggle-pin-viewport="onTogglePinViewport"
    @spawn-browser-agent="onSpawnBrowserAgent"
    @stop-agent="onStopAgent"
    @run-agent="onRunAgent"
    @edit-message="onEditMessage"
    @feedback-change="onFeedbackChange"
  />
</template>
