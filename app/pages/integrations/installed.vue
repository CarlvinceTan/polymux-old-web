<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/useMarketplace'

const { t } = useI18n()
const { headerTabs } = useIntegrationsNavTabs()
const { installedItems, uninstall, refresh } = useMarketplace()

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

function removeLabel(category: ItemCategory) {
  return category === 'connection' ? t('integrations.disconnect') : t('integrations.uninstall')
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" raw-tab-labels />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <div class="flex min-h-full flex-1 flex-col" style="padding: 5rem 6rem 2.5rem">
        <div
          v-if="migrationState.status !== 'idle'"
          class="mb-6 flex items-start gap-3 rounded-xl border bg-white p-4"
          :class="{
            'border-neutral-300': migrationState.status === 'running',
            'border-green-300 bg-green-50': migrationState.status === 'done',
            'border-error-300 bg-error-50': migrationState.status === 'failed',
          }"
        >
          <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-google-drive-tint text-google-drive">
            <svg
              v-if="migrationState.status === 'running'"
              class="size-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg v-else-if="migrationState.status === 'done'" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-body-md font-medium text-neutral-950">
              {{
                migrationState.status === 'running'
                  ? t('integrations.driveMigrating')
                  : migrationState.status === 'done'
                    ? t('integrations.driveMigrateDone')
                    : t('integrations.driveMigrateFailed')
              }}
            </p>
            <p v-if="migrationState.status === 'running'" class="mt-1 text-label-md text-neutral-500">
              {{
                t('integrations.driveMigrateProgress', {
                  migrated: migrationState.totalMigrated,
                  remaining: migrationState.remaining ?? '—',
                })
              }}
            </p>
            <p v-else-if="migrationState.errors.length" class="mt-1 text-label-md text-neutral-500">
              {{ t('integrations.driveMigrateSomeFailed', { count: migrationState.errors.length }) }}
            </p>
          </div>
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
              <div class="space-y-2">
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="ghost-panel group flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-neutral-50"
                >
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700 transition-colors group-hover:bg-white">
                    <svg
                      v-if="item.category === 'workflow'"
                      class="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <svg
                      v-else-if="item.category === 'plugin'"
                      class="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    <svg
                      v-else
                      class="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold leading-tight text-neutral-950">
                      {{ item.name }}
                    </p>
                    <p class="mt-1 truncate text-label-md text-neutral-500">
                      {{ item.description }}
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-4">
                    <div class="hidden items-center gap-1.5 sm:flex">
                      <span class="relative flex size-2 items-center justify-center" aria-hidden="true">
                        <span class="absolute inline-flex size-2 rounded-full bg-neutral-950/20" />
                        <span class="relative inline-flex size-1.5 rounded-full bg-neutral-800" />
                      </span>
                      <span class="text-label-md font-medium text-neutral-600">
                        {{ t('integrations.active') }}
                      </span>
                    </div>
                    <button
                      type="button"
                      class="rounded-lg bg-neutral-100 px-3 py-1.5 text-label-md font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
                      @click="uninstall(item.id)"
                    >
                      {{ removeLabel(item.category) }}
                    </button>
                  </div>
                </div>
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
  </div>
</template>
