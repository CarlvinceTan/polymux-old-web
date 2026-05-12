<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ChatMessage, ChatMessageAttachment } from '~/composables/types'

const props = defineProps<{
  messages: ChatMessage[]
  // True while a partial agent_message is actively producing text. Hides the
  // dots so they don't double up with the streaming bubble.
  isStreaming?: boolean
  // True while the orchestrator owns the current turn (set on send/edit, on
  // thinking/partial events, on browser-spawn, cleared by a final
  // agent_message). Drives the dots through every silent gap inside a turn —
  // the moment after submit before the first chunk, between continuation
  // rounds, while a browser sub-agent the orchestrator just spawned is
  // working, or after an edit that wiped the bubble below it.
  waitingForAgent?: boolean
  // True while any browser sub-agent under the orchestrator is currently
  // working. Keeps the dots up even if the orchestrator's turn already
  // closed — the user is still waiting on visible work.
  browserAgentsActive?: boolean
  sessionId: string
  // Per-message thumbs rating from the calling user, keyed by message id.
  // Bubbles whose id is absent stay un-rated.
  feedback?: Map<string, 'up' | 'down'>
}>()

const emit = defineEmits<{
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'feedback-change': [messageId: string, rating: 'up' | 'down' | null]
  'jump-button-state': [show: boolean]
}>()

function feedbackFor(id: string | undefined): 'up' | 'down' | null {
  if (!id || !props.feedback) return null
  return props.feedback.get(id) ?? null
}

// Dots appear whenever something is in flight but no tokens are landing in
// the chat right now. `isStreaming` is the only suppressor — the visible
// streaming text is its own activity signal. Anything else (orchestrator
// owns the turn, sub-agent is working) keeps the dots up.
const showWorkingIndicator = computed(() => {
  if (props.isStreaming) return false
  return !!props.waitingForAgent || !!props.browserAgentsActive
})

function showAgentActions(index: number): boolean {
  const m = props.messages[index]
  if (!m || m.role !== 'agent') return false
  if (!m.text || m.text.trim().length === 0) return false
  // Hide on the message currently being streamed in.
  if (props.isStreaming && index === props.messages.length - 1) return false
  return true
}

// Jump-to-latest + stick-to-bottom state. The button is rendered by
// ChatLayout (so it can sit just above the prompt overlay regardless of the
// overlay's actual height), but the source of truth — distance from the
// bottom of this scroll viewport — lives here.
//
// Two thresholds:
//   SCROLL_THRESHOLD_PX — far enough above the bottom that the jump button
//     should show.
//   STICK_THRESHOLD_PX — close enough to the bottom that new content (sent
//     messages, streaming agent chunks) should pull the user along.
const scrollContainer = ref<HTMLDivElement | null>(null)
const contentWrapper = ref<HTMLDivElement | null>(null)
const SCROLL_THRESHOLD_PX = 160
const STICK_THRESHOLD_PX = 20
let lastEmitted: boolean | null = null
// Tracks whether the user is glued to the latest message. Set by *user*
// scroll events (onScroll); read by content-change events (onResize). Keeping
// the two paths separate is what lets streaming chunks keep the user pinned
// at the bottom — onResize widens the distance momentarily and would flip
// the user out of sticky mode if it shared the same code path.
let stickToBottom = false

function emitJumpState(distance: number, scrollHeight: number, clientHeight: number) {
  const next = scrollHeight > clientHeight + 4 && distance > SCROLL_THRESHOLD_PX
  if (next !== lastEmitted) {
    lastEmitted = next
    emit('jump-button-state', next)
  }
}

function onScroll() {
  const el = scrollContainer.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom = distance <= STICK_THRESHOLD_PX
  emitJumpState(distance, el.scrollHeight, el.clientHeight)
}

function onResize() {
  const el = scrollContainer.value
  if (!el) return
  if (stickToBottom) {
    // Instant assignment so a streaming chunk doesn't fight any in-flight
    // animated scroll. The resulting scroll event refreshes jump-button
    // state, but we also recompute below in case scrollTop was already at
    // the clamped max and the assignment doesn't fire one.
    el.scrollTop = el.scrollHeight
  }
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  emitJumpState(distance, el.scrollHeight, el.clientHeight)
}

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const el = scrollContainer.value
  if (!el) return
  // Anyone jumping to the bottom on purpose re-enters sticky mode, so
  // subsequent streaming chunks keep them there until they scroll up.
  stickToBottom = true
  el.scrollTo({ top: el.scrollHeight, behavior })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = scrollContainer.value
  if (!el) return
  el.addEventListener('scroll', onScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize())
    resizeObserver.observe(el)
    if (contentWrapper.value) resizeObserver.observe(contentWrapper.value)
  }
  nextTick(() => {
    // On mount, pin to the latest message — coming back from another route
    // or view mode means the user expects to land at the bottom, not at the
    // top of history. scrollToBottom also sets stickToBottom = true, so any
    // async growth that follows (e.g. images, late-arriving messages) keeps
    // pulling them along.
    scrollToBottom('auto')
    // Force initial jump-button emit even when the scroll above was a no-op
    // (empty chat, or scrollTop already at the clamped max).
    onScroll()
  })
})

onBeforeUnmount(() => {
  const el = scrollContainer.value
  if (el) el.removeEventListener('scroll', onScroll)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (lastEmitted !== false) emit('jump-button-state', false)
})

defineExpose({ scrollToBottom })
</script>

<template>
  <div
    ref="scrollContainer"
    class="scrollbar-hide min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain py-3 sm:py-4"
    role="log"
    aria-live="polite"
    aria-relevant="additions"
  >
    <!-- contentWrapper exists only so the ResizeObserver has an inner element
         whose box-size changes as messages/working dots stream in. Observing
         the scroll container alone wouldn't fire on scrollHeight growth. -->
    <div ref="contentWrapper">
      <template v-for="(msg, i) in messages" :key="i">
        <AgentMessage
          v-if="msg.role === 'agent'"
          :text="msg.text"
          :show-actions="showAgentActions(i)"
          :message-id="msg.id"
          :feedback="feedbackFor(msg.id)"
          @feedback-change="(id, rating) => emit('feedback-change', id, rating)"
        />
        <UserMessage
          v-else-if="msg.role === 'user'"
          :text="msg.text"
          :attachments="msg.attachments"
          :session-id="props.sessionId"
          @edit="(text, attachments) => emit('edit-message', i, text, attachments)"
        />
      </template>

      <!-- Working indicator: visible across the full turn whenever no text is
           currently being streamed — covers gaps between continuation rounds,
           browser sub-agent delegation, and the moment before the first chunk. -->
      <div v-if="showWorkingIndicator" class="flex items-center gap-1.5 pt-2 pr-1 pb-1 pl-1">
        <span class="working-dot size-[7px] rounded-full bg-neutral-400" />
        <span class="working-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.2s" />
        <span class="working-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.4s" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes working-pulse {
  0%, 60%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  30% {
    transform: scale(1.35);
    opacity: 1;
  }
}

.working-dot {
  animation: working-pulse 1.2s ease-in-out infinite;
}
</style>
