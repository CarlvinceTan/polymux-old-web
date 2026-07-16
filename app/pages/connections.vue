<script setup lang="ts">
import { useI18n } from '#imports'
import type { MarketplaceItem } from '~/composables/integrations/useMarketplace'

const { t } = useI18n()
const { isCollapsed: isSidebarCollapsed } = useSidebar()
const { customTabs } = useIntegrationsNavTabs()
const headerTabs = computed<Record<string, string>>(() => ({}))
const {
  catalog,
  catalogPending,
  catalogLoaded,
  isInstalled,
  refresh,
  refreshCatalog,
} = useMarketplace()
const { refreshDrive } = useStorageUsage()
const { $posthog } = useNuxtApp()

const route = useRoute()
const router = useRouter()

type CollectionMode = 'marketplace' | 'installed'
type ViewMode = 'list' | 'gallery'
type SortValue = 'popularity' | 'nameAZ' | 'nameZA'
type MarketplaceSection = {
  key: string
  title: string
  description: string
  items: MarketplaceItem[]
}

const searchQuery = ref('')
const sortBy = ref<SortValue>('popularity')
const collectionMode = ref<CollectionMode>('marketplace')
const viewMode = ref<ViewMode>('list')

const isSortOpen = ref(false)
const sortRef = ref<HTMLElement | null>(null)
const isPublishMenuOpen = ref(false)
const publishMenuRef = ref<HTMLElement | null>(null)

const publishKinds = computed(() => [
  {
    path: '/integrations/publish/new/integration',
    title: t('integrations.editorNewIntegration'),
    description: t('integrations.editorNewIntegrationDesc'),
    icon: 'i-heroicons-link-20-solid',
  },
  {
    path: '/integrations/publish/new/workflow',
    title: t('integrations.editorNewWorkflow'),
    description: t('integrations.editorNewWorkflowDesc'),
    icon: 'i-heroicons-bolt-20-solid',
  },
  {
    path: '/integrations/publish/new/plugin',
    title: t('integrations.editorNewPlugin'),
    description: t('integrations.editorNewPluginDesc'),
    icon: 'i-heroicons-cube-transparent-20-solid',
  },
  {
    path: '/integrations/publish/new/layout',
    title: t('integrations.editorNewLayout'),
    description: t('integrations.editorNewLayoutDesc'),
    icon: 'i-heroicons-squares-2x2-20-solid',
  },
])

const sortOptions = computed<{ value: SortValue, label: string }[]>(() => [
  { value: 'popularity', label: t('integrations.sortPopularity') },
  { value: 'nameAZ', label: t('integrations.sortNameAZ') },
  { value: 'nameZA', label: t('integrations.sortNameZA') },
])

// Sort button shows the active selection, not a static label.
const currentSortLabel = computed(
  () => sortOptions.value.find(o => o.value === sortBy.value)?.label ?? t('integrations.sortBy'),
)

const catalogItems = computed<MarketplaceItem[]>(() => catalog.value ?? [])
const installedItems = computed(() => catalogItems.value.filter(i => isInstalled(i.id)))

const collectionTabs = computed(() => [
  { value: 'marketplace' as const, label: t('integrations.marketplace'), count: catalogItems.value.length },
  { value: 'installed' as const, label: t('integrations.installed'), count: installedItems.value.length },
])

// ?tag=<tag> deep link (storage settings, row tag chips in the detail modal).
function normalizeTagQuery(raw: unknown): string | null {
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string' || !s.trim()) return null
  return s.trim().toLowerCase()
}
const activeTagFilter = computed(() => normalizeTagQuery(route.query.tag))

function clearTagFilter() {
  const { tag: _omit, ...rest } = route.query
  router.replace({ query: rest })
}

const hasActiveFilters = computed(
  () => !!searchQuery.value.trim() || !!activeTagFilter.value,
)

function clearFilters() {
  searchQuery.value = ''
  if (activeTagFilter.value) clearTagFilter()
}

const filteredItems = computed<MarketplaceItem[]>(() => {
  let result = [...catalogItems.value]

  if (collectionMode.value === 'installed') {
    result = result.filter(i => isInstalled(i.id))
  }

  const tagNorm = activeTagFilter.value
  if (tagNorm) {
    result = result.filter(i => (i.tags ?? []).some(tag => tag.toLowerCase() === tagNorm))
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(
      i =>
        i.name.toLowerCase().includes(q)
        || i.description.toLowerCase().includes(q)
        || i.author.toLowerCase().includes(q),
    )
  }

  switch (sortBy.value) {
    case 'popularity':
      result.sort((a, b) => {
        const diff = b.popularity - a.popularity
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
      break
    case 'nameAZ':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
  }

  return result
})

const visibleRows = computed(() => filteredItems.value.slice(0, 48))
const hasSearchQuery = computed(() => !!searchQuery.value.trim() || !!activeTagFilter.value)

function sortItems(items: MarketplaceItem[]) {
  const result = [...items]
  switch (sortBy.value) {
    case 'popularity':
      result.sort((a, b) => {
        const diff = b.popularity - a.popularity
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
      break
    case 'nameAZ':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
  }
  return result
}

function itemText(item: MarketplaceItem) {
  return `${item.name} ${item.description} ${item.author} ${(item.tags ?? []).join(' ')}`.toLowerCase()
}

function matchesAny(item: MarketplaceItem, terms: string[]) {
  const text = itemText(item)
  return terms.some(term => text.includes(term))
}

function uniqueItems(items: MarketplaceItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const marketplaceItems = computed(() => sortItems(catalogItems.value))

const marketplaceSections = computed<MarketplaceSection[]>(() => {
  const all = marketplaceItems.value
  const sections: MarketplaceSection[] = [
    {
      key: 'featured',
      title: 'Featured',
      description: 'Useful starting points for connecting tools and expanding your workspace.',
      items: all.slice(0, 6),
    },
    {
      key: 'storage',
      title: 'Storage and files',
      description: 'Connect file systems, documents, drives, and workspace storage.',
      items: all.filter(item => matchesAny(item, ['storage', 'file', 'files', 'drive', 'docs', 'sheets', 'pdf', 'folder'])),
    },
    {
      key: 'authentication',
      title: 'Authentication and identity',
      description: 'Sign-in, user management, identity providers, and permissions.',
      items: all.filter(item => matchesAny(item, ['auth', 'oauth', 'login', 'identity', 'user', 'permission', 'sso'])),
    },
    {
      key: 'automation',
      title: 'Automation and workflows',
      description: 'Reusable workflows, agents, plugins, and operational shortcuts.',
      items: all.filter(item => item.category === 'workflow' || item.category === 'plugin' || matchesAny(item, ['workflow', 'automation', 'agent', 'task', 'scrape'])),
    },
    {
      key: 'workspace',
      title: 'Workspace UI',
      description: 'Layouts and interface extensions for shaping how work is presented.',
      items: all.filter(item => item.category === 'layout' || matchesAny(item, ['layout', 'dashboard', 'view', 'interface', 'ui'])),
    },
  ]

  const visible = sections
    .map(section => ({ ...section, items: uniqueItems(section.items).slice(0, section.key === 'featured' ? 6 : 4) }))
    .filter(section => section.items.length > 0)

  if (visible.length === 1 && visible[0]?.key === 'featured') return visible
  return visible
})

const isLoading = computed(() => (catalogPending.value || !catalogLoaded.value) && catalogItems.value.length === 0)
const noResults = computed(() => !isLoading.value && filteredItems.value.length === 0)

const detailOpen = ref(false)
const selectedItem = ref<MarketplaceItem | null>(null)

function openDetail(item: MarketplaceItem) {
  $posthog?.capture('integration_detail_opened', {
    integration_id: item.id,
    integration_name: item.name,
    category: item.category,
    is_first_party: item.isFirstParty,
    is_installed: isInstalled(item.id),
  })
  selectedItem.value = item
  detailOpen.value = true
}

function iconMeta(item: MarketplaceItem) {
  return integrationIconMeta(item.id, item.category)
}

function handleSortClickOutside(event: MouseEvent) {
  if (sortRef.value && !sortRef.value.contains(event.target as Node)) {
    isSortOpen.value = false
  }
  if (publishMenuRef.value && !publishMenuRef.value.contains(event.target as Node)) {
    isPublishMenuOpen.value = false
  }
}

onMounted(async () => {
  document.addEventListener('click', handleSortClickOutside)
  // Post-OAuth: refresh so the newly-connected provider shows up. The legacy
  // ?migrate=1 flow drove a Supabase→Drive migration; cloud storage is gone,
  // so we just strip the param.
  if (route.query.connected === 'google-drive') {
    await Promise.all([refresh(), refreshCatalog(), refreshDrive(true)])
  }
  if (route.query.migrate === '1') {
    const { migrate: _migrate, ...rest } = route.query
    router.replace({ query: rest })
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleSortClickOutside)
})
</script>

<template>
  <FeatureGate name="integrations">
    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-2.5">
      <div
        class="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-6"
        :class="{ 'lg:pl-8': isSidebarCollapsed }"
      >
        <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-1.5">
            <button
              v-for="tab in collectionTabs"
              :key="tab.value"
              type="button"
              class="flex h-6 items-center rounded-md px-2.5 text-nav transition-colors"
              :class="collectionMode === tab.value ? 'bg-neutral-100 font-medium text-neutral-950' : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950'"
              @click="collectionMode = tab.value"
            >
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <span
              class="flex size-6 items-center justify-center rounded-md text-neutral-400"
              aria-hidden="true"
            >
              <UIcon name="i-heroicons-cog-6-tooth-20-solid" class="size-3" />
            </span>

            <div ref="publishMenuRef" class="relative">
              <button
                type="button"
                class="flex h-6 overflow-hidden rounded-md bg-neutral-950 text-white shadow-sm transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
                :aria-label="t('integrations.publish')"
                :aria-expanded="isPublishMenuOpen"
                aria-haspopup="menu"
                @click.stop="isPublishMenuOpen = !isPublishMenuOpen"
              >
                <span class="flex size-6 items-center justify-center border-r border-white/15">
                  <UIcon name="i-heroicons-arrow-up-tray-20-solid" class="size-3" />
                </span>
                <span class="flex h-6 w-5 items-center justify-center text-white/75">
                  <UIcon name="i-heroicons-chevron-down-20-solid" class="size-3" />
                </span>
              </button>

              <div
                v-if="isPublishMenuOpen"
                class="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
                role="menu"
                @click.stop
              >
                <p class="px-3 pb-1.5 pt-2.5 text-meta font-semibold uppercase tracking-wide text-neutral-400">
                  {{ t('integrations.publish') }}
                </p>
                <NuxtLink
                  v-for="kind in publishKinds"
                  :key="kind.path"
                  :to="kind.path"
                  class="flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
                  role="menuitem"
                  @click="isPublishMenuOpen = false"
                >
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                    <UIcon :name="kind.icon" class="size-4" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-nav font-semibold leading-tight text-neutral-950">
                      {{ kind.title }}
                    </span>
                    <span class="mt-0.5 line-clamp-2 block text-label-md leading-snug text-neutral-500">
                      {{ kind.description }}
                    </span>
                  </span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </header>

        <section class="mx-auto flex w-full max-w-2xl flex-col gap-3 pt-3">
          <div class="text-left">
            <h1 class="text-xl font-semibold leading-tight tracking-normal text-neutral-950">{{ t('storage.settings.connectionsTitle') }}</h1>
            <p class="mt-1.5 text-body-md leading-5 text-neutral-500">{{ t('storage.settings.connectionsDesc') }}</p>
          </div>

          <label class="flex h-[30px] w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50/50 px-2 transition focus-within:border-neutral-400 focus-within:bg-white">
            <svg class="size-4 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              v-model="searchQuery"
              name="plugins-search"
              type="text"
              :placeholder="t('integrations.searchAllPlaceholder')"
              class="min-w-0 flex-1 bg-transparent pr-1 text-label-md text-neutral-950 outline-none placeholder:text-neutral-400"
            >
          </label>
        </section>

        <SubNav v-if="customTabs.length" :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />

        <section class="-mb-2 -mt-1 mx-auto flex w-full max-w-2xl items-center justify-end gap-1.5">
          <div class="flex items-center rounded-md bg-neutral-100 p-0.5">
            <button
              type="button"
              class="group/action relative flex items-center justify-center rounded px-1.5 py-1 transition-all"
              :class="viewMode === 'gallery' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
              aria-label="Gallery view"
              @click="viewMode = 'gallery'"
            >
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              class="group/action relative flex items-center justify-center rounded px-1.5 py-1 transition-all"
              :class="viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
              aria-label="List view"
              @click="viewMode = 'list'"
            >
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          <div ref="sortRef" class="relative">
            <button
              type="button"
              class="flex items-center justify-center rounded-md px-1.5 py-1.5 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950/15"
              :aria-label="currentSortLabel"
              @click.stop="isSortOpen = !isSortOpen"
            >
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="21" y1="4" x2="14" y2="4" />
                <line x1="10" y1="4" x2="3" y2="4" />
                <line x1="21" y1="12" x2="12" y2="12" />
                <line x1="8" y1="12" x2="3" y2="12" />
                <line x1="21" y1="20" x2="16" y2="20" />
                <line x1="12" y1="20" x2="3" y2="20" />
                <line x1="14" y1="2" x2="14" y2="6" />
                <line x1="8" y1="10" x2="8" y2="14" />
                <line x1="16" y1="18" x2="16" y2="22" />
              </svg>
            </button>
            <div
              v-if="isSortOpen"
              class="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-nav transition-colors hover:bg-neutral-100"
                :class="opt.value === sortBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                @click.stop="sortBy = opt.value; isSortOpen = false"
              >
                {{ opt.label }}
                <UIcon v-if="opt.value === sortBy" name="i-heroicons-check-20-solid" class="size-4 shrink-0 text-neutral-950" />
              </button>
            </div>
          </div>
          <div
            v-if="activeTagFilter"
            class="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 text-nav text-neutral-700"
          >
            <span>{{ t('integrations.tagFilterBanner', { tag: activeTagFilter }) }}</span>
            <button
              type="button"
              class="rounded-md bg-white px-2 py-0.5 text-label-md font-semibold text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
              @click="clearTagFilter"
            >
              {{ t('integrations.tagFilterClear') }}
            </button>
          </div>
        </section>

        <section class="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div v-if="isLoading" class="flex min-h-36 flex-col items-center justify-center px-4 text-center">
            <UIcon name="i-heroicons-arrow-path-20-solid" class="mb-2 size-5 animate-spin text-neutral-400" />
            <p class="text-body-md font-medium text-neutral-500">{{ t('integrations.loading') }}</p>
          </div>

          <div v-else-if="noResults" class="flex min-h-36 flex-col items-center justify-center px-4 text-center">
            <UIcon name="i-heroicons-magnifying-glass-20-solid" class="mb-2 size-8 text-neutral-300" />
            <p class="text-body-md font-medium text-neutral-500">{{ t('integrations.noMatches') }}</p>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="mt-3 text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
              @click="clearFilters"
            >
              {{ t('integrations.filterClear') }}
            </button>
          </div>

          <template v-else-if="collectionMode === 'marketplace' && !hasSearchQuery">
            <section
              v-for="section in marketplaceSections"
              :key="section.key"
              class="flex flex-col gap-3"
            >
              <div>
                <h2 class="text-body-md font-semibold text-neutral-950">{{ section.title }}</h2>
                <p class="mt-0.5 text-label-md leading-5 text-neutral-500">{{ section.description }}</p>
              </div>
              <div class="h-px w-full bg-neutral-200" aria-hidden="true" />

              <div
                v-if="viewMode === 'gallery'"
                class="grid grid-cols-1 gap-x-8 gap-y-3.5 lg:grid-cols-2"
              >
                <button
                  v-for="item in section.items"
                  :key="item.id"
                  type="button"
                  class="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950/15"
                  @click="openDetail(item)"
                >
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 shadow-sm"
                    :class="iconMeta(item).tintClass"
                  >
                    <UIcon :name="iconMeta(item).iconName" class="size-4" aria-hidden="true" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-nav font-semibold text-neutral-950">{{ item.name }}</span>
                    <span class="mt-0.5 block truncate text-nav leading-5 text-neutral-500">{{ item.description }}</span>
                  </span>
                  <span class="flex size-6 shrink-0 items-center justify-center text-neutral-400 transition group-hover:text-neutral-950">
                    <UIcon name="i-heroicons-ellipsis-horizontal-20-solid" class="size-3.5" />
                  </span>
                </button>
              </div>

              <div v-else class="flex flex-col gap-1">
                <button
                  v-for="item in section.items"
                  :key="item.id"
                  type="button"
                  class="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-950/15"
                  @click="openDetail(item)"
                >
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 shadow-sm"
                    :class="iconMeta(item).tintClass"
                  >
                    <UIcon :name="iconMeta(item).iconName" class="size-4" aria-hidden="true" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-nav font-semibold text-neutral-950">{{ item.name }}</span>
                    <span class="mt-0.5 block truncate text-nav leading-5 text-neutral-500">{{ item.description }}</span>
                  </span>
                  <span class="flex size-6 shrink-0 items-center justify-center text-neutral-400 transition group-hover:text-neutral-950">
                    <UIcon name="i-heroicons-ellipsis-horizontal-20-solid" class="size-3.5" />
                  </span>
                </button>
              </div>
            </section>
          </template>

          <section v-else class="flex flex-col gap-3">
            <div class="flex items-end justify-between gap-3">
              <div>
                <h2 class="text-body-md font-semibold text-neutral-950">
                  {{ collectionMode === 'installed' ? t('integrations.installed') : 'Results' }}
                </h2>
                <p v-if="collectionMode === 'installed'" class="mt-0.5 text-label-md leading-5 text-neutral-500">
                  Installed connections, workflows, plugins, and layouts for this workspace.
                </p>
              </div>
              <button
                v-if="hasActiveFilters"
                type="button"
                class="text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
                @click="clearFilters"
              >
                {{ t('integrations.filterClear') }}
              </button>
            </div>
            <div class="h-px w-full bg-neutral-200" aria-hidden="true" />

            <p
              v-if="collectionMode === 'installed' && !visibleRows.length && !hasSearchQuery"
              class="py-2 text-body-md text-neutral-500"
            >
              {{ t('integrations.nothingInstalled') }}
            </p>

            <div v-else-if="viewMode === 'gallery'" class="grid grid-cols-1 gap-x-8 gap-y-3.5 lg:grid-cols-2">
              <button
                v-for="item in visibleRows"
                :key="item.id"
                type="button"
                class="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950/15"
                @click="openDetail(item)"
              >
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 shadow-sm"
                  :class="iconMeta(item).tintClass"
                >
                  <UIcon :name="iconMeta(item).iconName" class="size-4" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-nav font-semibold text-neutral-950">{{ item.name }}</span>
                  <span class="mt-0.5 block truncate text-nav leading-5 text-neutral-500">{{ item.description }}</span>
                </span>
                <span class="flex size-6 shrink-0 items-center justify-center text-neutral-400 transition group-hover:text-neutral-950">
                  <UIcon name="i-heroicons-ellipsis-horizontal-20-solid" class="size-3.5" />
                </span>
              </button>
            </div>

            <div v-else data-testid="plugins-list" class="flex flex-col gap-1">
            <button
              v-for="item in visibleRows"
              :key="item.id"
              type="button"
              class="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-950/15"
              @click="openDetail(item)"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 shadow-sm"
                :class="iconMeta(item).tintClass"
              >
                <UIcon :name="iconMeta(item).iconName" class="size-4" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-nav font-semibold text-neutral-950">{{ item.name }}</span>
                <span class="mt-0.5 block truncate text-nav leading-5 text-neutral-500">{{ item.description }}</span>
              </span>
              <span class="flex size-6 shrink-0 items-center justify-center text-neutral-400 transition group-hover:text-neutral-950">
                <UIcon name="i-heroicons-ellipsis-horizontal-20-solid" class="size-3.5" />
              </span>
            </button>
            </div>
          </section>
        </section>

        <IntegrationSettingsModal
          v-model:open="detailOpen"
          :item="selectedItem"
        />
      </div>
    </div>
  </FeatureGate>
</template>
