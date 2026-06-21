<script setup lang="ts">
import type { CursorState, ViewportState } from '~/composables/types'

const { t } = useI18n()

const props = defineProps<{
  viewport: ViewportState
  frameUrl?: string
  cursor?: CursorState
  showCursor?: boolean
  /** Monotonic per-agent click counter; each increment fires a click ripple. */
  clickNonce?: number
}>()

const emit = defineEmits<{
  close: []
}>()

const showAgentCursor = computed(
  () => !!props.showCursor && !!props.cursor && !!props.frameUrl,
)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/65 backdrop-blur-[2px]"
        role="presentation"
        @click.self="emit('close')"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="t('chat.expandedBrowserPreview')"
          class="relative flex items-center justify-center"
          @click.stop
        >
          <button
            type="button"
            class="absolute -top-9 right-0 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-white/70 ring-0 transition-colors hover:text-white"
            :aria-label="t('viewport.closeExpanded')"
            @click="emit('close')"
          >
            <UIcon name="i-heroicons-x-mark" class="size-4" />
          </button>
          <div v-if="frameUrl" class="relative inline-block">
            <img
              :src="frameUrl"
              alt=""
              class="block max-h-[85vh] max-w-[90vw] rounded-lg"
            >
            <AgentCursor
              v-if="showAgentCursor && cursor"
              :cursor="cursor"
              :click-nonce="clickNonce"
              :size="26"
            />
          </div>
          <div
            v-else
            class="relative flex items-center justify-center rounded-lg bg-white"
            style="aspect-ratio: 16 / 9; width: min(90vw, calc(85vh * 16 / 9));"
          >
            <svg
              class="size-10 animate-spin text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              role="status"
              :aria-label="t('viewport.reconnecting')"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
