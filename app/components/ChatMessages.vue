<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment } from '~/composables/types'

const props = defineProps<{
  messages: ChatMessage[]
  isThinking?: boolean
  waitingForAgent?: boolean
  sessionId: string
}>()

const emit = defineEmits<{
  'edit-message': [index: number, text: string, attachments: ChatMessageAttachment[]]
  'retry-message': [index: number]
}>()

const isAwaitingResponse = computed(() => {
  const msgs = props.messages
  if (msgs.length === 0) return false
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'agent') return false
    if (msgs[i]!.role === 'user') return true
  }
  return false
})

function isActiveThinking(index: number): boolean {
  if (!props.isThinking) return false
  for (let i = index + 1; i < props.messages.length; i++) {
    if (props.messages[i]!.role !== 'thinking') return false
  }
  return true
}
</script>

<template>
  <div
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4"
    role="log"
    aria-live="polite"
    aria-relevant="additions"
  >
    <div class="mx-auto w-full max-w-2xl space-y-0">
      <template v-for="(msg, i) in messages" :key="i">
        <AgentAction
          v-if="msg.role === 'thinking'"
          class="mb-2"
          :action="msg.action ?? msg.text"
          :detail="msg.detail"
          :active="isActiveThinking(i)"
        />
        <AgentMessage v-else-if="msg.role === 'agent'" :text="msg.text" @retry="emit('retry-message', i)" />
        <UserMessage
          v-else-if="msg.role === 'user'"
          :text="msg.text"
          :attachments="msg.attachments"
          :session-id="props.sessionId"
          @edit="(text, attachments) => emit('edit-message', i, text, attachments)"
        />
      </template>

      <!-- Typing indicator: visible after user sends until agent response arrives -->
      <div v-if="isAwaitingResponse && waitingForAgent" class="flex items-center gap-1.5 pt-2 pb-1">
        <span class="typing-dot size-[7px] rounded-full bg-neutral-400" />
        <span class="typing-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.2s" />
        <span class="typing-dot size-[7px] rounded-full bg-neutral-400" style="animation-delay: 0.4s" />
      </div>
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
