<script setup lang="ts">
const { t } = useI18n()
const { sessions, fetchSessions } = useWorkflowList()

const isOpen = defineModel<boolean>('open', { default: false })

const searchQuery = ref('')
const inputRef = ref<HTMLInputElement>()
const { relativeOrAbsoluteTime } = useRelativeTime()

const queryText = computed(() => searchQuery.value.trim().toLowerCase())

const filteredSessions = computed(() => {
  const q = queryText.value
  const realSessions = sessions.value.filter(s => !s.is_draft)
  if (!q) return realSessions.slice(0, 8)
  return realSessions.filter(s => s.title.toLowerCase().includes(q)).slice(0, 8)
})

const hasQuery = computed(() => queryText.value.length > 0)

function workflowMeta(updatedAt: string) {
  return relativeOrAbsoluteTime(updatedAt)
}

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
  navigateTo(`/workflow/${sessionId}/agent`)
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
          class="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-[4px]"
          @click="isOpen = false"
        >
          <div
            class="w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-300/80 bg-white shadow-[0_28px_80px_rgba(26,28,28,0.18),0_1px_0_rgba(255,255,255,0.9)_inset]"
            @click.stop
          >
            <div class="flex min-h-[62px] items-center gap-3 border-b border-neutral-200 px-4 bg-white">
              <svg class="size-5 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref="inputRef"
                v-model="searchQuery"
                name="global-search"
                type="text"
                :placeholder="t('search.placeholder')"
                class="min-w-0 flex-1 bg-transparent text-body-lg font-medium text-neutral-950 outline-none placeholder:text-neutral-500"
              />
              <button
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-950"
                :aria-label="t('common.close')"
                @click="handleClear"
              >
                <svg class="size-[1.125em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="max-h-[25rem] overflow-y-auto bg-neutral-50 p-2">
              <div v-if="filteredSessions.length === 0" class="px-3 py-10 text-center text-body-md text-neutral-500">
                {{ hasQuery ? t('search.noResults') : t('search.emptyState') }}
              </div>
              <template v-else>
                <div class="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  {{ t('nav.workflows') }}
                </div>
                <ul class="space-y-1">
                  <li v-for="session in filteredSessions" :key="session.id">
                    <button
                      type="button"
                      class="grid min-h-[54px] w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-white hover:shadow-[inset_0_0_0_1px_rgba(198,198,198,0.7)]"
                      @click="handleResultClick(session.id)"
                    >
                      <span class="grid size-[32px] shrink-0 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-500">
                        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M12 2 2 7l10 5 10-5-10-5z" />
                          <path d="m2 12 10 5 10-5" />
                          <path d="m2 17 10 5 10-5" />
                        </svg>
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-body-md font-semibold text-neutral-950">
                          {{ session.title }}
                        </span>
                        <span
                          v-if="workflowMeta(session.updated_at)"
                          class="mt-0.5 block truncate text-xs text-neutral-500"
                        >
                          {{ workflowMeta(session.updated_at) }}
                        </span>
                      </span>
                      <span
                        v-if="session.is_running"
                        class="inline-flex shrink-0 items-center gap-1.5 text-xs text-neutral-500"
                      >
                        <span class="size-1.5 rounded-full bg-gold" aria-hidden="true" />
                        <span>{{ t('workflow.running') }}</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
