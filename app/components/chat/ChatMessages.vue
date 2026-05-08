<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment } from '~/composables/types'

const props = defineProps<{
  messages: ChatMessage[]
  isThinking?: boolean
  // True while a partial agent_message is actively producing text. Hides the
  // dots so they don't double up with the streaming bubble.
  isStreaming?: boolean
  // True while any browser sub-agent under the orchestrator is currently
  // working. Drives the dots even when the orchestrator itself is idle
  // because it's waiting on a sub-agent's result.
  browserAgentsActive?: boolean
  sessionId: string
}>()

const emit = defineEmits<{
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'retry-message': [index: number]
  'navigate-retry': [index: number, retryIndex: number]
}>()

// Show the dots when something is *actively* happening:
//   - the orchestrator is producing thinking events, or
//   - the user just sent a prompt and no agent reply has landed yet, or
//   - a browser sub-agent is running.
// Hide them while a chunk is streaming into the latest bubble — the visible
// text is the activity signal there. The previous gate was a sticky
// `waitingForAgent` flag that stayed true through long idle stretches, so
// the dots kept spinning when nothing was actually happening.
const showTypingIndicator = computed(() => {
  if (props.isStreaming) return false
  const last = props.messages[props.messages.length - 1]
  const orchestratorActive = !!props.isThinking || last?.role === 'user'
  return orchestratorActive || !!props.browserAgentsActive
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
        :retry-count="msg.retryVersions?.length"
        :active-retry-index="msg.activeRetryIndex"
        @retry="emit('retry-message', i)"
        @navigate-retry="(r) => emit('navigate-retry', i, r)"
      />
      <UserMessage
        v-else-if="msg.role === 'user'"
        :text="msg.text"
        :attachments="msg.attachments"
        :session-id="props.sessionId"
        @edit="(text, attachments) => emit('edit-message', i, text, attachments)"
      />
    </template>

    <!-- Typing indicator: visible across the full turn whenever no text is
         currently being streamed — covers gaps between continuation rounds,
         browser sub-agent delegation, and the moment before the first chunk. -->
    <div v-if="showTypingIndicator" class="flex items-center gap-1.5 pt-2 pr-1 pb-1 pl-1">
      <span class="typing-dot size-[7px] rounded-full bg-neutral-400" />
      <span class="typing-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.2s" />
      <span class="typing-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.4s" />
    </div>
  </div>
</template>

<style scoped>
@keyframes typing-pulse {
  0%, 60%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  30% {
    transform: scale(1.35);
    opacity: 1;
  }
}

.typing-dot {
  animation: typing-pulse 1.2s ease-in-out infinite;
}
</style>
