<script setup lang="ts">
import type { MigrationDirection } from '~/composables/storage/useDriveMigration'
import type { LocalMigrationDirection } from '~/composables/storage/useLocalMigration'
import type { StorageProvider } from '~/types/storage'

type AnyDirection = MigrationDirection | LocalMigrationDirection

const headerTabs = {
  FILES: '/storage/files',
  SETTINGS: '/storage/settings',
} as const satisfies Record<string, string>

const { t } = useI18n()
const {
  providerStatus,
  resolvedOrder,
  moveUp,
  moveDown,
  reset,
} = useStoragePreferences()
const { state: driveMigrationState, run: runDriveMigration } = useDriveMigration()
const { state: localMigrationState, run: runLocalMigration } = useLocalMigration()
const { currentWorkspace } = useWorkspaces()
const { isInstalled, install, uninstall } = useMarketplace()

const ALL_PROVIDERS: StorageProvider[] = ['supabase', 'google-drive', 'local']

const providerLabel = computed<Record<StorageProvider, string>>(() => ({
  'supabase': t('storage.settings.providerCloud'),
  'google-drive': t('storage.settings.providerGoogleDrive'),
  'local': t('storage.settings.providerLocal'),
}))

const providerDescription = computed<Record<StorageProvider, string>>(() => ({
  'supabase': t('storage.settings.providerCloudDesc'),
  'google-drive': t('storage.settings.providerGoogleDriveDesc'),
  'local': t('storage.settings.providerLocalDesc'),
}))

const availableProviders = computed<StorageProvider[]>(() =>
  ALL_PROVIDERS.filter(p => providerStatus.value[p] === 'available'),
)

const statusLabel = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return t('storage.settings.statusAvailable')
  if (status === 'full') return t('storage.settings.statusFull')
  return t('storage.settings.statusUnavailable')
}

const statusDotClass = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return 'bg-green-500'
  if (status === 'full') return 'bg-amber-500'
  return 'bg-neutral-300'
}

const statusTextClass = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return 'text-green-700'
  if (status === 'full') return 'text-amber-800'
  return 'text-neutral-500'
}

// ---- Migration ----
const myRole = computed(() => currentWorkspace.value?.role)
const canManage = computed(() => myRole.value === 'owner' || myRole.value === 'admin')

const sourceProvider = ref<StorageProvider>('supabase')
const destinationProvider = ref<StorageProvider>('google-drive')

// Keep dropdown selections within the set of currently-available providers.
// If a chosen provider becomes unavailable (e.g. user disconnects Drive in the
// connections panel below), fall back to the first remaining option, avoiding
// the other side so they stay distinct when possible.
watch(availableProviders, (next) => {
  if (!next.includes(sourceProvider.value)) {
    sourceProvider.value = next.find(p => p !== destinationProvider.value) ?? next[0] ?? sourceProvider.value
  }
  if (!next.includes(destinationProvider.value)) {
    destinationProvider.value = next.find(p => p !== sourceProvider.value) ?? next[0] ?? destinationProvider.value
  }
}, { immediate: true })

const sourceOpen = ref(false)
const destinationOpen = ref(false)
const sourceSelectorRef = ref<HTMLElement | null>(null)
const destinationSelectorRef = ref<HTMLElement | null>(null)

function selectSource(provider: StorageProvider) {
  sourceProvider.value = provider
  sourceOpen.value = false
}

function selectDestination(provider: StorageProvider) {
  destinationProvider.value = provider
  destinationOpen.value = false
}

interface Blocker {
  messageKey: string
  messageParams?: Record<string, string>
  action?: { labelKey: string; to: string }
}

const pairBlockers = computed<Blocker[]>(() => {
  const blockers: Blocker[] = []
  if (!canManage.value) {
    blockers.push({ messageKey: 'storage.settings.migrationRequiresAdmin' })
  }
  if (availableProviders.value.length < 2) {
    blockers.push({ messageKey: 'storage.settings.migrationNeedsTwoProviders' })
    return blockers
  }
  if (sourceProvider.value === destinationProvider.value) {
    blockers.push({ messageKey: 'storage.settings.migrationSameProvider' })
    return blockers
  }
  if (providerStatus.value[sourceProvider.value] !== 'available') {
    if (sourceProvider.value === 'google-drive') {
      blockers.push({
        messageKey: 'storage.settings.migrationSourceRequiresDrive',
        action: { labelKey: 'integrations.connect', to: '/integrations/marketplace' },
      })
    }
    else if (sourceProvider.value === 'local') {
      blockers.push({ messageKey: 'storage.settings.migrationSourceLocalUnsupported' })
    }
    else {
      blockers.push({
        messageKey: 'storage.settings.migrationSourceUnavailable',
        messageParams: { provider: providerLabel.value[sourceProvider.value] },
      })
    }
  }
  if (providerStatus.value[destinationProvider.value] !== 'available') {
    if (destinationProvider.value === 'google-drive') {
      blockers.push({
        messageKey: 'storage.settings.migrationRequiresDrive',
        action: { labelKey: 'integrations.connect', to: '/integrations/marketplace' },
      })
    }
    else if (destinationProvider.value === 'local') {
      blockers.push({ messageKey: 'storage.settings.migrationDestinationLocalUnsupported' })
    }
    else {
      blockers.push({
        messageKey: 'storage.settings.migrationDestinationUnavailable',
        messageParams: { provider: providerLabel.value[destinationProvider.value] },
      })
    }
  }
  if (currentDirection.value === null) {
    blockers.push({ messageKey: 'storage.settings.migrationPairUnsupported' })
  }
  return blockers
})

const currentDirection = computed<AnyDirection | null>(() => {
  const s = sourceProvider.value
  const d = destinationProvider.value
  if (s === 'supabase' && d === 'google-drive') return 'supabase-to-drive'
  if (s === 'google-drive' && d === 'supabase') return 'drive-to-supabase'
  if (s === 'supabase' && d === 'local') return 'supabase-to-local'
  if (s === 'google-drive' && d === 'local') return 'drive-to-local'
  if (s === 'local' && d === 'supabase') return 'local-to-supabase'
  if (s === 'local' && d === 'google-drive') return 'local-to-drive'
  return null
})

function isLocalDirection(dir: AnyDirection): dir is LocalMigrationDirection {
  return dir === 'supabase-to-local'
    || dir === 'drive-to-local'
    || dir === 'local-to-supabase'
    || dir === 'local-to-drive'
}

const activeMigrationState = computed(() => {
  const dir = currentDirection.value
  if (!dir) return null
  return isLocalDirection(dir) ? localMigrationState : driveMigrationState
})

const isMigrationReady = computed(() => pairBlockers.value.length === 0)
const isMigrationRunning = computed(() =>
  driveMigrationState.status === 'running' || localMigrationState.status === 'running',
)
const showMigrationProgress = computed(() => {
  const state = activeMigrationState.value
  if (!state) return false
  return state.direction === currentDirection.value && state.status !== 'idle'
})

const isConfirmOpen = ref(false)
const loadingAccessLoss = ref(false)

interface AccessLossPreview {
  affectedUsers: Array<{ user_id: string; display_name: string; email: string }>
  affectedFilesCount: number
}

const accessLossPreview = ref<AccessLossPreview | null>(null)

async function openMigrationConfirm() {
  if (!isMigrationReady.value || isMigrationRunning.value) return
  accessLossPreview.value = null
  const workspaceId = currentWorkspace.value?.id
  if (destinationProvider.value === 'local' && workspaceId) {
    loadingAccessLoss.value = true
    try {
      const source = sourceProvider.value === 'google-drive' ? 'google-drive' : 'supabase'
      const res = await $fetch<AccessLossPreview & { ok: true }>(
        `/api/workspaces/${workspaceId}/files/preview-access-loss`,
        { method: 'POST', body: { source } },
      )
      accessLossPreview.value = {
        affectedUsers: res.affectedUsers ?? [],
        affectedFilesCount: res.affectedFilesCount ?? 0,
      }
    }
    catch (err) {
      console.warn('[storage/settings] access-loss preview failed', err)
      accessLossPreview.value = { affectedUsers: [], affectedFilesCount: 0 }
    }
    finally {
      loadingAccessLoss.value = false
    }
  }
  isConfirmOpen.value = true
}

async function confirmMigration() {
  const dir = currentDirection.value
  if (!dir || !isMigrationReady.value) return
  isConfirmOpen.value = false
  if (isLocalDirection(dir)) {
    await runLocalMigration(dir)
  }
  else {
    await runDriveMigration(dir)
  }
}

// ---- Connections panel ----
// supabase is account-bound (no toggle); google-drive flows through the
// marketplace OAuth install + the existing disconnect modal; local is a
// browser capability surfaced for visibility only.
const isDriveConnected = computed(() => isInstalled('google-drive'))

const disconnectModalOpen = ref(false)
const pendingDisconnectProvider = ref<StorageProvider | null>(null)

function connectProvider(provider: StorageProvider) {
  if (provider === 'google-drive') {
    install('google-drive')
  }
}

function openDisconnect(provider: StorageProvider) {
  pendingDisconnectProvider.value = provider
  disconnectModalOpen.value = true
}

async function onConfirmDisconnect() {
  if (pendingDisconnectProvider.value === 'google-drive') {
    await uninstall('google-drive')
  }
  pendingDisconnectProvider.value = null
}

function handleMigrationClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (sourceOpen.value && sourceSelectorRef.value && !sourceSelectorRef.value.contains(target)) {
    sourceOpen.value = false
  }
  if (destinationOpen.value && destinationSelectorRef.value && !destinationSelectorRef.value.contains(target)) {
    destinationOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleMigrationClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleMigrationClickOutside)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
          <div class="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
            <!-- Hero -->
            <section
              class="relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white via-white to-neutral-50 p-5 sm:p-7"
            >
              <div
                class="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(10,10,10,0.06),transparent_60%)]"
                aria-hidden="true"
              />
              <div
                class="pointer-events-none absolute right-0 top-0 h-full w-56 opacity-[0.035]"
                style="background-image: linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px); background-size: 22px 22px;"
                aria-hidden="true"
              />
              <div class="relative">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  {{ t('nav.storage') }}
                </p>
                <h1 class="mt-2 text-2xl font-semibold tracking-tight leading-tight text-neutral-950 sm:text-3xl">
                  {{ t('storage.settings.title') }}
                </h1>
                <p class="mt-2 max-w-xl text-xs leading-relaxed text-neutral-500">
                  {{ t('storage.settings.subtitle') }}
                </p>
              </div>
            </section>

            <!-- Save chain visualization -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('storage.settings.savePathTitle') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('storage.settings.savePathDesc') }}
                  </p>
                </div>
                <span
                  v-if="resolvedOrder.length"
                  class="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-700 ring-1 ring-green-200/60"
                >
                  <span class="size-1.5 rounded-full bg-green-500" />
                  {{ resolvedOrder.length }} {{ t('storage.settings.statusAvailable').toLowerCase() }}
                </span>
              </div>

              <!-- Empty state -->
              <div
                v-if="!resolvedOrder.length"
                class="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 py-8 text-center"
              >
                <div class="flex size-10 items-center justify-center rounded-full bg-white text-amber-600 ring-1 ring-amber-200">
                  <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-4" />
                </div>
                <p class="text-xs font-medium text-amber-900">
                  {{ t('storage.settings.resolvedEmpty') }}
                </p>
              </div>

              <!-- Chain pills -->
              <div v-else class="mt-4 flex flex-wrap items-center gap-2">
                <template v-for="(provider, idx) in resolvedOrder" :key="provider">
                  <span
                    class="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm"
                    :class="idx === 0 ? 'ring-1 ring-neutral-900/15' : ''"
                  >
                    <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                      <StorageProviderIcon :provider="provider" tile />
                    </span>
                    {{ providerLabel[provider] }}
                    <span
                      v-if="idx === 0"
                      class="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                    >
                      {{ t('storage.settings.primary') }}
                    </span>
                  </span>
                  <UIcon
                    v-if="idx < resolvedOrder.length - 1"
                    name="i-heroicons-arrow-right-20-solid"
                    class="size-4 shrink-0 text-neutral-300"
                    aria-hidden="true"
                  />
                </template>
              </div>
            </section>

            <!-- Save priority list -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('storage.settings.saveOrderTitle') }}
                  </h2>
                  <p class="mt-0.5 max-w-xl text-xs leading-relaxed text-neutral-500">
                    {{ t('storage.settings.saveOrderDesc') }}
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  @click="reset"
                >
                  <UIcon name="i-heroicons-arrow-path-20-solid" class="size-3" />
                  {{ t('storage.settings.resetDefault') }}
                </button>
              </header>

              <div
                v-if="!resolvedOrder.length"
                class="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-6 text-center text-xs text-neutral-500"
              >
                {{ t('storage.settings.saveOrderEmpty') }}
              </div>

              <ul v-else role="list" class="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100">
                <li
                  v-for="(provider, index) in resolvedOrder"
                  :key="provider"
                  class="group flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                  :class="index === 0 ? 'bg-gradient-to-r from-neutral-50 to-transparent' : ''"
                >
                  <span
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold leading-none tabular-nums"
                    :class="index === 0 ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'"
                  >
                    {{ index + 1 }}
                  </span>
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-50 ring-1 ring-inset ring-neutral-200/80">
                    <StorageProviderIcon :provider="provider" tile />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate text-body-md font-medium text-neutral-950">
                        {{ providerLabel[provider] }}
                      </span>
                      <span
                        v-if="index === 0"
                        class="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                      >
                        {{ t('storage.settings.primary') }}
                      </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5">
                      <span class="size-1.5 shrink-0 rounded-full bg-green-500" aria-hidden="true" />
                      <span class="text-label-md font-medium text-green-700">
                        {{ t('storage.settings.statusAvailable') }}
                      </span>
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                      :disabled="index === 0"
                      :aria-label="t('storage.settings.moveUp')"
                      @click="moveUp(provider)"
                    >
                      <UIcon name="i-heroicons-chevron-up-20-solid" class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                      :disabled="index === resolvedOrder.length - 1"
                      :aria-label="t('storage.settings.moveDown')"
                      @click="moveDown(provider)"
                    >
                      <UIcon name="i-heroicons-chevron-down-20-solid" class="size-4" />
                    </button>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Connections / provider management -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <UIcon name="i-heroicons-link-20-solid" class="size-4 text-neutral-700" />
                </div>
                <div class="min-w-0 flex-1">
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('storage.settings.connectionsTitle') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('storage.settings.connectionsDesc') }}
                  </p>
                </div>
              </header>

              <ul role="list" class="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100">
                <li
                  v-for="provider in ALL_PROVIDERS"
                  :key="provider"
                  class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                >
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-50 ring-1 ring-inset ring-neutral-200/80">
                    <StorageProviderIcon :provider="provider" tile />
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="block truncate text-body-md font-medium text-neutral-950">
                      {{ providerLabel[provider] }}
                    </span>
                    <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="flex items-center gap-1.5">
                        <span
                          class="size-1.5 shrink-0 rounded-full"
                          :class="statusDotClass(provider)"
                          aria-hidden="true"
                        />
                        <span
                          class="text-label-md font-medium"
                          :class="statusTextClass(provider)"
                        >
                          {{ statusLabel(provider) }}
                        </span>
                      </span>
                      <span class="text-label-md text-neutral-400">
                        · {{ providerDescription[provider] }}
                      </span>
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center">
                    <!-- supabase: account-bound. No button; the user's account
                         is what makes it available. -->
                    <span
                      v-if="provider === 'supabase'"
                      class="rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                    >
                      {{ t('storage.settings.connectionAccountBound') }}
                    </span>
                    <!-- google-drive: connect via marketplace OAuth, disconnect
                         via the existing migrate-then-disconnect modal. -->
                    <template v-else-if="provider === 'google-drive'">
                      <button
                        v-if="!isDriveConnected"
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md bg-neutral-950 px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                        @click="connectProvider('google-drive')"
                      >
                        {{ t('integrations.connect') }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                        @click="openDisconnect('google-drive')"
                      >
                        <UIcon name="i-heroicons-link-slash-20-solid" class="size-3" />
                        {{ t('integrations.disconnect') }}
                      </button>
                    </template>
                    <!-- local: a browser capability, not a connection. Show a
                         passive label so users see why it's on or off. -->
                    <span
                      v-else
                      class="rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                    >
                      {{ t('storage.settings.connectionDeviceCapability') }}
                    </span>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Migration -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <UIcon name="i-heroicons-arrows-right-left-20-solid" class="size-4 text-neutral-700" />
                </div>
                <div class="min-w-0 flex-1">
                  <h2 class="text-sm font-semibold text-neutral-950">
                    {{ t('storage.settings.migrationTitle') }}
                  </h2>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ t('storage.settings.migrationDesc') }}
                  </p>
                </div>
              </header>

              <div class="mt-5 rounded-xl border border-neutral-200 bg-white">
                <div class="flex flex-col gap-4 p-4 sm:p-5">
                  <!-- Source / Destination pickers -->
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <!-- Source picker -->
                    <div ref="sourceSelectorRef" class="relative flex-1 min-w-0">
                      <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        {{ t('storage.settings.migrationSourceLabel') }}
                      </span>
                      <button
                        type="button"
                        class="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
                        :aria-haspopup="true"
                        :aria-expanded="sourceOpen"
                        @click.stop="sourceOpen = !sourceOpen; destinationOpen = false"
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-white">
                            <StorageProviderIcon :provider="sourceProvider" tile />
                          </span>
                          <span class="truncate">{{ providerLabel[sourceProvider] }}</span>
                        </span>
                        <UIcon
                          name="i-heroicons-chevron-down-20-solid"
                          class="size-4 shrink-0 text-neutral-400 transition-transform"
                          :class="sourceOpen ? 'rotate-180' : ''"
                        />
                      </button>
                      <Menu :open="sourceOpen" align="left" width="w-full">
                        <button
                          v-for="p in availableProviders"
                          :key="p"
                          type="button"
                          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-neutral-100"
                          :class="p === sourceProvider ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                          @click.stop="selectSource(p)"
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                              <StorageProviderIcon :provider="p" tile />
                            </span>
                            <span class="truncate">{{ providerLabel[p] }}</span>
                          </span>
                          <UIcon
                            v-if="p === sourceProvider"
                            name="i-heroicons-check-20-solid"
                            class="size-4 shrink-0 text-neutral-950"
                          />
                        </button>
                      </Menu>
                    </div>

                    <!-- Direction indicator -->
                    <UIcon
                      name="i-heroicons-arrow-long-right-20-solid"
                      class="hidden shrink-0 size-5 text-neutral-400 sm:block sm:mb-2.5"
                      aria-hidden="true"
                    />

                    <!-- Destination picker -->
                    <div ref="destinationSelectorRef" class="relative flex-1 min-w-0">
                      <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        {{ t('storage.settings.migrationDestinationLabel') }}
                      </span>
                      <button
                        type="button"
                        class="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
                        :aria-haspopup="true"
                        :aria-expanded="destinationOpen"
                        @click.stop="destinationOpen = !destinationOpen; sourceOpen = false"
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-white">
                            <StorageProviderIcon :provider="destinationProvider" tile />
                          </span>
                          <span class="truncate">{{ providerLabel[destinationProvider] }}</span>
                        </span>
                        <UIcon
                          name="i-heroicons-chevron-down-20-solid"
                          class="size-4 shrink-0 text-neutral-400 transition-transform"
                          :class="destinationOpen ? 'rotate-180' : ''"
                        />
                      </button>
                      <Menu :open="destinationOpen" align="left" width="w-full">
                        <button
                          v-for="p in availableProviders"
                          :key="p"
                          type="button"
                          class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-neutral-100"
                          :class="p === destinationProvider ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                          @click.stop="selectDestination(p)"
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                              <StorageProviderIcon :provider="p" tile />
                            </span>
                            <span class="truncate">{{ providerLabel[p] }}</span>
                          </span>
                          <UIcon
                            v-if="p === destinationProvider"
                            name="i-heroicons-check-20-solid"
                            class="size-4 shrink-0 text-neutral-950"
                          />
                        </button>
                      </Menu>
                    </div>
                  </div>

                  <!-- Live progress for whichever composable is handling this pair -->
                  <DriveMigrationStatus
                    v-if="showMigrationProgress && activeMigrationState"
                    :state="activeMigrationState"
                  />

                  <!-- Blockers -->
                  <div v-if="pairBlockers.length" class="flex flex-col gap-2">
                    <div
                      v-for="(blocker, i) in pairBlockers"
                      :key="i"
                      class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900"
                    >
                      <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-3.5 shrink-0 text-amber-600" />
                      <span class="min-w-0 flex-1">{{ t(blocker.messageKey, blocker.messageParams ?? {}) }}</span>
                      <NuxtLink
                        v-if="blocker.action"
                        :to="blocker.action.to"
                        class="inline-flex shrink-0 items-center gap-1 rounded-md bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        {{ t(blocker.action.labelKey) }}
                        <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3" />
                      </NuxtLink>
                    </div>
                  </div>

                  <!-- Action -->
                  <div class="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      :disabled="!isMigrationReady || isMigrationRunning"
                      @click="openMigrationConfirm"
                    >
                      <UIcon
                        v-if="isMigrationRunning"
                        name="i-heroicons-arrow-path-20-solid"
                        class="size-3.5 animate-spin"
                      />
                      <UIcon
                        v-else
                        name="i-heroicons-arrow-up-tray-20-solid"
                        class="size-3.5"
                      />
                      {{ isMigrationRunning ? t('storage.settings.migrationRunning') : t('storage.settings.startMigration') }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>

  <UModal
    v-model:open="isConfirmOpen"
    :title="t('storage.settings.migrationConfirmTitle', {
      source: providerLabel[sourceProvider],
      destination: providerLabel[destinationProvider],
    })"
    :description="t('storage.settings.migrationConfirmDesc', {
      source: providerLabel[sourceProvider],
      destination: providerLabel[destinationProvider],
    })"
    :dismissible="!isMigrationRunning"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <span class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 ring-1 ring-neutral-200">
            <span class="flex size-5 items-center justify-center rounded-md bg-neutral-50">
              <StorageProviderIcon :provider="sourceProvider" tile />
            </span>
            {{ providerLabel[sourceProvider] }}
          </span>
          <UIcon name="i-heroicons-arrow-long-right-20-solid" class="size-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <span class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 ring-1 ring-neutral-200">
            <span class="flex size-5 items-center justify-center rounded-md bg-neutral-50">
              <StorageProviderIcon :provider="destinationProvider" tile />
            </span>
            {{ providerLabel[destinationProvider] }}
          </span>
        </div>

        <ul class="space-y-2 text-xs text-neutral-700">
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-check-circle-20-solid" class="mt-0.5 size-4 shrink-0 text-green-600" />
            <span>{{ t('storage.settings.migrationConfirmBullet1') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-check-circle-20-solid" class="mt-0.5 size-4 shrink-0 text-green-600" />
            <span>{{ t('storage.settings.migrationConfirmBullet2') }}</span>
          </li>
          <li class="flex items-start gap-2">
            <UIcon name="i-heroicons-information-circle-20-solid" class="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{{ t('storage.settings.migrationConfirmBullet3') }}</span>
          </li>
        </ul>

        <!-- Access-loss warning: only when the destination is "local" -->
        <div
          v-if="destinationProvider === 'local'"
          class="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
        >
          <div class="flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-amber-900">
                {{ t('storage.settings.migrationAccessLossTitle') }}
              </p>
              <p class="mt-1 text-xs text-amber-900/80">
                {{ t('storage.settings.migrationAccessLossDesc') }}
              </p>

              <p v-if="loadingAccessLoss" class="mt-2 text-xs text-amber-900/60">
                {{ t('storage.settings.migrationAccessLossLoading') }}
              </p>
              <p
                v-else-if="!accessLossPreview?.affectedUsers.length"
                class="mt-2 text-xs text-amber-900/80"
              >
                {{ t('storage.settings.migrationAccessLossNone') }}
              </p>
              <ul
                v-else
                class="mt-2 flex flex-col gap-1"
              >
                <li
                  v-for="u in accessLossPreview.affectedUsers"
                  :key="u.user_id"
                  class="flex items-center gap-2 rounded-md bg-white/60 px-2 py-1 text-xs text-neutral-800 ring-1 ring-amber-200/60"
                >
                  <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold uppercase text-amber-800">
                    {{ (u.display_name || u.email || '?').slice(0, 1) }}
                  </span>
                  <span class="truncate font-medium">{{ u.display_name || u.email }}</span>
                  <span
                    v-if="u.display_name && u.email && u.display_name !== u.email"
                    class="truncate text-[10px] text-neutral-500"
                  >{{ u.email }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
          @click="isConfirmOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-opacity hover:opacity-90"
          @click="confirmMigration"
        >
          <UIcon name="i-heroicons-arrow-up-tray-20-solid" class="size-4" />
          {{ destinationProvider === 'local'
            ? t('storage.settings.migrationConfirmLocal')
            : t('storage.settings.migrationConfirmAction') }}
        </button>
      </div>
    </template>
  </UModal>

  <DisconnectStorageProviderModal
    v-model:open="disconnectModalOpen"
    :provider="pendingDisconnectProvider"
    @disconnect="onConfirmDisconnect"
  />
</template>
