<script setup lang="ts">
import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

const headerTabs = {
  MAIN: '/storage/main',
  SHARED: '/storage/shared',
  SETTINGS: '/storage/settings',
} as const satisfies Record<string, string>

const { t } = useI18n()
const {
  saveOrder,
  providerStatus,
  resolvedOrder,
  moveUp,
  moveDown,
  reset,
} = useStoragePreferences()
const { state: migrationState, run: runMigration } = useDriveMigration()
const { isInstalled } = useMarketplace()
const { currentWorkspace } = useWorkspaces()

const providerLabel = computed<Record<StorageProvider, string>>(() => ({
  'supabase': t('storage.settings.providerCloud'),
  'google-drive': t('storage.settings.providerGoogleDrive'),
  'local': t('storage.settings.providerLocal'),
}))

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

// Contextual hint for unavailable providers (e.g. how to enable)
const unavailableHint = (provider: StorageProvider) => {
  if (providerStatus.value[provider] === 'available') return null
  if (provider === 'google-drive') return t('storage.settings.notConnectedHint')
  if (provider === 'local') return t('storage.settings.localUnsupportedHint')
  return null
}

// Action route for unavailable providers (e.g. Connect Drive in marketplace)
const unavailableAction = (provider: StorageProvider): { label: string; to: string } | null => {
  if (providerStatus.value[provider] === 'available') return null
  if (provider === 'google-drive') {
    return { label: t('integrations.connect'), to: '/integrations/marketplace' }
  }
  return null
}

// ---- Migration ----
const driveConnected = computed(() => isInstalled('google-drive'))
const myRole = computed(() => currentWorkspace.value?.role)
const canManage = computed(() => myRole.value === 'owner' || myRole.value === 'admin')

interface MigrationOption {
  id: string
  source: StorageProvider
  destination: StorageProvider
  titleKey: string
  descKey: string
  ready: boolean
  blockers: { messageKey: string; action?: { labelKey: string; to: string } }[]
  run: () => Promise<void>
}

const migrationOptions = computed<MigrationOption[]>(() => {
  const blockers: { messageKey: string; action?: { labelKey: string; to: string } }[] = []
  if (!driveConnected.value) {
    blockers.push({
      messageKey: 'storage.settings.migrationRequiresDrive',
      action: { labelKey: 'integrations.connect', to: '/integrations/marketplace' },
    })
  }
  if (!canManage.value) {
    blockers.push({ messageKey: 'storage.settings.migrationRequiresAdmin' })
  }
  return [
    {
      id: 'supabase-to-drive',
      source: 'supabase',
      destination: 'google-drive',
      titleKey: 'storage.settings.migrationCloudToDriveTitle',
      descKey: 'storage.settings.migrationCloudToDriveDesc',
      ready: blockers.length === 0,
      blockers,
      run: runMigration,
    },
  ]
})

const isConfirmOpen = ref(false)
const pendingMigration = ref<MigrationOption | null>(null)

function openMigrationConfirm(option: MigrationOption) {
  if (!option.ready) return
  pendingMigration.value = option
  isConfirmOpen.value = true
}

async function confirmMigration() {
  const option = pendingMigration.value
  if (!option) return
  isConfirmOpen.value = false
  await option.run()
}

const isMigrationRunning = computed(() => migrationState.status === 'running')
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

              <ul role="list" class="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100">
                <li
                  v-for="(provider, index) in saveOrder"
                  :key="provider"
                  class="group flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                  :class="index === 0 && providerStatus[provider] === 'available'
                    ? 'bg-gradient-to-r from-neutral-50 to-transparent'
                    : ''"
                >
                  <span
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold leading-none tabular-nums"
                    :class="index === 0 && providerStatus[provider] === 'available'
                      ? 'bg-neutral-950 text-white'
                      : 'bg-neutral-100 text-neutral-600'"
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
                        v-if="index === 0 && providerStatus[provider] === 'available'"
                        class="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                      >
                        {{ t('storage.settings.primary') }}
                      </span>
                    </div>
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
                      <span
                        v-if="unavailableHint(provider)"
                        class="text-label-md text-neutral-400"
                      >
                        · {{ unavailableHint(provider) }}
                      </span>
                    </div>
                  </div>
                  <NuxtLink
                    v-if="unavailableAction(provider)"
                    :to="unavailableAction(provider)!.to"
                    class="hidden shrink-0 items-center gap-1 rounded-md bg-neutral-950 px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 sm:inline-flex"
                  >
                    {{ unavailableAction(provider)!.label }}
                    <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3" />
                  </NuxtLink>
                  <div class="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                      :disabled="index === 0"
                      :aria-label="t('storage.settings.moveUp')"
                      @click="moveUp(index)"
                    >
                      <UIcon name="i-heroicons-chevron-up-20-solid" class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                      :disabled="index === saveOrder.length - 1"
                      :aria-label="t('storage.settings.moveDown')"
                      @click="moveDown(index)"
                    >
                      <UIcon name="i-heroicons-chevron-down-20-solid" class="size-4" />
                    </button>
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

              <ul class="mt-4 flex flex-col gap-3">
                <li
                  v-for="option in migrationOptions"
                  :key="option.id"
                  class="overflow-hidden rounded-xl border border-neutral-200 bg-white"
                >
                  <!-- Card body -->
                  <div class="flex flex-col gap-4 p-4 sm:p-5">
                    <!-- Source → Destination header -->
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800">
                        <span class="flex size-5 items-center justify-center rounded-md bg-white">
                          <StorageProviderIcon :provider="option.source" tile />
                        </span>
                        {{ providerLabel[option.source] }}
                      </span>
                      <UIcon name="i-heroicons-arrow-long-right-20-solid" class="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                      <span class="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800">
                        <span class="flex size-5 items-center justify-center rounded-md bg-white">
                          <StorageProviderIcon :provider="option.destination" tile />
                        </span>
                        {{ providerLabel[option.destination] }}
                      </span>
                    </div>

                    <!-- Title + description -->
                    <div>
                      <h3 class="text-sm font-semibold text-neutral-950">
                        {{ t(option.titleKey) }}
                      </h3>
                      <p class="mt-1 text-xs leading-relaxed text-neutral-500">
                        {{ t(option.descKey) }}
                      </p>
                    </div>

                    <!-- Live progress -->
                    <DriveMigrationStatus
                      v-if="option.id === 'supabase-to-drive' && migrationState.status !== 'idle'"
                      :state="migrationState"
                    />

                    <!-- Blockers -->
                    <div v-if="!option.ready" class="flex flex-col gap-2">
                      <div
                        v-for="(blocker, i) in option.blockers"
                        :key="i"
                        class="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900"
                      >
                        <UIcon name="i-heroicons-exclamation-triangle-20-solid" class="size-3.5 shrink-0 text-amber-600" />
                        <span class="min-w-0 flex-1">{{ t(blocker.messageKey) }}</span>
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
                        :disabled="!option.ready || isMigrationRunning"
                        @click="openMigrationConfirm(option)"
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
                </li>
              </ul>
            </section>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>

  <UModal
    v-model:open="isConfirmOpen"
    :title="t('storage.settings.migrationConfirmTitle')"
    :description="t('storage.settings.migrationConfirmDesc')"
    :dismissible="!isMigrationRunning"
  >
    <template #body>
      <div v-if="pendingMigration" class="space-y-4">
        <div class="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <span class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 ring-1 ring-neutral-200">
            <span class="flex size-5 items-center justify-center rounded-md bg-neutral-50">
              <StorageProviderIcon :provider="pendingMigration.source" tile />
            </span>
            {{ providerLabel[pendingMigration.source] }}
          </span>
          <UIcon name="i-heroicons-arrow-long-right-20-solid" class="size-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <span class="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 ring-1 ring-neutral-200">
            <span class="flex size-5 items-center justify-center rounded-md bg-neutral-50">
              <StorageProviderIcon :provider="pendingMigration.destination" tile />
            </span>
            {{ providerLabel[pendingMigration.destination] }}
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
          {{ t('storage.settings.migrationConfirmAction') }}
        </button>
      </div>
    </template>
  </UModal>
</template>
