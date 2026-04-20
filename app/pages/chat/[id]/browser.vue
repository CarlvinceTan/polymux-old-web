<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment } from '~/composables/types'

const sessionId = inject<Ref<string>>('chat-session-id')!
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
const onRename = inject<(title: string) => Promise<void>>('chat-on-rename')!
const onPromoteViewport = inject<(agentId: string) => void>('chat-on-promote-viewport')!
const onDemoteActive = inject<() => void>('chat-on-demote-active')!
const onCloseViewport = inject<(agentId: string) => void>('chat-on-close-viewport')!
const onSpawnBrowserAgent = inject<() => void>('chat-on-spawn-browser-agent')!

const activeView = 'browser' as const

const chatDisabled = computed(() => !vp.activeAgentId.value)

const currentChat = computed(() => {
  const agentId = vp.activeAgentId.value
  return agentId ? chats.get(agentId) : chats.orchestrator
})

const currentChatId = computed(() => vp.activeAgentId.value ?? null)

const command = computed({
  get: () => {
    const id = currentChatId.value
    if (!id) return ''
    return chats.drafts[id] ?? ''
  },
  set: (val: string) => {
    const id = currentChatId.value
    if (!id) return
    chats.drafts[id] = val
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

  currentChat.value.sendMessage(t, attachments)
}

function onEditMessage(index: number, text: string, attachments: ChatMessageAttachment[]) {
  currentChat.value.editMessage(index, text, attachments)
}

function onRetryMessage(index: number) {
  currentChat.value.retryFromMessage(index)
}

function onPauseAgent() {
  currentChat.value.stopAgent()
}
</script>

<template>
  <ChatLayout
    v-model:command="command"
    v-model:viewport-list="viewportList"
    :active-view="activeView"
    :browser-mode="browserMode"
    :welcome="welcome"
    :chat-title="chatTitle"
    :renameable="!isNewChat"
    :user-name="userName"
    :welcome-suggestion="welcomeSuggestion"
    :messages="(currentChat.messages.value as ChatMessage[])"
    :is-thinking="currentChat.thinking.value != null"
    :waiting-for-agent="currentChat.waitingForAgent.value"
    :frame-urls="(screencast.frameUrls.value as Map<string, string>)"
    :session-id="sessionId"
    :browser-agent-cap="vp.browserAgentCap.value"
    :active-agent-id="vp.activeAgentId.value"
    :chat-disabled="chatDisabled"
    @welcome-suggestion="onSend(presetPrompt)"
    @send="onSend"
    @rename="onRename"
    @promote-viewport="onPromoteViewport"
    @demote-active="onDemoteActive"
    @close-viewport="onCloseViewport"
    @spawn-browser-agent="onSpawnBrowserAgent"
    @edit-message="onEditMessage"
    @retry-message="onRetryMessage"
    @pause="onPauseAgent"
    @settings="() => {}"
  />
</template>
