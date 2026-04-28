<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface Props {
  /** Display label → route path (optional `?query` allowed; compared pathname-only for active tab). */
  tabs: Record<string, string>
  /**
   * Route path (pathname only, optional `?query` stripped) before which a vertical divider is shown.
   * Use when tab labels come from i18n so divider position is stable across locales.
   */
  separatorBeforePath?: string
  /**
   * When true, tab labels are shown as-is (e.g. translated). When false, labels are title-cased for English-style keys.
   */
  rawTabLabels?: boolean
}

const props = defineProps<Props>()
const route = useRoute()
const { t } = useI18n()
const { toggle: toggleSidePanel } = useSidePanel()

/** Title-case each word so labels look consistent whatever the prop keys look like. */
function formatTabLabel(raw: string) {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '',
    )
    .filter(Boolean)
    .join(' ')
}

function normalizePath(p: string) {
  return p.replace(/\/$/, '') || '/'
}

/** Pathname only — `route.path` has no query, so tab strings must be stripped too for matching. */
function tabPathOnly(pathWithOptionalQuery: string) {
  const head = pathWithOptionalQuery.split(/[?#]/)[0] ?? ''
  return normalizePath(head)
}

function tabLinkTarget(pathWithOptionalQuery: string): RouteLocationRaw {
  const q = pathWithOptionalQuery.indexOf('?')
  if (q === -1) {
    return normalizePath(pathWithOptionalQuery)
  }
  const path = normalizePath(pathWithOptionalQuery.slice(0, q))
  const query: Record<string, string> = {}
  new URLSearchParams(pathWithOptionalQuery.slice(q + 1).split('#')[0]).forEach((value, key) => {
    query[key] = value
  })
  return { path, query }
}

/** Which tab label is active: longest matching route prefix (exact or `path + '/'`). */
const activeLabel = computed(() => {
  const path = normalizePath(route.path)
  let best: { label: string; len: number } | null = null
  for (const [label, routePath] of Object.entries(props.tabs)) {
    const r = tabPathOnly(routePath)
    if (path === r || path.startsWith(`${r}/`)) {
      if (!best || r.length > best.len) {
        best = { label, len: r.length }
      }
    }
  }
  return best?.label ?? null
})

function isActive(label: string) {
  return activeLabel.value === label
}

function displayTabLabel(label: string) {
  return props.rawTabLabels ? label : formatTabLabel(label)
}
</script>

<template>
  <!-- Full width within the main column (same inset as page padding from parent) -->
  <div class="flex h-14 w-full min-w-0 items-center justify-between px-3 sm:px-4">
    <div class="flex min-w-0 items-center gap-10">
      <button
        type="button"
        class="shrink-0 -translate-y-px cursor-pointer border-0 bg-transparent p-0 outline-none"
        :aria-label="t('nav.toggleSidebar')"
        @click="toggleSidePanel"
      >
        <InlineLogo size="xl" />
      </button>
      <nav class="flex items-center gap-4">
        <template v-for="(routePath, label) in tabs" :key="label">
          <div
            v-if="separatorBeforePath && tabPathOnly(routePath) === tabPathOnly(separatorBeforePath)"
            class="h-4 w-[2px] shrink-0 -translate-y-px rounded-full bg-neutral-400/60"
            aria-hidden="true"
          />
          <NuxtLink
            :to="tabLinkTarget(routePath)"
            class="relative pb-1 text-sm font-semibold tracking-tight transition-colors sm:text-base"
            :class="
              isActive(label)
                ? 'text-neutral-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                : 'text-neutral-400 hover:text-neutral-600'
            "
          >
            {{ displayTabLabel(label) }}
          </NuxtLink>
        </template>
      </nav>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <NotificationsInbox />
    </div>
  </div>
</template>
