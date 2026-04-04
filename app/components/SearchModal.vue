<script setup lang="ts">
// Search modal visibility state (v-model)
const isOpen = defineModel<boolean>('open', { default: false })

// Current search query text
const searchQuery = ref('')

// Close on Escape key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

// Focus input when modal opens
const inputRef = ref<HTMLInputElement>()
watch(isOpen, (open) => {
  if (open) {
    nextTick(() => {
      inputRef.value?.focus()
    })
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
    searchQuery.value = ''
  }
})

// Clean up event listener on unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop: subtle tonal overlay instead of heavy dark -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-surface/80 backdrop-blur-[2px]"
        @click="isOpen = false"
      />
    </Transition>

    <!-- Modal: Glassmorphism with surface_container_lowest, soft shadow, rounded-lg -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="opacity-0 scale-95"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2"
      >
        <div class="mx-4 rounded-lg glass shadow-soft overflow-hidden">
          <!-- Search Input: ghost-style with surface_container_low, no border -->
          <div class="flex items-center gap-3 px-4 py-3 bg-surface-container-low">
            <svg class="size-5 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref="inputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Search chats, workspaces, vaults..."
              class="flex-1 bg-transparent text-body-lg outline-none placeholder:text-secondary text-on-surface"
            />
            <kbd class="rounded bg-surface-container px-2 py-0.5 text-label-md font-medium text-secondary">
              ESC
            </kbd>
          </div>

          <!-- Search Results Placeholder: tonal separation using background difference -->
          <div class="max-h-80 overflow-y-auto p-2 bg-surface-container-lowest">
            <div class="px-3 py-8 text-center text-body-md text-secondary">
              Type to search across your chats, workspaces, and vault items
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
