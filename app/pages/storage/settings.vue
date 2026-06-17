<script setup lang="ts">
import type { StorageProvider } from '~/types/storage'

const { headerTabs, customTabs } = useStorageNavTabs()

const { t } = useI18n()
const {
  providerStatus,
  providerLabel,
  resolvedOrder,
  moveUp,
  moveDown,
} = useStoragePreferences()
const router = useRouter()
const { isInstalled, uninstall } = useMarketplace()

const providerDescription = computed<Record<StorageProvider, string>>(() => ({
  'google-drive': t('storage.settings.providerGoogleDriveDesc'),
  'b2': t('storage.settings.providerCloudDesc'),
  'local': t('storage.settings.providerLocalDesc'),
}))

const statusLabel = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return t('storage.settings.statusAvailable')
  if (status === 'full') return t('storage.settings.statusFull')
  if (status === 'locked') return t('storage.settings.statusLocked')
  return t('storage.settings.statusUnavailable')
}

const statusDotClass = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return 'bg-green-500'
  if (status === 'full') return 'bg-amber-500'
  if (status === 'locked') return 'bg-neutral-400'
  return 'bg-neutral-300'
}

const statusTextClass = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return 'text-green-700'
  if (status === 'full') return 'text-amber-800'
  if (status === 'locked') return 'text-neutral-600'
  return 'text-neutral-500'
}

// Providers that can be added from the marketplace (storage-tagged listings).
// Local is a browser capability; cloud is plan-gated and listed under locked rows.
const addableProviders = computed<StorageProvider[]>(() => {
  const candidates: StorageProvider[] = []
  if (!isInstalled('google-drive')) candidates.push('google-drive')
  return candidates
})

// Plan-gated providers (shown below with upgrade CTA instead of reorder/disconnect).
const ALL_PROVIDERS: StorageProvider[] = ['google-drive', 'b2', 'local']
const lockedProviders = computed(() =>
  ALL_PROVIDERS.filter(p => providerStatus.value[p] === 'locked'),
)

function goToStorageIntegrationsMarketplace() {
  router.push({ path: '/integrations/marketplace', query: { tag: 'storage' } })
}

const disconnectModalOpen = ref(false)
const pendingDisconnectProvider = ref<StorageProvider | null>(null)

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

</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />
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

            <!-- Storage providers -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <header class="min-w-0">
                <h2 class="text-sm font-semibold text-neutral-950">
                  {{ t('storage.settings.providersTitle') }}
                </h2>
                <p class="mt-0.5 max-w-xl text-xs leading-relaxed text-neutral-500">
                  {{ t('storage.settings.providersDesc') }}
                </p>
              </header>

              <div
                v-if="!resolvedOrder.length"
                class="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-6 text-center text-xs text-neutral-500"
              >
                {{ t('storage.settings.providersEmpty') }}
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
                        {{ providerLabel(provider) }}
                      </span>
                      <span
                        v-if="index === 0"
                        class="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                      >
                        {{ t('storage.settings.primary') }}
                      </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5">
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
                      <span class="text-label-md text-neutral-400">
                        · {{ providerDescription[provider] }}
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
                    <button
                      v-if="provider === 'google-drive'"
                      type="button"
                      class="ml-1 inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                      @click="openDisconnect('google-drive')"
                    >
                      <UIcon name="i-heroicons-link-slash-20-solid" class="size-3" />
                      {{ t('integrations.disconnect') }}
                    </button>
                    <span
                      v-else-if="provider === 'local'"
                      class="ml-1 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                    >
                      {{ t('storage.settings.connectionDeviceCapability') }}
                    </span>
                  </div>
                </li>
              </ul>

              <!-- Add storage provider → marketplace (storage-tagged listings) -->
              <div class="mt-3">
                <button
                  type="button"
                  class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 bg-white px-3 py-3 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="addableProviders.length === 0"
                  @click="goToStorageIntegrationsMarketplace"
                >
                  <UIcon name="i-heroicons-plus-20-solid" class="size-4" />
                  {{ addableProviders.length === 0
                    ? t('storage.settings.allProvidersConnected')
                    : t('storage.settings.addProvider') }}
                </button>
              </div>

              <!-- Plan-locked providers (e.g. Cloud on free plans) -->
              <ul
                v-if="lockedProviders.length > 0"
                role="list"
                class="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50/40"
              >
                <li
                  v-for="provider in lockedProviders"
                  :key="`locked-${provider}`"
                  class="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5"
                >
                  <span
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
                    aria-hidden="true"
                  >
                    <UIcon name="i-heroicons-lock-closed-20-solid" class="size-3" />
                  </span>
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-inset ring-neutral-200/80">
                    <StorageProviderIcon :provider="provider" tile />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate text-body-md font-medium text-neutral-700">
                        {{ providerLabel(provider) }}
                      </span>
                      <span class="rounded-full bg-neutral-200/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-600">
                        {{ t('storage.settings.statusLocked') }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-label-md text-neutral-500">
                      {{ providerDescription[provider] }}
                    </p>
                  </div>
                  <PlanUpgradeButton class="ml-1 shrink-0" />
                </li>
              </ul>
            </section>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>

  <DisconnectStorageProviderModal
    v-model:open="disconnectModalOpen"
    :provider="pendingDisconnectProvider"
    @disconnect="onConfirmDisconnect"
  />
</template>
