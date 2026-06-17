<script setup lang="ts">
import { useI18n } from '#imports'
import { useIntersectionObserver } from '@vueuse/core'
import type { ItemCategory } from '~/composables/integrations/useMarketplace'
import type { EditorMyListing } from '~/composables/integrations/useEditorMyListings'
import { useInfiniteList } from '~/composables/misc/useInfiniteList'

type FilterValue = 'all' | ItemCategory
type SortValue = 'recent' | 'nameAZ' | 'nameZA' | 'popularity'

const { t } = useI18n()
const { headerTabs, customTabs } = useIntegrationsNavTabs()

const { listings, listPending: pending, fetchListings, refreshListings } = useEditorMyListings()

const publishOpen = ref(false)

const searchQuery = ref('')
const filterBy = ref<FilterValue>('all')
const sortBy = ref<SortValue>('recent')

const isFilterOpen = ref(false)
const isSortOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const sortRef = ref<HTMLElement | null>(null)

const filterOptions = computed<{ value: FilterValue, label: string }[]>(() => [
  { value: 'all', label: t('integrations.filterAll') },
  { value: 'integration', label: t('integrations.filterIntegrations') },
  { value: 'workflow', label: t('integrations.filterWorkflows') },
  { value: 'plugin', label: t('integrations.filterPlugins') },
])

const sortOptions = computed<{ value: SortValue, label: string }[]>(() => [
  { value: 'recent', label: t('integrations.editorSortRecent') },
  { value: 'nameAZ', label: t('integrations.sortNameAZ') },
  { value: 'nameZA', label: t('integrations.sortNameZA') },
  { value: 'popularity', label: t('integrations.sortPopularity') },
])

function fuzzyMatch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const lo = text.toLowerCase()
  const q = query.toLowerCase().trim()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lo.indexOf(q[qi]!, ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

const filteredListings = computed<EditorMyListing[]>(() => {
  let list: EditorMyListing[] = [...(listings.value ?? [])]

  if (searchQuery.value.trim()) {
    const term = searchQuery.value
    list = list.filter(
      l => fuzzyMatch(l.name, term)
        || fuzzyMatch(l.slug, term)
        || (l.description ? fuzzyMatch(l.description, term) : false),
    )
  }

  switch (filterBy.value) {
    case 'integration':
    case 'workflow':
    case 'plugin':
      list = list.filter(l => l.kind === filterBy.value)
      break
  }

  switch (sortBy.value) {
    case 'recent':
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      break
    case 'nameAZ':
      list.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      list.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'popularity':
      list.sort((a, b) => b.install_count - a.install_count)
      break
  }

  return list
})

const tabPanelRef = ref<{ bodyScrollEl: HTMLElement | null } | null>(null)
const publishScrollRoot = computed(() => tabPanelRef.value?.bodyScrollEl ?? undefined)

const { visibleItems: visiblePublishListings, hasMore: publishHasMore, loadMore: loadMorePublish } = useInfiniteList(filteredListings, 18)
const publishScrollSentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(
  publishScrollSentinel,
  ([e]) => {
    if (e?.isIntersecting && publishHasMore.value) loadMorePublish()
  },
  { root: publishScrollRoot, rootMargin: '120px' },
)

function fmtKind(kind: ItemCategory): string {
  if (kind === 'integration') return t('integrations.editorNewIntegration')
  if (kind === 'workflow') return t('integrations.editorNewWorkflow')
  return t('integrations.editorNewPlugin')
}

type ListingStatus = 'draft' | 'private' | 'unlisted' | 'public' | 'yanked'

const STATUS_META: Record<ListingStatus, { labelKey: string, descKey?: string, dot: string, pill: string }> = {
  draft: { labelKey: 'integrations.editorStatusDraft', descKey: 'integrations.editorStatusDraftDesc', dot: 'bg-neutral-400', pill: 'bg-neutral-100 text-neutral-600' },
  private: { labelKey: 'integrations.editorVisibilityPrivate', descKey: 'integrations.editorStatusPrivateDesc', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700' },
  unlisted: { labelKey: 'integrations.editorVisibilityUnlisted', descKey: 'integrations.editorStatusUnlistedDesc', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  public: { labelKey: 'integrations.editorVisibilityPublic', descKey: 'integrations.editorStatusPublicDesc', dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  yanked: { labelKey: 'integrations.editorYanked', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
}

// A listing's effective, user-facing status merges publish state with visibility:
// an unpublished/draft version reads "Draft" regardless of visibility; once
// published it reads as its audience — Private (workspace-only), Unlisted, or Public.
function effectiveStatus(item: EditorMyListing): ListingStatus {
  const s = item.current_version?.status
  if (!item.current_version || s === 'draft') return 'draft'
  if (s === 'yanked') return 'yanked'
  if (item.visibility === 'unlisted') return 'unlisted'
  if (item.visibility === 'public') return 'public'
  return 'private'
}

function statusOf(item: EditorMyListing): { dot: string, pill: string, label: string, title: string } {
  const meta = STATUS_META[effectiveStatus(item)]
  return { dot: meta.dot, pill: meta.pill, label: t(meta.labelKey), title: t(meta.descKey ?? meta.labelKey) }
}

function startNew() {
  publishOpen.value = true
}

async function onPublished() {
  await refreshListings()
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
  void fetchListings()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />
    </header>

    <TabPanel ref="tabPanelRef" class="min-h-0 min-w-0 flex-1">
      <template #header>
        <div class="flex items-center gap-2">
          <div class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
            <div class="flex size-8 shrink-0 items-center justify-center text-neutral-400">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              v-model="searchQuery"
              name="publisher-search"
              type="text"
              :placeholder="t('integrations.editorSearchPlaceholder')"
              class="min-w-0 flex-1 bg-transparent pr-2 text-body-md text-neutral-950 outline-none placeholder:text-neutral-400"
            >
          </div>

          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white transition-opacity hover:opacity-90"
            :aria-label="t('integrations.editorNew')"
            @click="startNew"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

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
              class="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
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
              class="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
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

      <div class="relative" style="padding: 2.5rem 6rem">
        <div
          v-if="pending && !listings?.length"
          class="min-h-[30vh]"
          role="status"
          aria-live="polite"
        >
          <span class="sr-only">{{ t('common.loading') }}</span>
        </div>

        <div
          v-else-if="filteredListings.length > 0"
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))"
        >
          <NuxtLink
            v-for="item in visiblePublishListings"
            :key="item.id"
            :to="`/integrations/publish/${item.id}`"
            class="ghost-panel ghost-panel-hover group flex flex-col gap-3 rounded-xl bg-white p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
          >
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                <UIcon
                  :name="item.kind === 'workflow'
                    ? 'i-heroicons-bolt-20-solid'
                    : item.kind === 'plugin'
                      ? 'i-heroicons-cube-transparent-20-solid'
                      : 'i-heroicons-link-20-solid'"
                  class="size-5"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold leading-tight text-neutral-950">
                  {{ item.name }}
                </p>
                <p class="mt-0.5 truncate text-label-md text-neutral-500">
                  {{ item.slug }}
                </p>
              </div>
              <span class="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600">
                {{ fmtKind(item.kind) }}
              </span>
            </div>

            <p
              v-if="item.description"
              class="line-clamp-2 min-h-[2.5rem] text-body-md leading-relaxed text-neutral-500"
            >
              {{ item.description }}
            </p>

            <div class="flex items-center gap-2 text-label-md text-neutral-500">
              <span
                class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium"
                :class="statusOf(item).pill"
                :title="statusOf(item).title"
              >
                <span class="size-1.5 rounded-full" :class="statusOf(item).dot" aria-hidden="true" />
                {{ statusOf(item).label }}
              </span>
              <span
                v-if="item.current_version"
                class="rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600"
              >
                {{ t('integrations.editorVersion', { version: item.current_version.version }) }}
              </span>
            </div>
          </NuxtLink>
          <div
            v-if="publishHasMore"
            ref="publishScrollSentinel"
            class="col-span-full h-px w-full shrink-0"
            aria-hidden="true"
          />
        </div>

        <div
          v-else-if="!listings?.length && !pending"
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <UIcon name="i-heroicons-rocket-launch-20-solid" class="mb-4 size-10 text-neutral-300" />
          <p class="text-body-md font-medium text-neutral-500">
            {{ t('integrations.editorEmpty') }}
          </p>
          <p class="mt-1 max-w-sm text-label-md text-neutral-500">
            {{ t('integrations.editorEmptyDesc') }}
          </p>
        </div>

        <p v-else class="py-12 text-center text-body-md text-neutral-500">
          {{ t('integrations.editorNoResults') }}
        </p>
      </div>
    </TabPanel>

    <IntegrationPublishModal
      v-model:open="publishOpen"
      @published="onPublished"
    />
  </div>
</template>
