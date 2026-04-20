<script setup lang="ts">
const { t } = useI18n()
const { sessions, fetchSessions } = useChatSessions()

const isOpen = defineModel<boolean>('open', { default: false })

const searchQuery = ref('')
const inputRef = ref<HTMLInputElement>()

const filteredSessions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return sessions.value.filter(s => s.title.toLowerCase().includes(q)).slice(0, 8)
})

function handleClear() {
  if (searchQuery.value) {
    searchQuery.value = ''
    inputRef.value?.focus()
  } else {
    isOpen.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

function handleResultClick(sessionId: string) {
  navigateTo(`/chat/${sessionId}/orchestrator`)
  isOpen.value = false
  searchQuery.value = ''
}

watch(isOpen, (open) => {
  if (open) {
    nextTick(() => {
      inputRef.value?.focus()
    })
    document.addEventListener('keydown', handleKeydown)
    if (sessions.value.length === 0) {
      fetchSessions()
    }
  } else {
    document.removeEventListener('keydown', handleKeydown)
    searchQuery.value = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 scale-95"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-[2px] p-4"
          @click="isOpen = false"
        >
          <div class="w-full max-w-lg rounded-lg glass shadow-soft overflow-hidden" @click.stop>
            <div class="flex items-center gap-3 px-4 py-3 bg-surface-container-low">
              <svg class="size-[1.125em] shrink-0 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                :placeholder="t('search.placeholder')"
                class="flex-1 bg-transparent text-body-lg outline-none placeholder:text-secondary text-on-surface"
              />
              <button
                class="p-1 text-secondary hover:text-on-surface transition-colors"
                @click="handleClear"
              >
                <svg class="size-[1.125em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="max-h-80 overflow-y-auto p-2 bg-surface-container-lowest">
              <template v-if="searchQuery.trim()">
                <div v-if="filteredSessions.length === 0" class="px-3 py-8 text-center text-body-md text-secondary">
                  {{ t('search.noResults') }}
                </div>
                <ul v-else class="space-y-0.5">
                  <li v-for="session in filteredSessions" :key="session.id">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-body-md text-on-surface hover:bg-surface-container-high transition-colors"
                      @click="handleResultClick(session.id)"
                    >
                      <svg class="size-4 shrink-0 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span class="truncate">{{ session.title }}</span>
                    </button>
                  </li>
                </ul>
              </template>
              <div v-else class="px-3 py-8 text-center text-body-md text-secondary">
                {{ t('search.emptyState') }}
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
