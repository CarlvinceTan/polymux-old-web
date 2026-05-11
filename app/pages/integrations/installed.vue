<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory, MarketplaceItem } from '~/composables/integrations/useMarketplace'

const { t } = useI18n()
const { headerTabs } = useIntegrationsNavTabs()
const { installedItems, refresh, refreshCatalog } = useMarketplace()

const route = useRoute()
const router = useRouter()

// Post-OAuth: refresh the marketplace state so the newly-connected provider
// shows up. The legacy `?migrate=1` flow used to drive a Supabase→Drive
// migration; cloud storage is gone, so we strip the param without acting on
// it.
onMounted(async () => {
  if (route.query.connected === 'google-drive') {
    await Promise.all([refresh(), refreshCatalog()])
  }
  if (route.query.migrate === '1') {
    const { migrate: _migrate, ...rest } = route.query
    router.replace({ query: rest })
  }
})

type FilterValue = 'all' | ItemCategory
type SortValue = 'category' | 'popularity' | 'nameAZ' | 'nameZA'

const searchQuery = ref('')
const filterBy = ref<FilterValue>('all')
const sortBy = ref<SortValue>('category')

const isFilterOpen = ref(false)
const isSortOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const sortRef = ref<HTMLElement | null>(null)

const filterOptions = computed<{ value: FilterValue, label: string }[]>(() => [
  { value: 'all', label: t('integrations.filterAll') },
  { value: 'workflow', label: t('integrations.filterWorkflows') },
  { value: 'plugin', label: t('integrations.filterPlugins') },
  { value: 'integration', label: t('integrations.filterIntegrations') },
])

const sortOptions = computed<{ value: SortValue, label: string }[]>(() => [
  { value: 'category', label: t('integrations.sortCategory') },
  { value: 'popularity', label: t('integrations.sortPopularity') },
  { value: 'nameAZ', label: t('integrations.sortNameAZ') },
  { value: 'nameZA', label: t('integrations.sortNameZA') },
])

const groupOrder: ItemCategory[] = ['integration', 'plugin', 'workflow']

const groupLabels = computed<Record<ItemCategory, string>>(() => ({
  integration: t('integrations.filterIntegrations'),
  plugin: t('integrations.filterPlugins'),
  workflow: t('integrations.filterWorkflows'),
}))

const filteredInstalled = computed(() => {
  let list = [...installedItems.value]

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i =>
      i.name.toLowerCase().includes(q)
      || i.description.toLowerCase().includes(q)
      || i.author.toLowerCase().includes(q),
    )
  }

  if (filterBy.value !== 'all') {
    list = list.filter(i => i.category === filterBy.value)
  }

  return list
})

function sortItems(list: MarketplaceItem[]): MarketplaceItem[] {
  const sorted = [...list]
  switch (sortBy.value) {
    case 'popularity':
      sorted.sort((a, b) => {
        const diff = b.popularity - a.popularity
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
      break
    case 'nameAZ':
      sorted.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      sorted.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'category':
      sorted.sort((a, b) => a.name.localeCompare(b.name))
      break
  }
  return sorted
}

const groups = computed(() =>
  groupOrder
    .map(cat => ({
      category: cat,
      label: groupLabels.value[cat],
      items: sortItems(filteredInstalled.value.filter(i => i.category === cat)),
    }))
    .filter(g => g.items.length > 0),
)

const flatItems = computed(() => sortItems(filteredInstalled.value))

const detailOpen = ref(false)
const selectedItem = ref<MarketplaceItem | null>(null)

function openDetail(item: MarketplaceItem) {
  selectedItem.value = item
  detailOpen.value = true
}

function handleClickOutside(event: MouseEvent) {
  if (filterRef.value && !filterRef.value.contains(event.target as Node)) {
    isFilterOpen.value = false
  }
  if (sortRef.value && !sortRef.value.contains(event.target as Node)) {
    isSortOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <FeatureGate name="integrations">
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <template v-if="installedItems.length" #header>
        <div class="flex items-center gap-2">
          <div class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
            <div class="flex size-8 shrink-0 items-center justify-center text-neutral-400">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </div>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('integrations.searchInstalledPlaceholder')"
              class="min-w-0 flex-1 bg-transparent pr-2 text-body-md text-neutral-950 outline-none placeholder:text-neutral-400"
            >
          </div>

          <div ref="filterRef" class="relative">
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
              @click="isFilterOpen = !isFilterOpen"
            >
              {{ t('integrations.filterBy') }}
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              v-if="isFilterOpen"
              class="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in filterOptions"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md transition-colors hover:bg-neutral-100"
                :class="opt.value === filterBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                @click="filterBy = opt.value; isFilterOpen = false"
              >
                {{ opt.label }}
                <svg v-if="opt.value === filterBy" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          </div>

          <div ref="sortRef" class="relative">
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
              @click="isSortOpen = !isSortOpen"
            >
              {{ t('integrations.sortBy') }}
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              v-if="isSortOpen"
              class="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md transition-colors hover:bg-neutral-100"
                :class="opt.value === sortBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                @click="sortBy = opt.value; isSortOpen = false"
              >
                {{ opt.label }}
                <svg v-if="opt.value === sortBy" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>

      <div class="flex min-h-full flex-1 flex-col" style="padding: 2.5rem 6rem">
        <div v-if="!installedItems.length" class="flex flex-1 flex-col items-center justify-center text-center">
          <svg
            class="mb-4 size-10 text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22v-5" />
            <path d="M9 8V2" />
            <path d="M15 8V2" />
            <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
          </svg>
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
          <div v-if="sortBy === 'category' && groups.length" class="space-y-8">
            <section v-for="group in groups" :key="group.category">
              <header class="mb-3 flex items-baseline gap-2">
                <h2 class="text-sm font-semibold tracking-tight text-neutral-950">
                  {{ group.label }}
                </h2>
                <span class="text-label-md font-medium text-neutral-500">
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
                  :tags="item.tags"
                  :popularity="item.popularity"
                  @open="openDetail(item)"
                />
              </div>
            </section>
          </div>

          <div
            v-else-if="flatItems.length"
            class="grid gap-4"
            style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))"
          >
            <IntegrationCard
              v-for="item in flatItems"
              :id="item.id"
              :key="item.id"
              :name="item.name"
              :description="item.description"
              :category="item.category"
              :author="item.author"
              :tags="item.tags"
              :popularity="item.popularity"
              @open="openDetail(item)"
            />
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
      v-model:open="detailOpen"
      :item="selectedItem"
    />
  </div>
  </FeatureGate>
</template>
