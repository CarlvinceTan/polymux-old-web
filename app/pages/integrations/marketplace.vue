<script setup lang="ts">
import type { ItemCategory } from '~/composables/useMarketplace'

const { headerTabs } = useIntegrationsNavTabs()

type FilterCategory = 'all' | ItemCategory

const activeFilter = ref<FilterCategory>('all')
const searchQuery = ref('')

const { catalog, isInstalled, install, uninstall } = useMarketplace()

const filters: { label: string; value: FilterCategory }[] = [
  { label: 'All', value: 'all' },
  { label: 'Workflows', value: 'workflow' },
  { label: 'Plugins', value: 'plugin' },
  { label: 'Integrations', value: 'connection' },
]

const filteredItems = computed(() => {
  let list = catalog
  if (activeFilter.value !== 'all') {
    list = list.filter(i => i.category === activeFilter.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i =>
      i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    )
  }
  return list
})

function toggleItem(id: string) {
  if (isInstalled(id)) uninstall(id)
  else install(id)
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>
     <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-0 flex-col">
          <div class="shrink-0 border-b border-neutral-200 bg-white px-4 sm:px-5 py-4 sm:py-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div class="relative flex-1">
                <svg
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search marketplace…"
                  class="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-3 text-body-md text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-950/10"
                />
              </div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  v-for="f in filters"
                  :key="f.value"
                  type="button"
                  @click="activeFilter = f.value"
                  class="rounded-full px-3 py-1.5 text-label-md font-medium transition-colors"
                  :class="activeFilter === f.value
                    ? 'bg-neutral-950 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'"
                >
                  {{ f.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5">
            <div v-if="filteredItems.length" class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
              <IntegrationCard
                v-for="item in filteredItems"
                :key="item.id"
                :id="item.id"
                :name="item.name"
                :description="item.description"
                :category="item.category"
                :author="item.author"
                :installed="isInstalled(item.id)"
                @toggle="toggleItem(item.id)"
              />
            </div>

            <div v-else class="flex flex-col items-center justify-center h-full">
              <p class="text-body-md text-neutral-400">No items match your search.</p>
            </div>
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>