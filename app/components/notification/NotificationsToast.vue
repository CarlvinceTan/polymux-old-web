<script setup lang="ts">
import type { AppNotification } from '~/composables/useNotifications'

const { pendingToasts, dismissToast } = useNotifications()

const TOAST_MS = 3000
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * When a new toast lands in the queue we start a 3s countdown that removes it
 * from `pendingToasts` (the Transition handles the slide-out). Keyed timers so
 * manual dismiss can cancel the auto-dismiss cleanly.
 */
watch(pendingToasts, (toasts) => {
  for (const toast of toasts) {
    if (timers.has(toast.id)) continue
    timers.set(
      toast.id,
      setTimeout(() => {
        dismissToast(toast.id)
        timers.delete(toast.id)
      }, TOAST_MS),
    )
  }
  // Drop timers for toasts that have already been removed (e.g. manual dismiss).
  const live = new Set(toasts.map(t => t.id))
  for (const [id, handle] of timers) {
    if (!live.has(id)) {
      clearTimeout(handle)
      timers.delete(id)
    }
  }
}, { deep: true, immediate: true })

onUnmounted(() => {
  for (const handle of timers.values()) clearTimeout(handle)
  timers.clear()
})

function handleDismiss(toast: AppNotification) {
  dismissToast(toast.id)
}
</script>

<template>
  <Teleport to="body">
    <!--
      Top inset of 10px and toast height ~44px visually centers between the
      viewport top (0) and the tab panel top (~64px from top = pt-2 + h-14).
    -->
    <div
      class="pointer-events-none fixed right-4 top-2.5 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="-translate-y-16 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition-all duration-300 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-16 opacity-0"
      >
        <div
          v-for="toast in pendingToasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-2xl ring-1 ring-neutral-200"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-neutral-950">{{ toast.title }}</p>
            <p
              v-if="toast.description"
              class="mt-0.5 line-clamp-2 text-xs text-neutral-500"
            >{{ toast.description }}</p>
          </div>
          <button
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            :aria-label="$t('common.close')"
            @click="handleDismiss(toast)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-3.5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
