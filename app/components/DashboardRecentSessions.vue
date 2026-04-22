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
    .slice(0, 6),
)

function sessionTitle(session: ChatSession): string {
  return session.title?.trim() || t('dashboard.untitledSession')
}

function initials(session: ChatSession): string {
  const title = sessionTitle(session)
  const parts = title.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()
  return letters || '•'
}

function isRecent(session: ChatSession): boolean {
  return Date.now() - new Date(session.updated_at).getTime() < 1000 * 60 * 60 * 24
}
</script>

<template>
  <section class="flex h-full flex-col rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
    <header class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-neutral-950">
          {{ t('dashboard.recentSessions') }}
        </h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{ t('dashboard.recentSessionsDesc') }}
        </p>
      </div>
      <NuxtLink
        to="/workflow/"
        class="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        {{ t('dashboard.viewAll') }}
        <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3" />
      </NuxtLink>
    </header>

    <div
      v-if="recentSessions.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 py-10 text-center"
    >
      <div class="flex size-12 items-center justify-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
        <UIcon name="i-heroicons-chat-bubble-oval-left-ellipsis-20-solid" class="size-5" />
      </div>
      <div class="px-4">
        <p class="text-sm font-medium text-neutral-950">
          {{ t('dashboard.noSessions') }}
        </p>
        <p class="mt-1 text-xs text-neutral-400">
          {{ t('dashboard.noSessionsHint') }}
        </p>
      </div>
      <NuxtLink
        to="/workflow/"
        class="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <UIcon name="i-heroicons-plus-20-solid" class="size-3.5" />
        {{ t('dashboard.noSessionsCta') }}
      </NuxtLink>
    </div>

    <ul v-else class="-mx-2 flex flex-col">
      <li v-for="session in recentSessions" :key="session.id">
        <NuxtLink
          :to="`/workflow/${session.id}/agent`"
          class="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-neutral-50"
        >
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 text-[11px] font-semibold tracking-tight text-neutral-700"
          >
            {{ initials(session) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="truncate text-sm font-medium text-neutral-950">
                {{ sessionTitle(session) }}
              </p>
              <span
                v-if="isRecent(session)"
                class="shrink-0 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-green-700 ring-1 ring-green-200/60"
              >
                {{ t('dashboard.sessionActive') }}
              </span>
            </div>
            <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span
                class="size-1.5 rounded-full"
                :class="isRecent(session) ? 'bg-green-500' : 'bg-neutral-300'"
              />
              {{ relativeTime(session.updated_at) }}
            </p>
          </div>
          <UIcon
            name="i-heroicons-arrow-up-right-20-solid"
            class="size-4 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
