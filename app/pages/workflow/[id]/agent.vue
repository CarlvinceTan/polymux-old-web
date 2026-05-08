<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState } from '~/composables/types'
import type { SessionHandle } from '~/composables/auth/useSession'
import type { ViewMode } from '~/components/chat/ChatLayout.vue'

const sessionId = inject<Ref<string>>('workflow-id')!
const chats = inject<any>('chat-chats')!
const vp = inject<any>('chat-vp')!
const screencast = inject<any>('chat-screencast')!
const chatTitle = inject<Ref<string>>('chat-title')!
const isNewChat = inject<Ref<boolean>>('chat-is-new')!
const welcome = inject<Ref<boolean>>('chat-welcome')!
const viewportList = inject<Ref<any>>('chat-viewport-list')!
const browserMode = inject<Ref<boolean>>('chat-browser-mode')!
const userName = inject<string>('chat-user-name')!
const welcomeSuggestion = inject<string>('chat-welcome-suggestion')!
const presetPrompt = inject<string>('chat-preset-prompt')!
const titleRequested = inject<Ref<boolean>>('chat-title-requested')!
const viewMode = inject<Ref<ViewMode>>('chat-view-mode')!
const armAutoSwitch = inject<() => void>('chat-arm-auto-switch')!
const onRename = inject<(title: string) => Promise<void>>('chat-on-rename')!
const onPromoteViewport = inject<(agentId: string) => void>('chat-on-promote-viewport')!
const onDemoteActive = inject<() => void>('chat-on-demote-active')!
const onCloseViewport = inject<(agentId: string) => void>('chat-on-close-viewport')!
const onSpawnBrowserAgent = inject<() => void>('chat-on-spawn-browser-agent')!
const session = inject<SessionHandle>('chat-session')!

const reconnecting = computed(
  () => session.status.value === 'connecting' || session.status.value === 'reconnecting',
)

// Drives the typing indicator across silent gaps: while the orchestrator is
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

function onRetryMessage(index: number) {
  armAutoSwitch()
  currentChat.value.retryFromMessage(index)
}

function onNavigateRetry(index: number, retryIndex: number) {
  currentChat.value.setActiveRetry(index, retryIndex)
}

// Pick up a draft stashed during session promotion and fire it immediately.
// Calling onSend now pushes the optimistic user bubble into orchestrator
// state synchronously — the welcome view goes away on the same tick the
// page mounts. The WS frame itself is buffered inside useSession until the
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
    show-header-divider
    :browser-mode="browserMode"
    :welcome="welcome"
    :chat-title="chatTitle"
    :renameable="!isNewChat"
    :user-name="userName"
    :welcome-suggestion="welcomeSuggestion"
    :messages="(currentChat.messages.value as ChatMessage[])"
    :is-thinking="currentChat.thinking.value != null"
    :is-streaming="currentChat.isStreaming.value"
    :browser-agents-active="browserAgentsActive"
    :frame-urls="(screencast.frameUrls.value as Map<string, string>)"
    :session-id="sessionId"
    :browser-agent-cap="vp.browserAgentCap.value"
    :active-agent-id="vp.activeAgentId.value"
    :reconnecting="reconnecting"
    @welcome-suggestion="onSend(presetPrompt)"
    @send="onSend"
    @rename="onRename"
    @promote-viewport="onPromoteViewport"
    @demote-active="onDemoteActive"
    @close-viewport="onCloseViewport"
    @spawn-browser-agent="onSpawnBrowserAgent"
    @edit-message="onEditMessage"
    @retry-message="onRetryMessage"
    @navigate-retry="onNavigateRetry"
  />
</template>
