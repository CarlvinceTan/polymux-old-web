<script setup lang="ts">
import type { ItemCategory } from '~/composables/useMarketplace'

const { headerTabs } = useIntegrationsNavTabs()

const { installedItems, uninstall } = useMarketplace()

const groupOrder: ItemCategory[] = ['connection', 'plugin', 'workflow']

const groupLabels: Record<ItemCategory, string> = {
  connection: 'Integrations',
  plugin: 'Plugins',
  workflow: 'Workflows',
}

const groups = computed(() =>
  groupOrder
    .map(cat => ({
      category: cat,
      label: groupLabels[cat],
      items: installedItems.value.filter(i => i.category === cat),
    }))
    .filter(g => g.items.length > 0),
)

function removeLabel(category: ItemCategory) {
  return category === 'connection' ? 'Disconnect' : 'Uninstall'
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-full flex-1 flex-col p-4 sm:p-5">
          <div v-if="!installedItems.length" class="flex flex-1 flex-col items-center justify-center text-center">
            <div class="mb-4 rounded-full bg-neutral-100 p-4">
              <svg
                class="size-8 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 3v4M8 3v4" />
              </svg>
            </div>
            <p class="max-w-sm text-body-md text-neutral-500">
              Nothing installed yet — browse the Marketplace to add workflows, plugins, and integrations.
            </p>
            <NuxtLink
              to="/integrations/marketplace"
              class="mt-4 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Browse Marketplace
            </NuxtLink>
          </div>

          <div v-else class="space-y-6">
            <div v-for="group in groups" :key="group.category" class="space-y-2">
              <h2 class="text-label-md font-semibold uppercase tracking-widest text-neutral-400">
                {{ group.label }}
              </h2>
              <div class="space-y-2">
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="flex items-center gap-4 rounded-xl bg-white ghost-panel p-3.5"
                >
                  <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <svg
                      v-if="item.category === 'workflow'"
                      class="size-4 text-neutral-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <svg
                      v-else-if="item.category === 'plugin'"
                      class="size-4 text-neutral-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    <svg
                      v-else
                      class="size-4 text-neutral-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>

                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold leading-tight text-neutral-950">{{ item.name }}</p>
                    <p class="mt-0.5 truncate text-label-md text-neutral-400">{{ item.description }}</p>
                  </div>

                  <div class="flex shrink-0 items-center gap-3">
                    <div class="flex items-center gap-1.5">
                      <span class="size-2 rounded-full bg-neutral-300" aria-hidden="true" />
                      <span class="text-label-md text-neutral-500">Active</span>
                    </div>
                    <button
                      type="button"
                      @click="uninstall(item.id)"
                      class="rounded-lg bg-neutral-100 px-3 py-1.5 text-label-md font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                    >
                      {{ removeLabel(item.category) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>