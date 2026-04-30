<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import type { ChatMessage, ChatMessageAttachment, ViewportState } from '~/composables/types'

export type { ChatMessage, ViewportState }

export type ViewMode = 'chat' | 'viewport' | 'workflow'

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
  reconnecting?: boolean
}>()

const { attachments, addFiles, removeFile, clearAll } = useAttachments()

const command = defineModel<string>('command', { required: true })
const viewportList = defineModel<ViewportState[]>('viewportList', { required: true })
const viewMode = defineModel<ViewMode>('viewMode', { default: 'chat' })

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
}>()

// View-mode state (persistence + auto-switch on browser-agent activation) is
// owned by the workflow page (`pages/workflow/[id].vue`) so it survives the
// Agent / Schedule / Artifacts sub-tab toggles. ChatLayout just reads & writes
// the v-model.
const inChat = computed(() => props.hideViewSwitch || viewMode.value === 'chat')
const inViewport = computed(() => !props.hideViewSwitch && viewMode.value === 'viewport')
const inWorkflow = computed(() => !props.hideViewSwitch && viewMode.value === 'workflow')

const showSwitch = computed(() => !props.hideViewSwitch)

// Welcome only makes sense in the chat view; switching to viewport/workflow
// means the user is opting into a different layout, even on a fresh session.
const showWelcome = computed(() => props.welcome && inChat.value)

const layoutContainer = ref<HTMLElement | null>(null)
const chatPanelWidth = ref<number | null>(null)
const initialChatPanelWidth = ref<number | null>(null)
const isDragging = ref(false)

let resizeObs: ResizeObserver | null = null

// Keep the chat panel sized against the container's *current* width. The old
// one-shot watch captured `clientWidth` at first mount and never recomputed,
// so any later container size change (window resize, sidebar toggle, or the
// laptop waking on a different display than it slept on) left `chatPanelWidth`
// stuck at a stale absolute value — the panel would be wider than the new
// container could afford, which squashed the chat content and pushed the
// inline PromptInput off-screen until a reload re-derived the width.
function syncWidthBounds(el: HTMLElement) {
  const containerWidth = el.clientWidth
  if (containerWidth === 0) return
  const minWidth = Math.round(containerWidth * 0.38)
  const maxWidth = Math.round(containerWidth / 2)
  initialChatPanelWidth.value = minWidth
  // Don't fight an in-progress drag; the user is setting the width directly.
  if (isDragging.value && chatPanelWidth.value !== null) return
  const current = chatPanelWidth.value
  if (current === null) {
    chatPanelWidth.value = minWidth
    return
  }
  // Only re-clamp when the saved width no longer fits — otherwise preserve
  // whatever width the user dragged to so transient resizes don't reset it.
  if (current < minWidth || current > maxWidth) {
    chatPanelWidth.value = Math.max(minWidth, Math.min(maxWidth, current))
  }
}

watch(layoutContainer, (el) => {
  if (resizeObs) {
    resizeObs.disconnect()
    resizeObs = null
  }
  if (!el) return
  syncWidthBounds(el)
  resizeObs = new ResizeObserver(() => {
    if (layoutContainer.value) syncWidthBounds(layoutContainer.value)
  })
  resizeObs.observe(el)
})

onUnmounted(() => {
  if (resizeObs) {
    resizeObs.disconnect()
    resizeObs = null
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
  <TabPanel v-bind="$attrs" class="min-h-0 min-w-0 flex-1" :hide-header-divider="!props.showHeaderDivider">
    <template v-if="!hideTitle" #title>
      <EditableTitle
        :model-value="chatTitle"
        :disabled="renameable === false"
        @update:model-value="emit('rename', $event)"
      />
    </template>

    <template v-if="showSwitch" #actions>
      <div class="flex items-center rounded-lg bg-neutral-100 p-0.5">
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
          :class="inWorkflow
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-700'"
          :aria-label="t('chat.workflowView')"
          @click="viewMode = 'workflow'"
        >
          <UIcon name="i-heroicons-square-3-stack-3d-20-solid" class="size-3.5" />
          <span class="hidden sm:inline">{{ t('chat.workflowView') }}</span>
        </button>
      </div>
    </template>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        v-if="inChat"
        class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-5"
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
          :is-thinking="isThinking"
          :waiting-for-agent="waitingForAgent"
          :session-id="sessionId"
          @edit-message="(i, text, att) => emit('edit-message', i, text, att)"
          @retry-message="(i) => emit('retry-message', i)"
        />
        <div class="shrink-0 pb-3 sm:pb-4" :class="attachments.length > 0 ? 'pt-2.5' : 'pt-3 sm:pt-4'">
          <PromptInput
            v-model="command"
            full-width
            :hint="t('chat.messagePlaceholder')"
            :attachments="attachments"
            @send="onSend"
            @attach-files="onAttachFiles"
            @remove-file="onRemoveFile"
          />
        </div>
      </div>

      <WorkflowDock
        v-else-if="inWorkflow"
        :session-id="sessionId"
        class="min-h-0 flex-1"
      />

      <div
        v-else
        ref="layoutContainer"
        class="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-out md:flex-row md:gap-0"
      >
        <BrowserDock
          :viewport-list="viewportList"
          :frame-urls="frameUrls"
          :browser-agent-cap="props.browserAgentCap"
          :active-agent-id="props.activeAgentId"
          :reconnecting="props.reconnecting"
          class="flex-1 min-w-0"
          @promote-viewport="emit('promoteViewport', $event)"
          @demote-active="emit('demoteActive')"
          @close-viewport="emit('closeViewport', $event)"
          @spawn-browser-agent="emit('spawnBrowserAgent')"
        />

        <div
          class="relative z-10 hidden shrink-0 cursor-col-resize items-center justify-center md:flex"
          :class="isDragging ? 'bg-neutral-200' : 'hover:bg-neutral-100'"
          @pointerdown="startResize"
        >
          <div class="absolute inset-y-0 -left-2 -right-2" />
          <div class="h-full w-px bg-neutral-200" />
        </div>

        <div
          class="flex min-h-0 shrink-0 flex-col px-4 sm:px-5"
          :style="chatPanelWidth ? { width: chatPanelWidth + 'px' } : {}"
        >
          <ChatMessages
            :messages="messages"
            :is-thinking="isThinking"
            :waiting-for-agent="waitingForAgent"
            :session-id="sessionId"
            @edit-message="(i, text, att) => emit('edit-message', i, text, att)"
            @retry-message="(i) => emit('retry-message', i)"
          />

          <div
            class="shrink-0 bg-white pb-3 sm:pb-4"
            :class="attachments.length > 0 ? 'pt-2.5' : 'pt-3 sm:pt-4'"
          >
            <PromptInput
              v-model="command"
              full-width
              :hint="t('chat.messagePlaceholder')"
              :attachments="attachments"
              @send="onSend"
              @attach-files="onAttachFiles"
              @remove-file="onRemoveFile"
            />
          </div>
        </div>
      </div>
    </div>
  </TabPanel>
</template>
