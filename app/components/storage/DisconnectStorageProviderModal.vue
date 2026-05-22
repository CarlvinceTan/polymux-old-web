<script setup lang="ts">
import { useI18n } from '#imports'
import type { StorageProvider } from '~/types/storage'
import type { LocalMigrationDirection } from '~/composables/storage/useLocalMigration'

const props = defineProps<{
  open: boolean
  provider: StorageProvider | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'disconnect': []
}>()

const { t } = useI18n()
const { currentWorkspace } = useWorkspaces()
const { providerStatus } = useStoragePreferences()
const { state: localMigrationState, run: runLocalMigration } = useLocalMigration()

const ALL_PROVIDERS: StorageProvider[] = ['google-drive', 'local']

const providerLabel = computed<Record<StorageProvider, string>>(() => ({
  'google-drive': t('storage.settings.providerGoogleDrive'),
  'local': t('storage.settings.providerLocal'),
  'b2': t('storage.settings.providerCloud'),
}))

const phase = ref<'idle' | 'checking' | 'choose' | 'migrating' | 'done' | 'failed'>('idle')
const fileCount = ref(0)
const targetProvider = ref<StorageProvider | null>(null)
const targetPickerOpen = ref(false)
const targetPickerRef = ref<HTMLElement | null>(null)

// Targets are every provider except the one being disconnected, filtered to
// those currently writable. Drive ↔ local pairs are flagged in
// useLocalMigration; we trust providerStatus here.
const targetCandidates = computed<StorageProvider[]>(() => {
  if (!props.provider) return []
  return ALL_PROVIDERS.filter(p => p !== props.provider && providerStatus.value[p] === 'available')
})

const noTargetsAvailable = computed(() => targetCandidates.value.length === 0)

function directionFor(source: StorageProvider, target: StorageProvider): LocalMigrationDirection | null {
  if (source === 'google-drive' && target === 'local') return 'drive-to-local'
  if (source === 'local' && target === 'google-drive') return 'local-to-drive'
  return null
}

const activeDirection = computed<LocalMigrationDirection | null>(() => {
  if (!props.provider || !targetProvider.value) return null
  return directionFor(props.provider, targetProvider.value)
})

const activeMigrationState = computed(() => (activeDirection.value ? localMigrationState : null))

const isMigrationRunning = computed(() => localMigrationState.status === 'running')

async function refreshFileCount() {
  if (!props.provider) return
  const workspaceId = currentWorkspace.value?.id
  if (!workspaceId) return
  phase.value = 'checking'
  try {
    const res = await $fetch<{ ok: true; backend: StorageProvider; count: number }>(
      `/api/workspaces/${workspaceId}/files/count-by-backend`,
      { method: 'POST', body: { backend: props.provider } },
    )
    fileCount.value = res.count
    if (res.count === 0) {
      // Nothing on this provider — skip the picker entirely; user just
      // confirms the disconnect.
      phase.value = 'done'
    }
    else {
      phase.value = 'choose'
      targetProvider.value = targetCandidates.value[0] ?? null
    }
  }
  catch (err) {
    console.error('[DisconnectStorageProviderModal] count fetch failed', err)
    fileCount.value = 0
    phase.value = 'failed'
  }
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    fileCount.value = 0
    targetProvider.value = null
    targetPickerOpen.value = false
    await refreshFileCount()
  }
  else {
    phase.value = 'idle'
  }
})

function close() {
  if (isMigrationRunning.value) return
  emit('update:open', false)
}

function selectTarget(p: StorageProvider) {
  targetProvider.value = p
  targetPickerOpen.value = false
}

async function migrateAndDisconnect() {
  const dir = activeDirection.value
  if (!dir) return
  phase.value = 'migrating'
  try {
    await runLocalMigration(dir)
    if (localMigrationState.status === 'failed') {
      phase.value = 'failed'
      return
    }
    // Re-check whether anything still lives on the source backend. The
    // migration loops bail when batches fail or items are too large, so a
    // "done" status doesn't guarantee the source is empty.
    await refreshFileCount()
    if (fileCount.value > 0) {
      phase.value = 'choose'
      return
    }
    phase.value = 'done'
    emit('disconnect')
    emit('update:open', false)
  }
  catch (err) {
    console.error('[DisconnectStorageProviderModal] migration failed', err)
    phase.value = 'failed'
  }
}

function disconnectNow() {
  if (fileCount.value > 0) return
  emit('disconnect')
  emit('update:open', false)
}

function handleClickOutside(event: MouseEvent) {
  if (
    targetPickerOpen.value
    && targetPickerRef.value
    && !targetPickerRef.value.contains(event.target as Node)
  ) {
    targetPickerOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && !isMigrationRunning.value) close()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
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
          v-if="open && provider"
          class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          @click="close"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="open && provider"
              class="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              role="dialog"
              aria-modal="true"
              :aria-label="t('storage.disconnect.title', { provider: providerLabel[provider] })"
              @click.stop
            >
              <button
                type="button"
                class="absolute right-4 top-4 z-10 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40"
                :aria-label="t('common.close')"
                :disabled="isMigrationRunning"
                @click="close"
              >
                <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
              </button>

              <header class="flex items-start gap-3 px-6 pb-3 pt-6">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                  <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-5" />
                </div>
                <div class="min-w-0 flex-1 pr-8">
                  <h2 class="text-title-sm font-semibold tracking-tight text-neutral-950">
                    {{ t('storage.disconnect.title', { provider: providerLabel[provider] }) }}
                  </h2>
                  <p class="mt-1 text-body-md text-neutral-500">
                    {{ t('storage.disconnect.subtitle', { provider: providerLabel[provider] }) }}
                  </p>
                </div>
              </header>

              <!-- Body -->
              <div class="border-t border-neutral-100 px-6 py-5">
                <!-- Phase: checking file count -->
                <div v-if="phase === 'checking'" class="flex items-center gap-3 text-body-md text-neutral-500">
                  <UIcon name="i-heroicons-arrow-path-20-solid" class="size-4 animate-spin" />
                  {{ t('storage.disconnect.checking') }}
                </div>

                <!-- Phase: failed to fetch / migration error -->
                <div
                  v-else-if="phase === 'failed' && fileCount === 0"
                  class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-md text-red-800"
                >
                  {{ t('storage.disconnect.checkFailed') }}
                </div>

                <!-- Phase: nothing on this provider, safe to disconnect -->
                <div v-else-if="phase === 'done' && fileCount === 0">
                  <p class="text-body-md text-neutral-700">
                    {{ t('storage.disconnect.noFiles', { provider: providerLabel[provider] }) }}
                  </p>
                </div>

                <!-- Phase: choose target / migrating -->
                <div v-else class="flex flex-col gap-4">
                  <div class="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-body-md text-amber-900">
                    <p>
                      {{ t('storage.disconnect.fileCountWarning', { count: fileCount, provider: providerLabel[provider] }) }}
                    </p>
                  </div>

                  <!-- Source → target picker -->
                  <div v-if="!noTargetsAvailable" class="flex items-end gap-2">
                    <div class="flex-1 min-w-0">
                      <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        {{ t('storage.disconnect.fromLabel') }}
                      </span>
                      <div class="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-body-md font-medium text-neutral-800">
                        <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-white">
                          <StorageProviderIcon :provider="provider" tile />
                        </span>
                        <span class="truncate">{{ providerLabel[provider] }}</span>
                      </div>
                    </div>

                    <UIcon
                      name="i-heroicons-arrow-long-right-20-solid"
                      class="mb-2.5 size-5 shrink-0 text-neutral-400"
                      aria-hidden="true"
                    />

                    <div ref="targetPickerRef" class="relative flex-1 min-w-0">
                      <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        {{ t('storage.disconnect.toLabel') }}
                      </span>
                      <button
                        type="button"
                        class="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-body-md font-medium text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                        :aria-haspopup="true"
                        :aria-expanded="targetPickerOpen"
                        :disabled="isMigrationRunning"
                        @click.stop="targetPickerOpen = !targetPickerOpen"
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <template v-if="targetProvider">
                            <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-white">
                              <StorageProviderIcon :provider="targetProvider" tile />
                            </span>
                            <span class="truncate">{{ providerLabel[targetProvider] }}</span>
                          </template>
                          <span v-else class="truncate text-neutral-500">
                            {{ t('storage.disconnect.pickTarget') }}
                          </span>
                        </span>
                        <UIcon
                          name="i-heroicons-chevron-down-20-solid"
                          class="size-4 shrink-0 text-neutral-400 transition-transform"
                          :class="targetPickerOpen ? 'rotate-180' : ''"
                        />
                      </button>
                      <Menu :open="targetPickerOpen" align="left" width="w-full">
                        <button
                          v-for="p in targetCandidates"
                          :key="p"
                          type="button"
                          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-md transition-colors hover:bg-neutral-100"
                          :class="p === targetProvider ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                          @click.stop="selectTarget(p)"
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                              <StorageProviderIcon :provider="p" tile />
                            </span>
                            <span class="truncate">{{ providerLabel[p] }}</span>
                          </span>
                          <UIcon
                            v-if="p === targetProvider"
                            name="i-heroicons-check-20-solid"
                            class="size-4 shrink-0 text-neutral-950"
                          />
                        </button>
                      </Menu>
                    </div>
                  </div>

                  <!-- No other provider available — user can't migrate -->
                  <div
                    v-else
                    class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-md text-red-800"
                  >
                    {{ t('storage.disconnect.noTargets') }}
                  </div>

                  <!-- Live migration progress -->
                  <MigrationStatusCard
                    v-if="activeMigrationState && activeMigrationState.status !== 'idle'"
                    :state="activeMigrationState"
                  />
                </div>
              </div>

              <!-- Footer -->
              <div class="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-3.5">
                <button
                  type="button"
                  class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  :disabled="isMigrationRunning"
                  @click="close"
                >
                  {{ t('common.cancel') }}
                </button>

                <!-- No files: just disconnect -->
                <button
                  v-if="phase === 'done' && fileCount === 0"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-red-700"
                  @click="disconnectNow"
                >
                  <UIcon name="i-heroicons-link-slash-20-solid" class="size-4" />
                  {{ t('storage.disconnect.disconnect') }}
                </button>

                <!-- Files exist: migrate then disconnect -->
                <button
                  v-else-if="fileCount > 0 && !noTargetsAvailable"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!targetProvider || !activeDirection || isMigrationRunning"
                  @click="migrateAndDisconnect"
                >
                  <UIcon
                    v-if="isMigrationRunning"
                    name="i-heroicons-arrow-path-20-solid"
                    class="size-4 animate-spin"
                  />
                  <UIcon
                    v-else
                    name="i-heroicons-arrow-up-tray-20-solid"
                    class="size-4"
                  />
                  {{ isMigrationRunning
                    ? t('storage.disconnect.migrating')
                    : t('storage.disconnect.migrateAndDisconnect') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
