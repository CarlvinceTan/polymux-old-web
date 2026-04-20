<script setup lang="ts">
import type { ChatSession } from '~/composables/useChatSessions'

const props = defineProps<{
  sessions: ChatSession[]
}>()

const { t } = useI18n()
const { relativeTime } = useRelativeTime()

const recentSessions = computed(() =>
  [...props.sessions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8),
)

function sessionTitle(session: ChatSession): string {
  return session.title?.trim() || t('dashboard.untitledSession')
}
</script>

<template>
  <div class="rounded-lg ghost-panel bg-white p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-neutral-950">{{ t('dashboard.recentSessions') }}</h2>
      <NuxtLink
        to="/chat/"
        class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-950"
      >
        {{ t('dashboard.viewAll') }}
      </NuxtLink>
    </div>

    <div v-if="recentSessions.length === 0" class="flex flex-col items-center gap-3 py-8 text-center">
      <p class="text-sm text-neutral-400">{{ t('dashboard.noSessions') }}</p>
      <NuxtLink
        to="/chat/"
        class="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        {{ t('dashboard.noSessionsCta') }}
      </NuxtLink>
    </div>

    <div v-else class="space-y-1">
      <NuxtLink
        v-for="session in recentSessions"
        :key="session.id"
        :to="`/chat/${session.id}/orchestrator`"
        class="group flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-neutral-50"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-neutral-950">{{ sessionTitle(session) }}</p>
          <p class="mt-0.5 text-xs text-neutral-400">{{ relativeTime(session.updated_at) }}</p>
        </div>
        <span class="ml-3 text-xs font-medium text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
          {{ t('dashboard.viewSession') }} →
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
