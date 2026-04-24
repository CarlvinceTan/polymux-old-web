<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory, MarketplaceItem } from '~/composables/useMarketplace'

const { t } = useI18n()
const { headerTabs } = useIntegrationsNavTabs()
const { installedItems, uninstall, refresh, isAdmin } = useMarketplace()

const route = useRoute()
const router = useRouter()
const { state: migrationState, run: runDriveMigration } = useDriveMigration()

// Post-OAuth: if the callback redirected here with `?migrate=1`, drive the
// Supabase→Drive migration job to completion. The cleanup strips the query so
// reloading the page doesn't re-trigger.
onMounted(async () => {
  if (route.query.connected === 'google-drive') {
    await refresh()
  }
  if (route.query.migrate === '1' && route.query.connected === 'google-drive') {
    const { migrate: _migrate, connected: _connected, ...rest } = route.query
    router.replace({ query: rest })
    await runDriveMigration()
  }
})

const searchQuery = ref('')
const searchFocused = ref(false)

const groupOrder: ItemCategory[] = ['connection', 'plugin', 'workflow']

const groupLabels = computed<Record<ItemCategory, string>>(() => ({
  connection: t('integrations.filterIntegrations'),
  plugin: t('integrations.filterPlugins'),
  workflow: t('integrations.filterWorkflows'),
}))

const filteredInstalled = computed(() => {
  if (!searchQuery.value.trim()) return installedItems.value
  const q = searchQuery.value.toLowerCase()
  return installedItems.value.filter(i =>
    i.name.toLowerCase().includes(q)
    || i.description.toLowerCase().includes(q)
    || i.author.toLowerCase().includes(q),
  )
})

const groups = computed(() =>
  groupOrder
    .map(cat => ({
      category: cat,
      label: groupLabels.value[cat],
      items: filteredInstalled.value.filter(i => i.category === cat),
    }))
    .filter(g => g.items.length > 0),
)

const settingsOpen = ref(false)
const selectedItem = ref<MarketplaceItem | null>(null)

function openSettings(item: MarketplaceItem) {
  selectedItem.value = item
  settingsOpen.value = true
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="flex min-h-full flex-1 flex-col" style="padding: 5rem 6rem 2.5rem">
        <div v-if="migrationState.status !== 'idle'" class="mb-6">
          <DriveMigrationStatus :state="migrationState" />
        </div>

        <div v-if="!installedItems.length" class="flex flex-1 flex-col items-center justify-center text-center">
          <div class="mb-5 flex size-16 items-center justify-center rounded-full bg-neutral-100">
            <svg
              class="size-7 text-neutral-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
            </svg>
          </div>
          <h2 class="mb-1.5 text-title-sm font-semibold tracking-tight text-neutral-950">
            {{ t('integrations.noInstalledTitle') }}
          </h2>
          <p class="mb-6 max-w-sm text-body-md text-neutral-500">
            {{ t('integrations.noInstalledSubtitle') }}
          </p>
          <NuxtLink
            to="/integrations/marketplace"
            class="rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            {{ t('integrations.browseMarketplace') }}
          </NuxtLink>
        </div>

        <template v-else>
          <div class="mb-8">
            <div
              class="flex min-w-0 items-center gap-2 rounded-lg border bg-neutral-100 px-3 py-2 transition-all"
              :class="searchFocused ? 'border-neutral-950 bg-white shadow-sm' : 'border-neutral-300'"
            >
              <svg class="size-4 shrink-0 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="t('integrations.searchInstalledPlaceholder')"
                class="min-w-0 flex-1 bg-transparent text-body-md text-neutral-950 outline-none placeholder:text-neutral-600"
                @focus="searchFocused = true"
                @blur="searchFocused = false"
              >
            </div>
          </div>

          <div v-if="groups.length" class="space-y-8">
            <section v-for="group in groups" :key="group.category">
              <header class="mb-3 flex items-baseline gap-2">
                <h2 class="text-sm font-semibold tracking-tight text-neutral-950">
                  {{ group.label }}
                </h2>
                <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-500">
                  {{ group.items.length }}
                </span>
              </header>
              <div
                class="grid gap-4"
                style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))"
              >
                <IntegrationCard
                  v-for="item in group.items"
                  :id="item.id"
                  :key="item.id"
                  :name="item.name"
                  :description="item.description"
                  :category="item.category"
                  :author="item.author"
                  :installed="true"
                  variant="installed"
                  @toggle="uninstall(item.id)"
                  @configure="openSettings(item)"
                />
              </div>
            </section>
          </div>

          <div v-else class="flex flex-col items-center justify-center py-16 text-center">
            <svg class="mb-4 size-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <p class="text-body-md font-medium text-neutral-500">
              {{ t('integrations.noInstalledResults') }}
            </p>
          </div>
        </template>
      </div>
    </TabPanel>

    <IntegrationSettingsModal
      v-model:open="settingsOpen"
      :item="selectedItem"
      :is-admin="isAdmin"
    />
  </div>
</template>
