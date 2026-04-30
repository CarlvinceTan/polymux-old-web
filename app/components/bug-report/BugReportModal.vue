<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          @click="isOpen = false"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="isOpen"
              class="w-full max-w-[380px] rounded-2xl bg-white ring-1 ring-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              role="dialog"
              aria-label="Report a bug"
              @click.stop
            >
              <div class="relative px-5 pt-5 pb-4">
                <button
                  type="button"
                  class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                  @click="isOpen = false"
                >
                  <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
                </button>
                <h3 class="text-sm font-semibold text-neutral-900 pr-8">Report a Bug</h3>
              </div>
              <BugReportForm @close="isOpen = false" />
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
