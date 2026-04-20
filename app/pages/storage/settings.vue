<script setup lang="ts">
import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

const headerTabs = {
  MAIN: '/storage/main',
  SHARED: '/storage/shared',
  SETTINGS: '/storage/settings',
} as const satisfies Record<string, string>

const { t } = useI18n()
const user = useSupabaseUser()
const {
  saveOrder,
  providerStatus,
  resolvedOrder,
  moveUp,
  moveDown,
  reset,
} = useStoragePreferences()

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

const statusClass = (provider: StorageProvider) => {
  const status = providerStatus.value[provider]
  if (status === 'available') return 'bg-green-50 text-green-700 ring-green-600/20'
  if (status === 'full') return 'bg-amber-50 text-amber-800 ring-amber-600/20'
  return 'bg-neutral-100 text-neutral-500 ring-neutral-300/70'
}

const resolvedSummary = computed(() => {
  if (!resolvedOrder.value.length) return t('storage.settings.resolvedEmpty')
  return resolvedOrder.value.map((p, i) => `${i + 1}. ${providerLabel.value[p]}`).join('  ·  ')
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <GuestPlaceholder v-if="!user" />
        <div v-else class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="mb-6 flex flex-col gap-1 border-b border-neutral-100 pb-5">
            <h1 class="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
              {{ t('storage.settings.title') }}
            </h1>
            <p class="text-body-md text-neutral-500">
              {{ t('storage.settings.subtitle') }}
            </p>
          </div>

          <SettingsSection :title="t('storage.settings.saveOrderTitle')">
            <div class="px-4 py-3.5 sm:px-5">
              <p class="text-label-md text-neutral-500">
                {{ t('storage.settings.saveOrderDesc') }}
              </p>
            </div>
            <ul role="list" class="divide-y divide-neutral-200/90">
              <li
                v-for="(provider, index) in saveOrder"
                :key="provider"
                class="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-label-md font-semibold tabular-nums text-neutral-600">
                  {{ index + 1 }}
                </span>
                <StorageProviderIcon :provider="provider" inline />
                <span class="min-w-0 flex-1 truncate text-body-md font-medium text-neutral-950">
                  {{ providerLabel[provider] }}
                </span>
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-label-md font-medium ring-1 ring-inset"
                  :class="statusClass(provider)"
                >
                  {{ statusLabel(provider) }}
                </span>
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
            <div class="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <p class="min-w-0 flex-1 text-label-md text-neutral-500">
                <span class="font-medium text-neutral-600">{{ t('storage.settings.currentChain') }}:</span>
                {{ resolvedSummary }}
              </p>
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-label-md font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
                @click="reset"
              >
                {{ t('storage.settings.resetDefault') }}
              </button>
            </div>
          </SettingsSection>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
        </div>
      </TabPanel>
    </div>
  </div>
</template>
