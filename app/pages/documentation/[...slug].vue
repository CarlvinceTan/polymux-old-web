<script setup lang="ts">
import { marked, Renderer as MarkedRenderer } from 'marked'

definePageMeta({ layout: false })

const route = useRoute()
const user = useSupabaseUser()
const { t, locale, locales, setLocale } = useI18n()
const { sections, findEntry, neighbours } = useDocsNav()

const availableLocales = computed(() =>
  (locales.value as Array<{ code: string, name: string }>).map(l => ({
    code: l.code,
    label: l.name,
  })),
)

const currentLocaleLabel = computed(() => {
  const match = availableLocales.value.find(l => l.code === locale.value)
  return match?.label ?? locale.value
})

const slug = computed<string>(() => {
  const raw = route.params.slug
  const parts = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return parts.join('/') || DEFAULT_DOC_SLUG
})

const entry = computed(() => findEntry(slug.value))
const pageTitle = computed(() => entry.value?.title ?? 'Documentation')
const neighbourPair = computed(() => neighbours(slug.value))
const prev = computed(() => neighbourPair.value.prev)
const next = computed(() => neighbourPair.value.next)

useHead(() => ({
  title: `${pageTitle.value} · Polymux Docs`,
  meta: [
    {
      name: 'description',
      content: `Polymux documentation — ${pageTitle.value}.`,
    },
  ],
}))

const { data: markdown, error, refresh } = await useAsyncData(
  () => `doc-${locale.value}-${slug.value}`,
  () =>
    $fetch<string>(`/api/docs/${slug.value}`, {
      responseType: 'text',
      query: { locale: locale.value },
    }),
  { watch: [slug, locale] },
)

interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

interface RenderedDoc {
  html: string
  toc: TocItem[]
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Decode HTML entities that marked emits when escaping text (e.g. `&#39;` for
 * `'`, `&amp;` for `&`). Needed for any string that's pulled OUT of rendered
 * HTML for display in plain Vue interpolation — `{{ }}` does not decode
 * entities, so a heading like "What's new" would otherwise show as
 * "What&#39;s new" in the right-rail ToC, search results, etc.
 *
 * Works on both server (SSR) and client because it doesn't depend on
 * DOMParser; only the entity forms marked actually emits are handled
 * (named entities for the standard five + numeric refs).
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // `&amp;` last so we don't double-decode entities that contained `&`.
    .replace(/&amp;/g, '&')
}

// ─── Code block renderer (mirrors chat AgentMessage's agent-codeblock) ─────
// Emits the same DOM structure as the chat surface so the docs body uses the
// identical visual treatment + copy-button behaviour. Click handling is
// wired through `onArticleClick` on the article element below (v-html
// strips Vue bindings, so delegation is the only way).
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function escapeHtmlBody(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
const copyIconSvg = '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.5 3A1.5 1.5 0 0 1 14 4.5V6h1.5A1.5 1.5 0 0 1 17 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 15.5V14H4.5A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3zm1.5 9.5a1.5 1.5 0 0 1-1.5 1.5H7v1.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5H14zM4.5 4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5z"/></svg>'
const checkIconSvg = '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15.188 5.11a.5.5 0 0 1 .752.626l-.056.084-7.5 9a.5.5 0 0 1-.738.033l-3.5-3.5-.064-.078a.501.501 0 0 1 .693-.693l.078.064 3.113 3.113 7.15-8.58z"/></svg>'

function buildRenderer(): MarkedRenderer {
  const renderer = new MarkedRenderer()
  renderer.code = function ({ text, lang, escaped }) {
    const language = (lang || '').trim().split(/\s+/)[0] || 'plaintext'
    const codeBody = escaped ? text : escapeHtmlBody(text)
    const copyTooltip = escapeAttr(t('common.copy'))
    const copiedTooltip = escapeAttr(t('chat.codeCopied'))
    const copyAria = escapeAttr(t('chat.copyToClipboard'))
    const copyBtn =
      `<button type="button" class="agent-codeblock-copy" aria-label="${copyAria}">`
      + `<span class="agent-codeblock-tooltip" aria-hidden="true">`
      + `<span class="agent-codeblock-tooltip-label agent-codeblock-tooltip-label--copy">${copyTooltip}</span>`
      + `<span class="agent-codeblock-tooltip-label agent-codeblock-tooltip-label--copied">${copiedTooltip}</span>`
      + `</span>`
      + `<span class="agent-codeblock-copy-icon agent-codeblock-copy-icon--copy">${copyIconSvg}</span>`
      + `<span class="agent-codeblock-copy-icon agent-codeblock-copy-icon--copied">${checkIconSvg}</span>`
      + `</button>`
    return (
      `<div class="agent-codeblock" role="group" aria-label="${escapeAttr(language)} code" tabindex="0">`
      + `<div class="agent-codeblock-header">`
      + `<span class="agent-codeblock-lang">${escapeAttr(language)}</span>`
      + `${copyBtn}`
      + `</div>`
      + `<div class="agent-codeblock-scroll">`
      + `<pre><code class="language-${escapeAttr(language)}">${codeBody}</code></pre>`
      + `</div>`
      + `</div>`
    )
  }
  return renderer
}

function renderDoc(md: string): RenderedDoc {
  const renderer = buildRenderer()
  const rawHtml = marked.parse(md, { renderer, async: false }) as string
  const toc: TocItem[] = []
  const used = new Set<string>()

  const annotated = rawHtml.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (_match, depthStr: string, inner: string) => {
      const depth = (depthStr === '2' ? 2 : 3) as 2 | 3
      // `inner` is HTML — strip tags, then decode entities so a heading
      // like "What's new" surfaces in the ToC as `What's new` rather than
      // `What&#39;s new` once Vue interpolates it.
      const text = decodeEntities(inner.replace(/<[^>]*>/g, '')).trim()
      let id = slugify(text)
      let i = 2
      while (used.has(id)) id = `${slugify(text)}-${i++}`
      used.add(id)
      toc.push({ id, text, level: depth })
      return `<h${depth} id="${id}">${inner}</h${depth}>`
    },
  )

  return { html: annotated, toc }
}

function onArticleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const btn = target?.closest('.agent-codeblock-copy') as HTMLButtonElement | null
  if (!btn) return
  const block = btn.closest('.agent-codeblock')
  const codeEl = block?.querySelector('pre code') as HTMLElement | null
  const value = codeEl?.textContent ?? ''
  if (!value) return
  const flash = () => {
    btn.classList.add('is-copied')
    window.setTimeout(() => btn.classList.remove('is-copied'), 1400)
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(flash).catch(() => {})
  } else {
    flash()
  }
}

const rendered = computed<RenderedDoc>(() => {
  if (!markdown.value) return { html: '', toc: [] }
  return renderDoc(markdown.value)
})

const html = computed(() => rendered.value.html)
const toc = computed(() => rendered.value.toc)

// ─── Right rail: track which heading is currently in view ──────────────────
const activeHeadingId = ref<string | null>(null)
let articleEl: HTMLElement | null = null

// When the user clicks a TOC link the smooth-scroll plays out over a few
// hundred ms; suspend scroll-based detection during that window so the
// clicked heading "wins" — otherwise the position-based logic would race
// the animation and snap the rail back to whichever heading happens to
// be above the offset line right now.
let scrollDetectionSuspendedUntil = 0

function syncActiveHeading() {
  if (performance.now() < scrollDetectionSuspendedUntil) return
  if (!articleEl) return
  const headings = articleEl.querySelectorAll<HTMLElement>('h2[id], h3[id]')
  if (headings.length === 0) {
    activeHeadingId.value = null
    return
  }
  const scrollRoot = document.getElementById('docs-scroll')
  if (!scrollRoot) return

  const scrollTop = scrollRoot.scrollTop

  // Bottom override: when the scroll area can't move any further, short
  // sections clustered at the bottom would never cross the offset line and
  // none of them would ever become "active". Force the last heading to be
  // active so the rail finishes on the page's last section.
  const atBottom =
    scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 4
  if (atBottom) {
    activeHeadingId.value = (headings[headings.length - 1] as HTMLElement).id
    return
  }

  // 56px sticky header + breathing room — a heading must scroll past this
  // boundary before it becomes "active" in the right rail.
  const offset = 100
  const rootTop = scrollRoot.getBoundingClientRect().top

  let active: string | null = null
  for (const h of Array.from(headings)) {
    const topInRoot = h.getBoundingClientRect().top - rootTop + scrollTop
    if (topInRoot <= scrollTop + offset) {
      active = h.id
    } else {
      break
    }
  }
  // Above the first heading: highlight it anyway so the rail isn't blank.
  if (!active) active = (headings[0] as HTMLElement).id
  activeHeadingId.value = active
}

function jumpToHeading(id: string, ev?: MouseEvent) {
  ev?.preventDefault()
  const el = document.getElementById(id)
  const scrollRoot = document.getElementById('docs-scroll')
  if (!el || !scrollRoot) return

  // Set the click target as active immediately so the rail reflects intent
  // even if the destination lives in the un-scrollable "tail" of the page.
  activeHeadingId.value = id
  scrollDetectionSuspendedUntil = performance.now() + 700

  const target =
    el.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 80
  scrollRoot.scrollTo({ top: target, behavior: 'smooth' })
  // Mirror the hash without nuxt-router scroll behavior kicking in.
  history.replaceState(history.state, '', `${route.path}#${id}`)
}

// ─── Sidebar mobile state ──────────────────────────────────────────────────
const mobileNavOpen = ref(false)
function closeMobileNav() {
  mobileNavOpen.value = false
}

// ─── Sidebar collapsible sections ──────────────────────────────────────────
// Sections expand by default. The section containing the current page is
// always forced open so the user never loses sight of where they are.
const sectionOpen = ref<Record<string, boolean>>(
  Object.fromEntries(sections.map((s) => [s.title, true])),
)

function isSectionOpen(title: string): boolean {
  return sectionOpen.value[title] ?? true
}

function toggleSection(title: string) {
  sectionOpen.value[title] = !isSectionOpen(title)
}

// Keep the section containing the current slug expanded across navigations.
watch(
  slug,
  (s) => {
    const owning = sections.find((sec) => sec.entries.some((e) => e.slug === s))
    if (owning) sectionOpen.value[owning.title] = true
  },
  { immediate: true },
)

// ─── Search ────────────────────────────────────────────────────────────────
interface SearchHit {
  slug: string
  title: string
  snippet: string
  score: number
}

const searchQuery = ref('')
const searchOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchContainerRef = ref<HTMLElement | null>(null)
const searchHits = ref<SearchHit[]>([])
const searchLoading = ref(false)
let searchSeq = 0
let searchDebounceId: ReturnType<typeof setTimeout> | null = null

const slugToSection = computed(() => {
  const m = new Map<string, string>()
  for (const section of sections) {
    for (const e of section.entries) m.set(e.slug, section.title)
  }
  return m
})

const searchResults = computed(() =>
  searchHits.value.map(h => ({
    slug: h.slug,
    title: h.title,
    snippet: h.snippet,
    section: slugToSection.value.get(h.slug) ?? '',
  })),
)

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

/** HTML-escape a snippet, then wrap occurrences of the query in <mark>. */
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
    const res = await $fetch<{ hits: SearchHit[] }>('/api/docs/search', {
      query: { q, locale: locale.value },
    })
    // Discard out-of-order responses so a slow request can't overwrite a
    // fresh one when the user types quickly.
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
  searchDebounceId = setTimeout(() => runSearch(q.trim()), 150)
})

function openSearch() {
  searchOpen.value = true
  nextTick(() => searchInputRef.value?.focus())
}

function selectSearchResult(s: string) {
  searchOpen.value = false
  searchQuery.value = ''
  navigateTo(`/documentation/${s}`)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    searchOpen.value = false
    searchQuery.value = ''
    return
  }
  if (e.key === 'Enter' && searchResults.value.length > 0) {
    selectSearchResult(searchResults.value[0]!.slug)
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    openSearch()
  }
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    openSearch()
  }
}

// ─── Locale dropdown ───────────────────────────────────────────────────────
const localeOpen = ref(false)
const localeTriggerRef = ref<HTMLElement | null>(null)

function toggleLocale() {
  localeOpen.value = !localeOpen.value
}

function closeLocale() { localeOpen.value = false }

async function selectLocale(code: string) {
  await setLocale(code as typeof locale.value)
  closeLocale()
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (localeTriggerRef.value && !localeTriggerRef.value.contains(target)) {
    const menu = document.getElementById('docs-locale-menu')
    if (!menu || !menu.contains(target)) closeLocale()
  }
  if (searchContainerRef.value && !searchContainerRef.value.contains(target)) {
    searchOpen.value = false
    searchInputRef.value?.blur()
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────
let scrollRoot: HTMLElement | null = null

function attachScrollListener() {
  scrollRoot?.removeEventListener('scroll', syncActiveHeading)
  scrollRoot = document.getElementById('docs-scroll')
  scrollRoot?.addEventListener('scroll', syncActiveHeading, { passive: true })
}

function refreshArticleRef() {
  articleEl = document.querySelector<HTMLElement>('article.docs-body')
}

onMounted(() => {
  attachScrollListener()
  refreshArticleRef()
  syncActiveHeading()
  document.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('click', onClickOutside)
  // Initial hash scroll (e.g. arrived from a deep link)
  if (route.hash) {
    nextTick(() => {
      const id = route.hash.replace(/^#/, '')
      if (id) jumpToHeading(id)
    })
  }
})

watch(slug, async () => {
  await nextTick()
  refreshArticleRef()
  // New page → scroll to top, recompute active heading.
  document.getElementById('docs-scroll')?.scrollTo({ top: 0 })
  syncActiveHeading()
})

onBeforeUnmount(() => {
  scrollRoot?.removeEventListener('scroll', syncActiveHeading)
  document.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <!-- Root bg is the sidebar's gray so any whitespace to the LEFT of the
       sidebar (created by the outer flex container's `mx-auto` centering on
       wide viewports and by `lg:px-6` padding) bleeds into the sidebar and
       reads as one continuous panel from the viewport edge. `main` and the
       right rail then override with explicit white. -->
  <div id="docs-scroll" class="flex h-dvh max-h-dvh min-h-0 flex-col overflow-y-auto bg-neutral-50">
    <!-- ─── Top bar ───────────────────────────────────────────────────────── -->
    <!-- `min-height` rather than `height` because the header is a flex child
         of `#docs-scroll`, and the default `flex-shrink: 1` was collapsing
         a fixed `height` back to content size. -->
    <header
      class="sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-neutral-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6"
      style="min-height: 64px;"
    >
      <!-- Left cluster -->
      <div class="flex items-center gap-3">
        <!-- Mobile sidebar toggle -->
        <button
          type="button"
          class="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-100 lg:hidden"
          aria-label="Open navigation"
          @click="mobileNavOpen = !mobileNavOpen"
        >
          <UIcon :name="mobileNavOpen ? 'i-heroicons-x-mark-20-solid' : 'i-heroicons-bars-3-20-solid'" class="size-5" />
        </button>

        <!-- Logo → home. `gap-2` on the flex container means the gap between
             the Polymux wordmark and the `/`, and the gap between `/` and
             "Docs", are both 8px and consistent. -->
        <NuxtLink
          to="/"
          class="inline-flex shrink-0 items-center gap-2"
          :aria-label="t('landing.nav.home')"
        >
          <InlineLogo size="lg" />
          <span class="hidden text-sm font-medium text-neutral-500 sm:inline">/</span>
          <span class="hidden text-sm font-medium text-neutral-500 sm:inline">Docs</span>
        </NuxtLink>
      </div>

      <!-- Search (centered column). Width is sized off `40vw` so it runs at
           ~40% of viewport on wide screens, with a max so it never gets
           absurd on ultrawide displays. -->
      <div ref="searchContainerRef" class="relative w-[40vw] max-w-2xl justify-self-center">
        <!-- Flex row: icon + input as siblings means the spacing on either
             side of the icon is governed by matching `px-*` (left of icon)
             and `gap-*` (right of icon) tokens, so both gaps stay equal. -->
        <label
          class="flex h-9 w-full items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-sm transition-colors focus-within:border-neutral-400 focus-within:bg-white"
        >
          <UIcon
            name="i-heroicons-magnifying-glass-20-solid"
            class="size-4 shrink-0 text-neutral-400"
            aria-hidden="true"
          />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            :placeholder="t('docs.searchPlaceholder')"
            class="min-w-0 flex-1 bg-transparent text-neutral-900 placeholder:text-neutral-400 outline-none"
            @focus="searchOpen = true"
            @keydown="onSearchKeydown"
          />
        </label>

        <!-- Search dropdown -->
        <div
          v-if="searchOpen && (searchQuery.trim().length > 0)"
          class="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          <ul v-if="searchResults.length > 0" class="max-h-96 overflow-y-auto py-1">
            <li v-for="r in searchResults" :key="r.slug">
              <button
                type="button"
                class="flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                @click="selectSearchResult(r.slug)"
              >
                <div class="flex w-full items-center justify-between gap-3">
                  <span class="text-sm font-medium text-neutral-900">{{ r.title }}</span>
                  <span class="shrink-0 text-xs text-neutral-500">{{ r.section }}</span>
                </div>
                <span
                  v-if="r.snippet"
                  class="line-clamp-2 text-xs leading-snug text-neutral-500"
                  v-html="highlightSnippet(r.snippet, searchQuery)"
                />
              </button>
            </li>
          </ul>
          <div
            v-else-if="searchLoading"
            class="px-3 py-4 text-sm text-neutral-500"
          >
            …
          </div>
          <div v-else class="px-3 py-4 text-sm text-neutral-500">
            {{ t('docs.searchEmpty') }}
          </div>
        </div>
      </div>

      <!-- Account / sign-in -->
      <div class="flex shrink-0 items-center gap-3 justify-self-end">
        <!-- Language picker — labelled button + chevron + dropdown -->
        <div ref="localeTriggerRef" class="relative">
          <!-- Height is an explicit pixel value so the project's custom
               `--spacing-8` (which is 3rem, not the default 2rem) doesn't
               make the button nearly as tall as the header. 32px leaves
               equal breathing room above and below inside the 56px header. -->
          <button
            type="button"
            class="inline-flex h-[32px] items-center gap-1 rounded-md px-2 text-sm text-neutral-700 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            :aria-label="t('landing.header.language')"
            aria-haspopup="menu"
            :aria-expanded="localeOpen"
            @click="toggleLocale"
          >
            <span>{{ currentLocaleLabel }}</span>
            <UIcon
              name="i-heroicons-chevron-down-20-solid"
              class="size-3.5 shrink-0 transition-transform"
              :class="localeOpen ? 'rotate-180' : ''"
              aria-hidden="true"
            />
          </button>

          <Transition
            enter-active-class="transition duration-100 ease-out"
            leave-active-class="transition duration-75 ease-in"
            enter-from-class="opacity-0 -translate-y-0.5"
            leave-to-class="opacity-0 -translate-y-0.5"
          >
            <!-- Dropdown is horizontally centered on the trigger button —
                 its midline lines up with the midline of "English ⌄" rather
                 than being anchored to one edge. -->
            <div
              v-if="localeOpen"
              id="docs-locale-menu"
              class="absolute left-1/2 top-full z-50 mt-2 max-h-72 -translate-x-1/2 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
              role="menu"
            >
              <button
                v-for="loc in availableLocales"
                :key="loc.code"
                type="button"
                role="menuitem"
                class="block w-full whitespace-nowrap px-3 py-1.5 text-left text-[13px] leading-tight outline-none transition-colors hover:bg-neutral-50"
                :class="locale === loc.code ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                @click="selectLocale(loc.code)"
              >
                {{ loc.label }}
              </button>
            </div>
          </Transition>
        </div>

        <!-- Sign-in CTA shown to signed-out users only; signed-in users see no
             account chip in the docs header (the dashboard is one click away
             from the logo's home link). -->
        <NuxtLink
          v-if="!user"
          to="/sign-in?redirect=/documentation"
          class="inline-flex h-9 items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {{ t('docs.signIn') }}
        </NuxtLink>
      </div>
    </header>

    <!-- ─── Body: sidebar | content | toc ─────────────────────────────────── -->
    <!-- Body flush to both viewport edges; the rail and sidebar each carry
         their own internal padding so the content sits comfortably. -->
    <div class="mx-auto flex w-full max-w-[1680px] flex-1">
      <!-- Left sidebar (desktop) -->
      <aside class="sticky top-[64px] hidden h-[calc(100dvh-64px)] w-60 shrink-0 overflow-y-auto border-r border-neutral-200/80 bg-neutral-50 py-6 lg:block xl:w-64">
        <nav class="flex flex-col gap-2 px-3">
          <div v-for="section in sections" :key="section.title">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 transition-colors hover:text-neutral-800"
              :aria-expanded="isSectionOpen(section.title)"
              @click="toggleSection(section.title)"
            >
              <span>{{ section.title }}</span>
              <UIcon
                name="i-heroicons-chevron-right-20-solid"
                class="size-3.5 transition-transform"
                :class="isSectionOpen(section.title) ? 'rotate-90' : ''"
                aria-hidden="true"
              />
            </button>
            <ul v-show="isSectionOpen(section.title)" class="mt-0.5 flex flex-col">
              <li v-for="e in section.entries" :key="e.slug">
                <NuxtLink
                  :to="`/documentation/${e.slug}`"
                  class="block rounded-md px-2 py-1 text-[13px] transition-colors"
                  :class="slug === e.slug
                    ? 'bg-neutral-200/70 font-medium text-neutral-950'
                    : 'text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-900'"
                >
                  {{ e.title }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- Mobile sidebar overlay -->
      <Transition
        enter-active-class="transition duration-150 ease-out"
        leave-active-class="transition duration-100 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="mobileNavOpen"
          class="fixed inset-0 top-[64px] z-30 bg-neutral-950/30 backdrop-blur-sm lg:hidden"
          @click="closeMobileNav"
        />
      </Transition>
      <Transition
        enter-active-class="transition duration-150 ease-out"
        leave-active-class="transition duration-100 ease-in"
        enter-from-class="-translate-x-full"
        leave-to-class="-translate-x-full"
      >
        <aside
          v-if="mobileNavOpen"
          class="fixed inset-y-0 top-[64px] left-0 z-30 w-72 overflow-y-auto border-r border-neutral-200 bg-neutral-50 py-6 lg:hidden"
        >
          <nav class="flex flex-col gap-2 px-3">
            <div v-for="section in sections" :key="section.title">
              <button
                type="button"
                class="flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 transition-colors hover:text-neutral-800"
                :aria-expanded="isSectionOpen(section.title)"
                @click="toggleSection(section.title)"
              >
                <span>{{ section.title }}</span>
                <UIcon
                  name="i-heroicons-chevron-right-20-solid"
                  class="size-3.5 transition-transform"
                  :class="isSectionOpen(section.title) ? 'rotate-90' : ''"
                  aria-hidden="true"
                />
              </button>
              <ul v-show="isSectionOpen(section.title)" class="mt-0.5 flex flex-col">
                <li v-for="e in section.entries" :key="e.slug">
                  <NuxtLink
                    :to="`/documentation/${e.slug}`"
                    class="block rounded-md px-2 py-1.5 text-sm transition-colors"
                    :class="slug === e.slug
                      ? 'bg-neutral-200/70 font-medium text-neutral-950'
                      : 'text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-900'"
                    @click="closeMobileNav"
                  >
                    {{ e.title }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
          </nav>
        </aside>
      </Transition>

      <!-- Center content -->
      <main class="min-w-0 flex-1 bg-white px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div class="mx-auto max-w-3xl">
          <div v-if="error" class="text-sm text-red-600">
            {{ t('docs.loadError') }}
            <button type="button" class="ml-2 underline" @click="refresh()">{{ t('docs.tryAgain') }}</button>
          </div>

          <article v-else class="docs-body" v-html="html" @click="onArticleClick" />

          <!-- Prev / Next -->
          <nav
            v-if="prev || next"
            class="mt-16 grid gap-3 border-t border-neutral-200 pt-8 sm:grid-cols-2"
          >
            <NuxtLink
              v-if="prev"
              :to="`/documentation/${prev.slug}`"
              class="group flex flex-col rounded-lg border border-neutral-200 px-4 py-3 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
            >
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-neutral-500">
                <UIcon name="i-heroicons-arrow-left-20-solid" class="size-3 shrink-0" aria-hidden="true" />
                {{ t('docs.previous') }}
              </span>
              <span class="mt-1 text-sm font-medium text-neutral-950">{{ prev.title }}</span>
            </NuxtLink>
            <span v-else />

            <NuxtLink
              v-if="next"
              :to="`/documentation/${next.slug}`"
              class="group flex flex-col items-end rounded-lg border border-neutral-200 px-4 py-3 text-right transition-colors hover:border-neutral-400 hover:bg-neutral-50 sm:col-start-2"
            >
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-neutral-500">
                {{ t('docs.next') }}
                <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3 shrink-0" aria-hidden="true" />
              </span>
              <span class="mt-1 text-sm font-medium text-neutral-950">{{ next.title }}</span>
            </NuxtLink>
          </nav>

          <!-- Footer mini-strip -->
          <footer class="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-6 text-xs text-neutral-500">
            <span>{{ t('landing.footer.allRightsReserved', { year: new Date().getFullYear() }) }}</span>
            <div class="flex items-center gap-4">
              <NuxtLink to="/contact" class="transition-colors hover:text-neutral-800">{{ t('docs.contact') }}</NuxtLink>
              <NuxtLink to="/forum" class="transition-colors hover:text-neutral-800">{{ t('landing.footer.forum') }}</NuxtLink>
              <NuxtLink to="/privacy-policy" class="transition-colors hover:text-neutral-800">{{ t('landing.footer.privacyPolicy') }}</NuxtLink>
            </div>
          </footer>
        </div>
      </main>

      <!-- Right rail: On this page. No left padding so the rail's content
           starts flush against the right edge of `main` — the visual gap
           from the article's right edge to the rail's content then equals
           `main`'s own right padding, mirroring the gap on `main`'s left.
           `padding-top: 70px` pushes the "ON THIS PAGE" header down so its
           vertical centre lines up with the centre of the article H1
           (56px main top-pad + 14px ≈ half the H1 line-box minus half the
           rail label's line-box). -->
      <aside
        class="sticky top-[64px] hidden h-[calc(100dvh-64px)] w-72 shrink-0 overflow-y-auto bg-white pb-10 pr-5 xl:block"
        style="padding-top: 74px;"
      >
        <div v-if="toc.length > 0">
          <h4 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-950">
            {{ t('docs.onThisPage') }}
          </h4>
          <!-- No vertical indicator line — the active section is conveyed
               purely through text colour + weight. h3 entries get extra
               left padding so the heading hierarchy is still visible. -->
          <ul class="mt-2 flex flex-col">
            <li v-for="item in toc" :key="item.id">
              <a
                :href="`#${item.id}`"
                class="block py-1.5 text-[13px] leading-snug transition-colors"
                :class="[
                  activeHeadingId === item.id
                    ? 'font-medium text-neutral-950'
                    : 'text-neutral-500 hover:text-neutral-900',
                  item.level === 3 ? 'pl-3' : 'pl-0',
                ]"
                @click="(e) => jumpToHeading(item.id, e)"
              >
                {{ item.text }}
              </a>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.docs-body :deep(h1) {
  font-family: ui-serif, Georgia, serif;
  font-size: 2.5rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-weight: 500;
  color: rgb(10 10 10);
  margin: 0 0 1rem;
}

.docs-body :deep(h2) {
  margin-top: 2.75rem;
  margin-bottom: 0.75rem;
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: rgb(10 10 10);
  scroll-margin-top: 5rem;
}

.docs-body :deep(h3) {
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.4;
  color: rgb(23 23 23);
  scroll-margin-top: 5rem;
}

.docs-body :deep(p) {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: rgb(38 38 38);
}

.docs-body :deep(ul),
.docs-body :deep(ol) {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.docs-body :deep(li) {
  margin-bottom: 0.375rem;
  font-size: 0.9375rem;
  line-height: 1.65;
  color: rgb(38 38 38);
}

.docs-body :deep(li > p) {
  display: inline;
  margin: 0;
}

.docs-body :deep(strong) {
  font-weight: 600;
  color: rgb(10 10 10);
}

.docs-body :deep(a) {
  color: rgb(10 10 10);
  text-decoration: underline;
  text-decoration-color: rgb(212 212 212);
  text-underline-offset: 2px;
  transition:
    color 150ms ease,
    text-decoration-color 150ms ease;
}

.docs-body :deep(a:hover) {
  color: rgb(58 58 58);
  text-decoration-color: rgb(115 115 115);
}

.docs-body :deep(hr) {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid rgb(229 229 229);
}

.docs-body :deep(table) {
  width: 100%;
  margin: 1rem 0 1.25rem;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.docs-body :deep(th),
.docs-body :deep(td) {
  border: 1px solid rgb(229 229 229);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  color: rgb(38 38 38);
}

.docs-body :deep(th) {
  font-weight: 600;
  background-color: rgb(250 250 250);
  color: rgb(10 10 10);
}

.docs-body :deep(td code) {
  font-size: 0.875em;
}

/* Inline `code` — kept as a subtle chip on the page background. */
.docs-body :deep(code) {
  font-size: 0.875em;
  padding: 0.125em 0.4em;
  border-radius: 0.25rem;
  background-color: rgb(243 243 243);
  color: rgb(23 23 23);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

/* Block-level code: mirror the chat surface's `.agent-codeblock` look so docs
   match the rest of the app. The renderer emits the same DOM structure, and
   these styles render it in the docs body. */
.docs-body :deep(.agent-codeblock) {
  position: relative;
  margin: 1rem 0 1.25rem;
  background: var(--color-surface-container-low, #f3f3f3);
  border: 1px solid var(--color-outline-variant, #c6c6c6);
  border-radius: 10px;
  color: var(--color-on-surface, #1a1c1c);
}
.docs-body :deep(.agent-codeblock:focus) {
  outline: none;
}
.docs-body :deep(.agent-codeblock:focus-visible) {
  outline: 2px solid rgba(26, 28, 28, 0.35);
  outline-offset: 1px;
}
.docs-body :deep(.agent-codeblock-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 0.7em 0 0.825em;
}
.docs-body :deep(.agent-codeblock-lang) {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 0.7em;
  line-height: 1;
  color: var(--color-secondary, #5e5e5e);
  text-transform: lowercase;
  letter-spacing: 0.02em;
  user-select: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.docs-body :deep(.agent-codeblock-scroll) {
  overflow-x: auto;
  border-radius: 0 0 10px 10px;
}
.docs-body :deep(.agent-codeblock pre) {
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0.5em 0.85em 0.8em;
}
.docs-body :deep(.agent-codeblock pre code) {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--color-on-surface, #1a1c1c);
  font-family: 'JetBrainsMono Nerd Font', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
  font-size: 0.875em;
  line-height: 1.55;
}

/* Copy button — bare icon that reveals on hover, with a dark tooltip
   toggling between Copy and Copied. */
.docs-body :deep(.agent-codeblock-copy) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15em;
  background: none;
  border: none;
  color: var(--color-secondary, #5e5e5e);
  cursor: pointer;
  font: inherit;
  opacity: 0;
  transition: opacity 150ms ease, color 150ms ease;
}
.docs-body :deep(.agent-codeblock:hover .agent-codeblock-copy),
.docs-body :deep(.agent-codeblock:focus-within .agent-codeblock-copy) {
  opacity: 1;
}
.docs-body :deep(.agent-codeblock-copy:hover) {
  color: var(--color-on-surface, #1a1c1c);
}
.docs-body :deep(.agent-codeblock-copy:focus-visible) {
  outline: 2px solid rgba(26, 28, 28, 0.35);
  outline-offset: 1px;
  opacity: 1;
}
.docs-body :deep(.agent-codeblock-copy svg) {
  width: 1.15em;
  height: 1.15em;
  display: block;
}
.docs-body :deep(.agent-codeblock-copy-icon--copied) {
  display: none;
  color: #16a34a;
}
.docs-body :deep(.agent-codeblock-copy.is-copied .agent-codeblock-copy-icon--copy) {
  display: none;
}
.docs-body :deep(.agent-codeblock-copy.is-copied .agent-codeblock-copy-icon--copied) {
  display: inline-flex;
}
.docs-body :deep(.agent-codeblock-tooltip) {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  padding: 0.3em 0.55em;
  background: var(--color-primary, #000000);
  color: var(--color-on-primary, #ffffff);
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 0.7em;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  border-radius: 4px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 120ms ease, transform 120ms ease;
}
.docs-body :deep(.agent-codeblock-copy:hover .agent-codeblock-tooltip),
.docs-body :deep(.agent-codeblock-copy:focus-visible .agent-codeblock-tooltip) {
  opacity: 1;
  transform: translateY(0);
}
.docs-body :deep(.agent-codeblock-tooltip-label--copied) {
  display: none;
}
.docs-body :deep(.agent-codeblock-copy.is-copied .agent-codeblock-tooltip-label--copy) {
  display: none;
}
.docs-body :deep(.agent-codeblock-copy.is-copied .agent-codeblock-tooltip-label--copied) {
  display: inline;
}

.docs-body :deep(blockquote) {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid rgb(229 229 229);
  color: rgb(82 82 82);
  font-size: 0.9375rem;
}

.docs-body :deep(input[type='checkbox']) {
  margin-right: 0.5em;
  vertical-align: middle;
}
</style>
