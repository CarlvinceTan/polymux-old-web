<script setup lang="ts">
import type { ViewportState } from '~/composables/types'

const { t } = useI18n()

const props = defineProps<{
  viewport: ViewportState
  frameUrl?: string
  onTrafficRed?: () => void
  onTrafficYellow?: () => void
  onTrafficGreen?: () => void
}>()

const emit = defineEmits<{
  close: []
}>()
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="emit('close')"
      >
        <div
          class="relative max-h-[min(92vh,920px)] w-full max-w-[min(96vw,72rem)] overflow-auto rounded-xl bg-white p-3 shadow-2xl ring-1 ring-neutral-950/10"
          role="dialog"
          aria-modal="true"
          :aria-label="t('chat.expandedBrowserPreview')"
          @click.stop
        >
          <Viewport
            class="w-full min-w-0"
            v-bind="viewport"
            :frame-url="frameUrl"
            :on-traffic-red="onTrafficRed"
            :on-traffic-yellow="onTrafficYellow"
            :on-traffic-green="onTrafficGreen"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
