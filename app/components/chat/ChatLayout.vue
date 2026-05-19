<script setup lang="ts">
defineOptions({ inheritAttrs: false })

import { nextTick, ref, watch } from 'vue'
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
  workspaceId?: string | null
  isStreaming?: boolean
  waitingForAgent?: boolean
  browserAgentsActive?: boolean
  browserAgentCap?: number
  hideViewSwitch?: boolean
  hideTitle?: boolean
  reconnecting?: boolean
  feedback?: Map<string, 'up' | 'down'>
  /**
   * When set, invoked before emitting `send`; return false (or Promise<false>)
   * to abort (attachments stay, no toast here — caller shows its own hint).
   */
  beforeSendPrompt?: (text: string, attachments: ChatMessageAttachment[]) => boolean | Promise<boolean>
  /**
   * When set, invoked before forwarding `edit-message`; return false to keep
   * the user message in edit mode.
   */
  beforeEdit?: (text: string, attachments: ChatMessageAttachment[]) => boolean | Promise<boolean>
}>()

const { attachments, addFiles, removeFile, clearAll } = useAttachments()

const command = defineModel<string>('command', { required: true })
const viewportList = defineModel<ViewportState[]>('viewportList', { required: true })
const viewMode = defineModel<ViewMode>('viewMode', { default: 'chat' })
// Per-workflow browser-mode selection. Owned by the workflow page so it
// persists across the chat/viewport/flow sub-tabs (see workflow/[id].vue).
// Defaults to 'server' for fresh sessions; the page hydrates the v-model
// from sessionStorage/localStorage and from the server's session_state
// echo, then writes back through set_browser_mode on every change.
const browserMode = defineModel<'server' | 'extension'>('browserMode', { default: 'server' })

const emit = defineEmits<{
  send: [value: string, attachments: ChatMessageAttachment[]]
  welcomeSuggestion: []
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
  stopAgent: [agentId: string]
  // User pressed the pause button on the chat composer (chat turn is mid-
  // flight). Distinct from `stopAgent`, which is per-sub-agent; this one
  // targets whatever the chat is currently doing — orchestrator turn +
  // cascaded sub-agents.
  stopChat: []
  runAgent: [agentId: string]
  rename: [value: string]
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'feedback-change': [messageId: string, rating: 'up' | 'down' | null]
}>()

// Composer button mode: when any chat-driven activity is in flight the send
// button becomes a pause button. Mirrors ChatMessages' working-indicator
// trigger (kept slightly broader — `isStreaming` also counts here, since the
// user can meaningfully cancel mid-stream, even though the dots are
// suppressed during streaming to avoid double-signalling activity).
const active = computed(
  () => !!props.isStreaming || !!props.waitingForAgent || !!props.browserAgentsActive,
)

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
  addFiles(props.sessionId, files, props.workspaceId ?? undefined)
}

function onRemoveFile(id: string) {
  removeFile(id, props.sessionId)
}

async function onSend(value: string) {
  const files: ChatMessageAttachment[] = attachments.value
    .filter(a => a.status === 'done')
    .map(a => ({ id: a.id, name: a.name }))
  if (props.beforeSendPrompt) {
    const ok = await props.beforeSendPrompt(value.trim(), files)
    if (!ok) return
  }
  emit('send', value, files)
  clearAll()
  // Jump to the bottom so the just-sent bubble (and the streaming reply) is
  // in view regardless of where the user had scrolled. nextTick waits for
  // the parent to append the user message and Vue to flush the DOM update.
  nextTick(() => {
    chatMessagesRef.value?.scrollToBottom('auto')
  })
}

async function relayEdit(index: number, text: string, att: ChatMessageAttachment[]) {
  if (props.beforeEdit) {
    const ok = await props.beforeEdit(text, att)
    if (!ok) return
  }
  emit('edit-message', index, text, att)
}

// Jump-to-latest button. ChatMessages owns the scroll viewport and reports
// when the user has scrolled meaningfully above the bottom; we render the
// affordance here so it can hover above the floating prompt overlay.
type ChatMessagesExpose = { scrollToBottom: (behavior?: ScrollBehavior) => void }
const chatMessagesRef = ref<ChatMessagesExpose | null>(null)
const showJumpButton = ref(false)

// Defensively clear the button whenever the chat view goes away. ChatMessages
// also emits `false` on unmount, but resetting here closes the race on tab
// switches where the new view mounts before the prior emit lands.
watch(inChat, (next) => {
  if (!next) showJumpButton.value = false
})

function onJumpButtonState(show: boolean) {
  showJumpButton.value = show
}

function onJumpClick() {
  chatMessagesRef.value?.scrollToBottom()
}
</script>

<template>
  <TabPanel v-bind="$attrs" class="min-h-0 min-w-0 flex-1" transparent>
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Chat: padded column so messages clear the floating top/bottom overlays. -->
      <div
        v-if="inChat"
        class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-32 sm:px-5"
        :class="{ 'pt-[75px]': showFloatingTop }"
      >
        <ChatWelcome
          v-if="showWelcome"
          :user-name="userName"
          :welcome-suggestion="welcomeSuggestion"
          @suggestion="emit('welcomeSuggestion')"
        />
        <ChatMessages
          v-else
          ref="chatMessagesRef"
          :messages="messages"
          :is-streaming="isStreaming"
          :waiting-for-agent="waitingForAgent"
          :browser-agents-active="browserAgentsActive"
          :session-id="sessionId"
          :workspace-id="workspaceId"
          :feedback="feedback"
          :before-edit-submit="beforeEdit"
          @edit-message="relayEdit"
          @feedback-change="(id, rating) => emit('feedback-change', id, rating)"
          @jump-button-state="onJumpButtonState"
        />
      </div>

      <!-- Viewport: ViewportGallery only, with the same horizontal +
           vertical constraints as the chat column so messages and viewports
           sit in the same rhythm when the user toggles between views. -->
      <div
        v-else-if="inViewport"
        class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pb-32 sm:px-5"
        :class="{ 'pt-[75px]': showFloatingTop }"
      >
        <ViewportGallery
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

      <!-- Flow: canvas fills the panel. KeepAlive keeps WorkflowNodeCanvas state
           (viewport, dragged positions loaded from LS, undo, selection) across
           chat/viewport toggles instead of tearing it down each time — the pane
           is deactivated while hidden so watchers stay quiet compared to v-show.
           Cross-tab hydration is handled in WorkflowNodeCanvas (session viewport)
           plus page keep-alive on workflow/[id]/agent.vue. -->
      <KeepAlive>
        <WorkflowNodeCanvas
          v-if="inFlow"
          :session-id="sessionId"
          class="min-h-0 flex-1"
        />
      </KeepAlive>

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
          class="pointer-events-auto relative mx-auto w-full max-w-3xl px-4 pb-3 sm:px-5 sm:pb-4"
          :class="attachments.length > 0 ? 'pt-2.5' : 'pt-3 sm:pt-4'"
        >
          <!-- Jump-to-latest: floats just above the prompt input box,
               horizontally centered. Visible only in chat view, and only
               while ChatMessages reports the user is scrolled meaningfully
               above the bottom of the message log. -->
          <Transition
            enter-active-class="transition duration-150 ease-out"
            leave-active-class="transition duration-100 ease-in"
            enter-from-class="opacity-0 translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-1"
          >
            <button
              v-if="inChat && showJumpButton"
              type="button"
              class="absolute bottom-full left-1/2 mb-2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full bg-white text-neutral-700 shadow-md ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
              :aria-label="t('chat.scrollToLatest')"
              @click="onJumpClick"
            >
              <UIcon name="i-heroicons-arrow-down-20-solid" class="size-4.5" />
            </button>
          </Transition>

          <PromptInput
            v-model="command"
            v-model:browser-mode="browserMode"
            :hint="t('chat.messagePlaceholder')"
            :attachments="attachments"
            :active="active"
            @send="onSend"
            @stop="emit('stopChat')"
            @attach-files="onAttachFiles"
            @remove-file="onRemoveFile"
          />
        </div>
      </div>
    </div>
  </TabPanel>
</template>
