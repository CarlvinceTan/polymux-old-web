<script setup lang="ts">
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
</script>

<template>
  <div
    class="scrollbar-hide min-h-0 w-full flex-1 overflow-y-auto overscroll-contain py-3 sm:py-4"
    role="log"
    aria-live="polite"
    aria-relevant="additions"
  >
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
