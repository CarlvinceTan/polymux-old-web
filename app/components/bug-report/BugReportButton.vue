<script setup lang="ts">
const hovered = ref(false)
const open = ref(false)

const panelRef = ref<HTMLElement | null>(null)

function handleTriggerClick() {
  if (!open.value) {
    open.value = true
    hovered.value = false
  }
  else {
    close()
  }
}

function close() {
  open.value = false
}

function onPointerDownOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (panelRef.value && !panelRef.value.contains(target)) {
    close()
  }
}

onMounted(() => document.addEventListener('mousedown', onPointerDownOutside))
onUnmounted(() => document.removeEventListener('mousedown', onPointerDownOutside))
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="translate-y-2 scale-95 opacity-0"
        leave-to-class="translate-y-2 scale-95 opacity-0"
      >
        <div
          v-if="open"
          ref="panelRef"
          class="fixed bottom-5 right-5 z-[9999] w-[340px] rounded-2xl bg-white ring-1 ring-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
          role="dialog"
          aria-label="Report a bug"
        >
          <div class="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
            <h3 class="text-sm font-semibold text-neutral-900">Report a Bug</h3>
            <button
              type="button"
              class="rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
              @click="close"
            >
              <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
            </button>
          </div>
          <BugReportForm @close="close" />
        </div>
      </Transition>

      <div
        v-if="!open"
        ref="triggerRef"
        class="fixed bottom-5 right-5 z-[9999] flex items-center"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @click.stop="handleTriggerClick"
      >
        <Transition
          enter-active-class="transition-all duration-250 ease-out"
          leave-active-class="transition-all duration-200 ease-in"
          enter-from-class="max-w-0 opacity-0"
          enter-to-class="max-w-[160px] opacity-100"
          leave-from-class="max-w-[160px] opacity-100"
          leave-to-class="max-w-0 opacity-0"
        >
          <span
            v-if="hovered && !open"
            class="mr-[-20px] flex h-10 cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-l-full bg-neutral-900 pl-4 pr-[28px] text-xs font-medium text-white shadow-lg"
          >
            Report a bug
          </span>
        </Transition>

        <button
          type="button"
          class="relative z-10 flex size-10 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition-shadow hover:shadow-xl"
          aria-label="Report a bug"
        >
          <UIcon name="i-heroicons-bug-ant" class="size-5" />
        </button>
      </div>
    </Teleport>
  </ClientOnly>
</template>
