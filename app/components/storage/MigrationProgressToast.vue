<script setup lang="ts">
import { useI18n } from '#imports'

const STORAGE_SETTINGS_PATH = '/storage/settings'
// Kick the success/failure card off quickly once the work is done.
const AUTO_DISMISS_MS = 3000

const { t } = useI18n()
const route = useRoute()
const { state } = useDriveMigration()

// Tracks whether the user dismissed the *current* migration. Reset on each
// fresh run so a new migration always surfaces, even if the prior one was
// closed manually.
const isDismissed = ref(false)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

function clearDismissTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

watch(() => state.status, (status) => {
  clearDismissTimer()
  if (status === 'running') {
    isDismissed.value = false
    return
  }
  if (status === 'done' || status === 'failed') {
    dismissTimer = setTimeout(() => {
      isDismissed.value = true
    }, AUTO_DISMISS_MS)
  }
})

onUnmounted(clearDismissTimer)

const isOnStorageSettings = computed(() => route.path === STORAGE_SETTINGS_PATH)

const shouldShow = computed(() =>
  state.status !== 'idle'
  && !isOnStorageSettings.value
  && !isDismissed.value,
)

const titleKey = computed(() => {
  const isImport = state.direction === 'drive-to-supabase'
  if (state.status === 'running') {
    return isImport ? 'integrations.driveImporting' : 'integrations.driveMigrating'
  }
  if (state.status === 'done') {
    return isImport ? 'integrations.driveImportDone' : 'integrations.driveMigrateDone'
  }
  return isImport ? 'integrations.driveImportFailed' : 'integrations.driveMigrateFailed'
})

// Percent is derivable until the server reports `remaining`. Before the first
// batch returns (remaining === null) we fall back to an indeterminate bar.
const progressPercent = computed<number | null>(() => {
  if (state.status === 'done') return 100
  if (state.remaining === null) return null
  const processed = state.totalMigrated + state.totalSkipped
  const total = processed + state.remaining
  if (total === 0) return state.status === 'failed' ? 0 : 100
  return Math.min(100, Math.round((processed / total) * 100))
})

const barColorClass = computed(() => {
  if (state.status === 'done') return 'bg-green-500'
  if (state.status === 'failed') return 'bg-red-500'
  return 'bg-neutral-950'
})

function dismiss() {
  clearDismissTimer()
  isDismissed.value = true
}

async function viewInPanel() {
  if (route.path === STORAGE_SETTINGS_PATH) return
  await navigateTo(STORAGE_SETTINGS_PATH)
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="translate-y-4 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-4 opacity-0"
      >
        <div
          v-if="shouldShow"
          class="pointer-events-none fixed bottom-4 right-4 z-[55] flex w-[min(22rem,calc(100vw-2rem))]"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            class="pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-white p-3.5 shadow-2xl"
            :class="{
              'border-neutral-200': state.status === 'running',
              'border-green-200': state.status === 'done',
              'border-red-200': state.status === 'failed',
            }"
          >
            <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-google-drive-tint text-google-drive">
              <svg
                v-if="state.status === 'running'"
                class="size-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <svg
                v-else-if="state.status === 'done'"
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <svg
                v-else
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-body-md font-medium text-neutral-950">
                {{ t(titleKey) }}
              </p>
              <p
                v-if="state.status === 'running'"
                class="mt-0.5 text-label-md text-neutral-500"
              >
                {{ t('integrations.driveMigrateProgress', {
                  migrated: state.totalMigrated,
                  remaining: state.remaining ?? '—',
                }) }}
              </p>
              <p
                v-else-if="state.errors.length"
                class="mt-0.5 text-label-md text-neutral-500"
              >
                {{ t('integrations.driveMigrateSomeFailed', { count: state.errors.length }) }}
              </p>

              <div
                class="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100"
                role="progressbar"
                :aria-valuemin="0"
                :aria-valuemax="100"
                :aria-valuenow="progressPercent ?? undefined"
              >
                <div
                  v-if="progressPercent !== null"
                  class="h-full rounded-full transition-[width] duration-500 ease-out"
                  :class="barColorClass"
                  :style="{ width: `${progressPercent}%` }"
                />
                <div
                  v-else
                  class="h-full w-1/3 rounded-full bg-neutral-950"
                  style="animation: migration-progress-indeterminate 1.4s ease-in-out infinite;"
                />
              </div>

              <button
                type="button"
                class="mt-2 inline-flex items-center gap-1 text-label-md font-medium text-neutral-950 underline-offset-4 hover:underline"
                @click="viewInPanel"
              >
                {{ t('storage.settings.migrationToastView') }}
                <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              class="shrink-0 rounded text-neutral-400 transition-colors hover:text-neutral-950"
              :aria-label="t('common.close')"
              @click="dismiss"
            >
              <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
