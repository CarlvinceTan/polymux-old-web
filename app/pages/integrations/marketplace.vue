<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory, MarketplaceItem } from '~/composables/wallet/useMarketplace'

const { t } = useI18n()
const { headerTabs } = useIntegrationsNavTabs()

type FilterValue = 'all' | ItemCategory | 'installed'
type SortValue = 'popularity' | 'nameAZ' | 'nameZA' | 'installedFirst' | 'category'

const { catalog, catalogPending, catalogLoaded, isInstalled } = useMarketplace()

const searchQuery = ref('')
const filterBy = ref<FilterValue>('all')
const sortBy = ref<SortValue>('popularity')

const isFilterOpen = ref(false)
const isSortOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const sortRef = ref<HTMLElement | null>(null)

const filterOptions = computed<{ value: FilterValue, label: string }[]>(() => [
  { value: 'all', label: t('integrations.filterAll') },
  { value: 'workflow', label: t('integrations.filterWorkflows') },
  { value: 'plugin', label: t('integrations.filterPlugins') },
  { value: 'integration', label: t('integrations.filterIntegrations') },
  { value: 'installed', label: t('integrations.filterInstalled') },
])

const sortOptions = computed<{ value: SortValue, label: string }[]>(() => [
  { value: 'popularity', label: t('integrations.sortPopularity') },
  { value: 'nameAZ', label: t('integrations.sortNameAZ') },
  { value: 'nameZA', label: t('integrations.sortNameZA') },
  { value: 'installedFirst', label: t('integrations.sortInstalledFirst') },
  { value: 'category', label: t('integrations.sortCategory') },
])

const categoryOrder: Record<ItemCategory, number> = {
  integration: 0,
  plugin: 1,
  workflow: 2,
}

const filteredItems = computed<MarketplaceItem[]>(() => {
  let list: MarketplaceItem[] = [...(catalog.value ?? [])]

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i =>
      i.name.toLowerCase().includes(q)
      || i.description.toLowerCase().includes(q)
      || i.author.toLowerCase().includes(q),
    )
  }

  if (filterBy.value === 'installed') {
    list = list.filter(i => isInstalled(i.id))
  }
  else if (filterBy.value !== 'all') {
    list = list.filter(i => i.category === filterBy.value)
  }

  // Unless the user explicitly chose "Installed first", push installed items
  // to the bottom — the marketplace exists to surface things to install, not
  // ones already wired up.
  const uninstalledFirst = (a: MarketplaceItem, b: MarketplaceItem) => {
    const ai = isInstalled(a.id) ? 1 : 0
    const bi = isInstalled(b.id) ? 1 : 0
    return ai - bi
  }

  switch (sortBy.value) {
    case 'popularity':
      list.sort((a, b) => {
        const status = uninstalledFirst(a, b)
        if (status !== 0) return status
        const diff = b.popularity - a.popularity
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
      break
    case 'nameAZ':
      list.sort((a, b) => {
        const status = uninstalledFirst(a, b)
        if (status !== 0) return status
        return a.name.localeCompare(b.name)
      })
      break
    case 'nameZA':
      list.sort((a, b) => {
        const status = uninstalledFirst(a, b)
        if (status !== 0) return status
        return b.name.localeCompare(a.name)
      })
      break
    case 'installedFirst':
      list.sort((a, b) => {
        const ai = isInstalled(a.id) ? 0 : 1
        const bi = isInstalled(b.id) ? 0 : 1
        if (ai !== bi) return ai - bi
        return a.name.localeCompare(b.name)
      })
      break
    case 'category':
      list.sort((a, b) => {
        const status = uninstalledFirst(a, b)
        if (status !== 0) return status
        const diff = categoryOrder[a.category] - categoryOrder[b.category]
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
      break
  }

  return list
})

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
      <template #header>
        <div class="flex items-center gap-2">
          <div class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
            <div class="flex size-8 shrink-0 items-center justify-center text-neutral-400">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </div>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('integrations.searchPlaceholder')"
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

      <div class="relative" style="padding: 2.5rem 6rem 0">
        <div
          v-if="filteredItems.length"
          class="grid gap-4 pb-10"
          style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))"
        >
          <IntegrationCard
            v-for="item in filteredItems"
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

        <div v-else-if="catalogPending || !catalogLoaded" class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <svg class="mb-4 size-6 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p class="text-body-md font-medium text-neutral-500">
            {{ t('integrations.loading') }}
          </p>
        </div>

        <div v-else class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <svg class="mb-4 size-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <p class="text-body-md font-medium text-neutral-500">
            {{ t('integrations.noMatches') }}
          </p>
        </div>
      </div>
    </TabPanel>

    <IntegrationSettingsModal
      v-model:open="detailOpen"
      :item="selectedItem"
    />
  </div>
  </FeatureGate>
</template>
