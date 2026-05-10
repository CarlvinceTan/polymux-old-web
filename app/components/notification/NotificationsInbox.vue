<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const { t } = useI18n()
const user = useSupabaseUser()
const {
  notifications,
  hasNotifications,
  clearAll,
  fetchAll,
  subscribe,
  teardown,
} = useNotifications()

const open = ref(false)
const containerRef = ref<HTMLElement | null>(null)

onClickOutside(containerRef, () => { open.value = false })

function toggle() {
  open.value = !open.value
}

function formatRelativeTime(iso: string) {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t('notifications.justNow')
  if (mins < 60) return t('notifications.minutesAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('notifications.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return t('notifications.daysAgo', { n: days })
}

// Some notification types benefit from client-side i18n using metadata the
// trigger captured (e.g. file paths). Fall back to the server-written
// title/description for anything we don't render specially.
function titleFor(n: typeof notifications.value[number]): string {
  if (n.type === 'file_migrated_to_local') {
    return t('notifications.fileMigratedToLocalTitle')
  }
  if (n.type === 'file_share_received') {
    return t('notifications.fileShareReceivedTitle')
  }
  return n.title
}
function descriptionFor(n: typeof notifications.value[number]): string | null {
  if (n.type === 'file_migrated_to_local') {
    const path = typeof n.metadata?.file_path === 'string' ? n.metadata.file_path : ''
    return t('notifications.fileMigratedToLocalBody', { path })
  }
  if (n.type === 'file_share_received') {
    const rawPath = typeof n.metadata?.file_path === 'string' ? n.metadata.file_path : ''
    const path = rawPath || '/'
    const sourceMeta = n.metadata?.source_workspace_name
    const source = typeof sourceMeta === 'string' && sourceMeta
      ? sourceMeta
      : t('notifications.anotherWorkspace')
    return t('notifications.fileShareReceivedBody', { path, source })
  }
  return n.description
}

watch(user, (u) => {
  if (u) {
    fetchAll()
    subscribe()
  } else {
    teardown()
  }
}, { immediate: true })
</script>

<template>
  <div ref="containerRef" class="relative">
    <button
      type="button"
      class="relative flex size-9 items-center justify-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-950"
      :aria-label="t('notifications.title')"
      @click="toggle"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4"
        aria-hidden="true"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      <span
        v-if="hasNotifications"
        class="absolute right-2 top-2 block size-1.5 rounded-full bg-red-500 ring-2 ring-white"
        aria-hidden="true"
      />
    </button>

    <Menu :open="open" align="right" width="w-80">
      <div class="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span class="text-sm font-semibold text-neutral-950">{{ t('notifications.title') }}</span>
        <button
          type="button"
          class="text-xs font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!hasNotifications"
          @click="clearAll"
        >
          {{ t('notifications.clear') }}
        </button>
      </div>
      <div v-if="!hasNotifications" class="px-3 py-6 text-center text-xs text-neutral-400">
        {{ t('notifications.empty') }}
      </div>
      <ul v-else class="max-h-80 overflow-y-auto py-1">
        <li
          v-for="n in notifications"
          :key="n.id"
          class="px-3 py-2 transition-colors hover:bg-neutral-50"
        >
          <p class="truncate text-sm font-medium text-neutral-950">{{ titleFor(n) }}</p>
          <p v-if="descriptionFor(n)" class="mt-0.5 line-clamp-2 text-xs text-neutral-500">{{ descriptionFor(n) }}</p>
          <p class="mt-1 text-[10px] text-neutral-400">{{ formatRelativeTime(n.created_at) }}</p>
        </li>
      </ul>
    </Menu>
  </div>
</template>
