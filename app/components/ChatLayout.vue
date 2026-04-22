<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import type { ChatMessage, ChatMessageAttachment, SessionMode, SessionModeChangedPayload, SessionStatePayload, SetSessionModePayload, ViewportState } from '~/composables/types'
import type { SessionHandle } from '~/composables/useSession'

export type { ChatMessage, ViewportState }

const { t } = useI18n()

const props = defineProps<{
  welcome: boolean
  chatTitle: string
  userName: string
  welcomeSuggestion: string
  messages: ChatMessage[]
  frameUrls?: Map<string, string>
  renameable?: boolean
  sessionId: string
  isThinking?: boolean
  waitingForAgent?: boolean
  browserAgentCap?: number
  activeAgentId: string | null
  browserMode: boolean
  hideViewSwitch?: boolean
  hideTitle?: boolean
  showHeaderDivider?: boolean
}>()

const { attachments, addFiles, removeFile, clearAll } = useAttachments()

const command = defineModel<string>('command', { required: true })
const viewportList = defineModel<ViewportState[]>('viewportList', { required: true })

const emit = defineEmits<{
  send: [value: string, attachments: ChatMessageAttachment[]]
  welcomeSuggestion: []
  promoteViewport: [agentId: string]
  demoteActive: []
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
  rename: [value: string]
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'retry-message': [index: number]
  pause: []
}>()

const workflowMode = ref(false)

const injectedSession = inject<SessionHandle | null>('chat-session', null)
const sessionMode = ref<SessionMode>('build')

if (injectedSession) {
  watch(injectedSession.sessionState, (s: Readonly<SessionStatePayload> | null) => {
    if (s?.mode === 'casual' || s?.mode === 'build') sessionMode.value = s.mode
  })
  injectedSession.on<SessionModeChangedPayload>('session_mode_changed', (p) => {
    if (p.mode === 'casual' || p.mode === 'build') sessionMode.value = p.mode
  })
}

function setMode(next: SessionMode) {
  if (next === sessionMode.value) return
  sessionMode.value = next
  injectedSession?.send<SetSessionModePayload>('set_session_mode', { mode: next })
}

function toggleMode() {
  setMode(sessionMode.value === 'build' ? 'casual' : 'build')
}

// True when the user has not sent anything yet AND no viewports exist.
// Chat view with viewports still wants the dock visible even if the
// transcript is momentarily empty (reconnects, etc.).
const showWelcome = computed(() => props.welcome && !props.browserMode && !workflowMode.value)

const showSplitLayout = computed(() => !showWelcome.value)

const agentActive = computed(() => !!props.waitingForAgent)

const layoutContainer = ref<HTMLElement | null>(null)
const chatPanelWidth = ref<number | null>(null)
const initialChatPanelWidth = ref<number | null>(null)
const isDragging = ref(false)

watch(layoutContainer, (el) => {
  if (el && chatPanelWidth.value === null) {
    const width = Math.round(el.clientWidth * 0.38)
    chatPanelWidth.value = width
    initialChatPanelWidth.value = width
  }
})

function startResize(e: PointerEvent) {
  if (!layoutContainer.value) return
  isDragging.value = true
  e.preventDefault()
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

  const container = layoutContainer.value
  const minX = initialChatPanelWidth.value ?? Math.round(container.clientWidth * 0.38)
  const maxX = container.clientWidth / 2

  function onMove(ev: PointerEvent) {
    const containerRect = container.getBoundingClientRect()
    const newWidth = containerRect.right - ev.clientX
    chatPanelWidth.value = Math.max(minX, Math.min(maxX, newWidth))
  }

  function onUp() {
    isDragging.value = false
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}

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
  <TabPanel v-bind="$attrs" class="min-h-0 min-w-0 flex-1" :compact-footer="attachments.length > 0" hide-footer-divider :hide-header-divider="!props.showHeaderDivider">
    <template v-if="!hideTitle" #title>
      <EditableTitle
        :model-value="chatTitle"
        :disabled="renameable === false"
        @update:model-value="emit('rename', $event)"
      />
    </template>

    <template v-if="!hideViewSwitch" #actions>
      <div class="flex items-center rounded-lg bg-neutral-100 p-0.5">
        <button
          type="button"
          class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
          :class="!workflowMode
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'"
          :aria-label="t('chat.chatView')"
          @click="workflowMode = false"
        >
          <UIcon name="i-heroicons-chat-bubble-left-right-20-solid" class="size-3.5" />
          <span class="hidden sm:inline">{{ t('chat.chatView') }}</span>
        </button>
        <button
          type="button"
          class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
          :class="workflowMode
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'"
          :aria-label="t('chat.workflowView')"
          @click="workflowMode = true"
        >
          <UIcon name="i-heroicons-square-3-stack-3d-20-solid" class="size-3.5" />
          <span class="hidden sm:inline">{{ t('chat.workflowView') }}</span>
        </button>
      </div>
    </template>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatWelcome
        v-if="showWelcome"
        :user-name="userName"
        :welcome-suggestion="welcomeSuggestion"
        @suggestion="emit('welcomeSuggestion')"
      />

      <div
        v-else-if="showSplitLayout"
        ref="layoutContainer"
        class="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-out md:flex-row md:gap-0"
      >
        <BrowserDock
          v-if="browserMode"
          :viewport-list="viewportList"
          :frame-urls="frameUrls"
          :browser-agent-cap="props.browserAgentCap"
          :active-agent-id="props.activeAgentId"
          class="flex-1 min-w-0"
          @promote-viewport="emit('promoteViewport', $event)"
          @demote-active="emit('demoteActive')"
          @close-viewport="emit('closeViewport', $event)"
          @spawn-browser-agent="emit('spawnBrowserAgent')"
        />

        <div
          v-if="browserMode"
          class="relative z-10 hidden shrink-0 cursor-col-resize items-center justify-center md:flex"
          :class="isDragging ? 'bg-neutral-200' : 'hover:bg-neutral-100'"
          @pointerdown="startResize"
        >
          <div class="absolute inset-y-0 -left-2 -right-2" />
          <div class="h-full w-px bg-neutral-200" />
        </div>

        <div
          class="flex min-h-0 flex-col"
          :class="browserMode ? 'shrink-0' : 'min-w-0 flex-1'"
          :style="browserMode && chatPanelWidth ? { width: chatPanelWidth + 'px' } : {}"
        >
          <ChatMessages
            v-if="!workflowMode"
            :messages="messages"
            :is-thinking="isThinking"
            :waiting-for-agent="waitingForAgent"
            :session-id="sessionId"
            @edit-message="(i, text, att) => emit('edit-message', i, text, att)"
            @retry-message="(i) => emit('retry-message', i)"
          />

          <WorkflowDock
            v-else
            :session-id="sessionId"
            class="min-h-0 flex-1"
          />

          <div
            v-if="browserMode && !workflowMode"
            class="shrink-0 bg-white px-4 pb-3 sm:px-5 sm:pb-4"
            :class="attachments.length > 0 ? 'pt-2.5' : 'pt-3 sm:pt-4'"
          >
            <PromptInput
              v-model="command"
              full-width
              :hint="t('chat.messagePlaceholder')"
              :attachments="attachments"
              :agent-active="agentActive"
              :session-mode="sessionMode"
              @send="onSend"
              @pause="emit('pause')"
              @attach-files="onAttachFiles"
              @remove-file="onRemoveFile"
              @toggle-mode="toggleMode"
            />
          </div>
        </div>
      </div>
    </div>

    <template v-if="!workflowMode && !browserMode" #footer>
      <div class="mx-auto w-full max-w-2xl">
        <PromptInput
          v-model="command"
          full-width
          :hint="t('chat.messagePlaceholder')"
          :attachments="attachments"
          :agent-active="agentActive"
          :session-mode="sessionMode"
          @send="onSend"
          @pause="emit('pause')"
          @attach-files="onAttachFiles"
          @remove-file="onRemoveFile"
          @toggle-mode="toggleMode"
        />
      </div>
    </template>
  </TabPanel>
</template>
