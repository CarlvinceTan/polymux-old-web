<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import type { ChatMessage, ChatMessageAttachment, CursorState, ViewportState } from '~/composables/types'

export type { ChatMessage, ViewportState }

export type ViewMode = 'chat' | 'viewport' | 'flow'

const { t } = useI18n()

const props = defineProps<{
  welcome: boolean
  chatTitle: string
  userName: string
  welcomeSuggestion: string
  messages: ChatMessage[]
  frameUrls?: Map<string, string>
  cursorPositions?: Map<string, CursorState>
  showCursor?: boolean
  renameable?: boolean
  sessionId: string
  isStreaming?: boolean
  waitingForAgent?: boolean
  browserAgentsActive?: boolean
  browserAgentCap?: number
  hideViewSwitch?: boolean
  hideTitle?: boolean
  reconnecting?: boolean
  feedback?: Map<string, 'up' | 'down'>
}>()

const { attachments, addFiles, removeFile, clearAll } = useAttachments()

const command = defineModel<string>('command', { required: true })
const viewportList = defineModel<ViewportState[]>('viewportList', { required: true })
const viewMode = defineModel<ViewMode>('viewMode', { default: 'chat' })

const emit = defineEmits<{
  send: [value: string, attachments: ChatMessageAttachment[]]
  welcomeSuggestion: []
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
  stopAgent: [agentId: string]
  runAgent: [agentId: string]
  rename: [value: string]
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'feedback-change': [messageId: string, rating: 'up' | 'down' | null]
}>()

// View-mode state (persistence + auto-switch on browser-agent activation) is
// owned by the workflow page (`pages/workflow/[id].vue`) so it survives the
// Agent / Schedule / Artifacts sub-tab toggles. ChatLayout just reads & writes
// the v-model.
const inChat = computed(() => props.hideViewSwitch || viewMode.value === 'chat')
const inViewport = computed(() => !props.hideViewSwitch && viewMode.value === 'viewport')
const inFlow = computed(() => !props.hideViewSwitch && viewMode.value === 'flow')

const showSwitch = computed(() => !props.hideViewSwitch)
const showFloatingTop = computed(() => !props.hideTitle || showSwitch.value)

// Welcome only makes sense in the chat view; switching to viewport/flow
// means the user is opting into a different layout, even on a fresh session.
const showWelcome = computed(() => props.welcome && inChat.value)

function onAttachFiles(files: FileList) {
  addFiles(props.sessionId, files)
}

function onRemoveFile(id: string) {
  removeFile(id, props.sessionId)
}

function onSend(value: string) {
  const files: ChatMessageAttachment[] = attachments.value
    .filter(a => a.status === 'done')
    .map(a => ({ id: a.id, name: a.name }))
  emit('send', value, files)
  clearAll()
}
</script>

<template>
  <TabPanel v-bind="$attrs" class="min-h-0 min-w-0 flex-1" transparent>
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Chat: padded column so messages clear the floating top/bottom overlays. -->
      <div
        v-if="inChat"
        class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-32 sm:px-5"
        :class="{ 'pt-16': showFloatingTop }"
      >
        <ChatWelcome
          v-if="showWelcome"
          :user-name="userName"
          :welcome-suggestion="welcomeSuggestion"
          @suggestion="emit('welcomeSuggestion')"
        />
        <ChatMessages
          v-else
          :messages="messages"
          :is-streaming="isStreaming"
          :waiting-for-agent="waitingForAgent"
          :browser-agents-active="browserAgentsActive"
          :session-id="sessionId"
          :feedback="feedback"
          @edit-message="(i, text, att) => emit('edit-message', i, text, att)"
          @feedback-change="(id, rating) => emit('feedback-change', id, rating)"
        />
      </div>

      <!-- Viewport: BrowserDock gallery only, with the same horizontal +
           vertical constraints as the chat column so messages and viewports
           sit in the same rhythm when the user toggles between views. -->
      <div
        v-else-if="inViewport"
        class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-32 sm:px-5"
        :class="{ 'pt-16': showFloatingTop }"
      >
        <BrowserDock
          :viewport-list="viewportList"
          :frame-urls="frameUrls"
          :cursor-positions="cursorPositions"
          :show-cursor="showCursor"
          :browser-agent-cap="props.browserAgentCap"
          :reconnecting="props.reconnecting"
          class="min-h-0 flex-1"
          @close-viewport="emit('closeViewport', $event)"
          @spawn-browser-agent="emit('spawnBrowserAgent')"
          @stop-agent="emit('stopAgent', $event)"
          @run-agent="emit('runAgent', $event)"
        />
      </div>

      <!-- Flow: canvas fills the panel; floating overlays sit on top of it. -->
      <WorkflowNodeCanvas
        v-else-if="inFlow"
        :session-id="sessionId"
        class="min-h-0 flex-1"
      />

      <!-- Floating top row: title + view switcher overlay. Top/left/right
           padding match so the content sits inset by the same gutter from
           every panel edge. The wrapper is pointer-events-none so the
           transparent gutter around the visible row doesn't intercept hover
           on content beneath (e.g. canvas controls / gallery overlays);
           interactive children opt back in via pointer-events-auto. -->
      <div
        v-if="showFloatingTop"
        class="pointer-events-none absolute inset-x-0 top-0 z-50 p-3 sm:p-4"
      >
        <div class="pointer-events-auto flex items-center justify-between gap-5">
          <div class="min-w-0 flex-1">
            <EditableTitle
              v-if="!hideTitle"
              :model-value="chatTitle"
              :disabled="renameable === false"
              @update:model-value="emit('rename', $event)"
            />
          </div>
          <div v-if="showSwitch" class="flex shrink-0 items-center rounded-lg bg-neutral-100 p-0.5">
            <button
              type="button"
              class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
              :class="inChat
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'"
              :aria-label="t('chat.chatView')"
              @click="viewMode = 'chat'"
            >
              <UIcon name="i-heroicons-chat-bubble-left-right-20-solid" class="size-3.5" />
              <span class="hidden sm:inline">{{ t('chat.chatView') }}</span>
            </button>
            <button
              type="button"
              class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
              :class="inViewport
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'"
              :aria-label="t('chat.viewportView')"
              @click="viewMode = 'viewport'"
            >
              <UIcon name="i-heroicons-computer-desktop-20-solid" class="size-3.5" />
              <span class="hidden sm:inline">{{ t('chat.viewportView') }}</span>
            </button>
            <button
              type="button"
              class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
              :class="inFlow
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'"
              :aria-label="t('chat.flowView')"
              @click="viewMode = 'flow'"
            >
              <UIcon name="i-heroicons-share-20-solid" class="size-3.5" />
              <span class="hidden sm:inline">{{ t('chat.flowView') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Floating bottom prompt input overlay. Wrapper is pointer-events-
           none so the transparent gutter to the left and right of the
           centered PromptInput doesn't capture hover on content beneath
           (e.g. the gallery zoom slider sitting just above the bottom). -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-50">
        <div
          class="pointer-events-auto mx-auto w-full max-w-3xl px-4 pb-3 sm:px-5 sm:pb-4"
          :class="attachments.length > 0 ? 'pt-2.5' : 'pt-3 sm:pt-4'"
        >
          <PromptInput
            v-model="command"
            :hint="t('chat.messagePlaceholder')"
            :attachments="attachments"
            @send="onSend"
            @attach-files="onAttachFiles"
            @remove-file="onRemoveFile"
          />
        </div>
      </div>
    </div>
  </TabPanel>
</template>
