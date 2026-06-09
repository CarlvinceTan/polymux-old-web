<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

definePageMeta({ layout: 'landing' })

const { t } = useI18n()

useHead({
  title: () => t('community.metaTitle'),
  meta: [
    {
      name: 'description',
      content: () => t('community.metaDescription'),
    },
  ],
})

interface CommunitySearchHit {
  source: 'documentation' | 'forum' | 'blog'
  title: string
  url: string
  snippet: string
  score: number
  meta?: string
}

const searchQuery = ref('')
const searchHits = ref<CommunitySearchHit[]>([])
const searchLoading = ref(false)
const searchContainerRef = ref<HTMLElement | null>(null)
const searchPanelOpen = ref(false)
let searchSeq = 0
let searchDebounceId: ReturnType<typeof setTimeout> | null = null

const trimmedQuery = computed(() => searchQuery.value.trim())
const showSearchPanel = computed(() => searchPanelOpen.value && trimmedQuery.value.length >= 2)

interface CommunityTile {
  labelKey: 'blog' | 'documentation' | 'forum'
  icon: string
  to?: string
  disabled?: boolean
}

const tiles = computed<CommunityTile[]>(() => [
  {
    labelKey: 'blog',
    icon: 'i-heroicons-newspaper-20-solid',
    to: '/blog',
  },
  {
    labelKey: 'documentation',
    icon: 'i-heroicons-book-open-20-solid',
    to: '/documentation',
  },
  {
    labelKey: 'forum',
    icon: 'i-heroicons-chat-bubble-left-right-20-solid',
    to: '/forum',
  },
])

function sourceLabel(source: CommunitySearchHit['source']): string {
  return t(`community.sources.${source}`)
}

const SOURCE_ICONS: Record<CommunitySearchHit['source'], string> = {
  documentation: 'i-heroicons-book-open-20-solid',
  forum: 'i-heroicons-chat-bubble-left-right-20-solid',
  blog: 'i-heroicons-newspaper-20-solid',
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightSnippet(text: string, query: string): string {
  const escaped = escapeHtml(text)
  const q = query.trim()
  if (!q) return escaped
  const re = new RegExp(`(${escapeRegExp(escapeHtml(q))})`, 'gi')
  return escaped.replace(re, '<mark class="bg-yellow-100 text-neutral-950">$1</mark>')
}

async function runSearch(q: string) {
  const seq = ++searchSeq
  if (!q || q.length < 2) {
    searchHits.value = []
    searchLoading.value = false
    return
  }

  searchLoading.value = true
  try {
    const res = await $fetch<{ hits: CommunitySearchHit[] }>('/api/community/search', {
      query: { q },
    })
    if (seq !== searchSeq) return
    searchHits.value = res.hits ?? []
  } catch {
    if (seq !== searchSeq) return
    searchHits.value = []
  } finally {
    if (seq === searchSeq) searchLoading.value = false
  }
}

watch(searchQuery, (q) => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => runSearch(q.trim()), 200)
  if (q.trim().length >= 2) searchPanelOpen.value = true
})

onClickOutside(searchContainerRef, () => {
  searchPanelOpen.value = false
})

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    searchPanelOpen.value = false
    searchQuery.value = ''
    return
  }
  if (e.key === 'Enter' && searchHits.value.length > 0) {
    navigateTo(searchHits.value[0]!.url)
  }
}
</script>

<template>
  <div class="flex w-full justify-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
    <div class="w-full max-w-4xl">
      <!-- Hero section -->
      <header class="text-center">
        <h1 class="font-serif text-[2.75rem] leading-[1.08] tracking-tight text-neutral-950 sm:text-5xl">
          {{ t('community.title') }}
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ t('community.subtitle') }}
        </p>

        <!-- Search bar -->
        <div ref="searchContainerRef" class="relative mx-auto mt-10 max-w-[560px]">
          <label
            for="community-search"
            class="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-3 text-base transition-colors focus-within:border-neutral-300"
          >
            <UIcon
              name="i-heroicons-magnifying-glass-20-solid"
              class="size-5 shrink-0 text-neutral-400"
              aria-hidden="true"
            />
            <input
              id="community-search"
              v-model="searchQuery"
              name="community-search"
              type="search"
              :placeholder="t('community.searchPlaceholder')"
              autocomplete="off"
              class="min-w-0 flex-1 bg-transparent text-neutral-950 placeholder-neutral-500 outline-none"
              @focus="searchPanelOpen = true"
              @keydown="onSearchKeydown"
            >
          </label>

          <div
            v-if="showSearchPanel"
            class="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-lg"
            role="region"
            aria-live="polite"
            :aria-label="t('community.searchResults')"
          >
            <div v-if="searchLoading" class="px-4 py-4 text-sm text-neutral-500">
              {{ t('community.searching') }}
            </div>

            <ul
              v-else-if="searchHits.length > 0"
              class="max-h-[31.5rem] divide-y divide-neutral-100 overflow-y-auto overscroll-contain"
            >
              <li v-for="hit in searchHits" :key="`${hit.source}-${hit.url}`">
                <NuxtLink
                  :to="hit.url"
                  class="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-neutral-50"
                >
                  <div class="flex items-start justify-between gap-3">
                    <span class="text-sm font-medium leading-snug text-neutral-950">
                      {{ hit.title }}
                    </span>
                    <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[0.6875rem] font-medium text-neutral-600">
                      <UIcon :name="SOURCE_ICONS[hit.source]" class="size-3" />
                      {{ hit.meta ?? sourceLabel(hit.source) }}
                    </span>
                  </div>
                  <span
                    v-if="hit.snippet"
                    class="line-clamp-2 text-xs leading-snug text-neutral-500"
                    v-html="highlightSnippet(hit.snippet, searchQuery)"
                  />
                </NuxtLink>
              </li>
            </ul>

            <div v-else class="px-4 py-4 text-sm text-neutral-500">
              {{ t('community.noResults', { query: trimmedQuery }) }}
            </div>
          </div>
        </div>
      </header>

      <hr class="my-12 border-neutral-200 sm:border-neutral-200/[.85]" />

      <!-- Tiles grid -->
      <div class="grid gap-6 sm:grid-cols-3">
        <NuxtLink
          v-for="tile in tiles"
          :key="tile.labelKey"
          :to="tile.to"
          :class="[
            'group relative rounded-xl border border-neutral-200 p-6 transition-all',
            tile.disabled
              ? 'cursor-not-allowed bg-neutral-50/50 opacity-60'
              : 'bg-white hover:border-neutral-300 hover:shadow-sm',
          ]"
        >
          <div v-if="tile.disabled" class="absolute right-4 top-4">
            <span class="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700">
              {{ t('community.comingSoon') }}
            </span>
          </div>

          <UIcon :name="tile.icon" class="size-8 text-neutral-400 group-hover:text-neutral-600" />
          <h3 class="mt-4 text-lg font-semibold text-neutral-950">
            {{ t(`community.tiles.${tile.labelKey}.label`) }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-neutral-600">
            {{ t(`community.tiles.${tile.labelKey}.description`) }}
          </p>

          <div v-if="!tile.disabled" class="mt-4 flex items-center text-sm font-medium text-neutral-700 group-hover:text-neutral-950">
            {{ t('community.explore') }}
            <UIcon name="i-heroicons-arrow-right-20-solid" class="ml-2 size-4 transition-transform group-hover:translate-x-1" />
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
