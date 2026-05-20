<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { vDraggable } from 'vue-draggable-plus'
import { sectionFromPath, useCustomTabs } from '~/composables/integrations/useCustomTabs'

interface CustomTabProp {
  /** workspace_integrations.id — used as a stable key for drag-reorder. */
  id: string
  /** Display label on the tab. */
  label: string
  /** Path the tab links to. */
  to: string
}

interface Props {
  /** Display label → route path (optional `?query` allowed; compared pathname-only for active tab). */
  tabs: Record<string, string>
  /**
   * Custom (user-installed layout) tabs. Rendered after built-ins, always to
   * the right of the separator. These carry an `id` so they can be reordered
   * via drag-and-drop. Built-in tabs stay locked in their original order.
   */
  customTabs?: CustomTabProp[]
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

/** Active built-in tab: longest matching route prefix (exact or `path + '/'`). */
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

const activeCustomId = computed(() => {
  const path = normalizePath(route.path)
  for (const t of props.customTabs ?? []) {
    const r = tabPathOnly(t.to)
    if (path === r || path.startsWith(`${r}/`)) return t.id
  }
  return null
})

function isActive(label: string) {
  return activeLabel.value === label
}

function displayTabLabel(label: string) {
  return props.rawTabLabels ? label : formatTabLabel(label)
}

// Drag-reorder is opt-in: we only call the reorder API when the section can
// be inferred from one of the custom tabs' `to` paths. If a consumer passes
// custom tabs that don't match a known prefix (e.g. an experimental section
// not yet registered), drags are no-ops.
const inferredSection = computed(() => {
  for (const t of props.customTabs ?? []) {
    const s = sectionFromPath(t.to)
    if (s) return s
  }
  return null
})

// Local mirror of the customs prop that v-draggable mutates in place; the
// reorder action persists, and `connections` refresh re-syncs from server.
const customsMutable = ref<CustomTabProp[]>([])
watch(
  () => props.customTabs,
  (next) => {
    customsMutable.value = [...(next ?? [])]
  },
  { immediate: true, deep: true },
)

const reorderFn = computed(() => {
  const section = inferredSection.value
  if (!section) return null
  return useCustomTabs(section).reorder
})

const draggableOptions = {
  animation: 180,
  direction: 'horizontal' as const,
  // Block any drop that would land before the data-custom-boundary marker;
  // built-in tabs aren't even in this draggable container so this is mostly
  // defensive against the marker being mistakenly included as a sibling.
  onMove: (evt: { related?: HTMLElement | null }) => {
    if (evt.related?.dataset?.customBoundary === 'true') return false
    return true
  },
  onEnd: async () => {
    const fn = reorderFn.value
    if (!fn) return
    const ids = customsMutable.value.map(t => t.id)
    await fn(ids)
  },
}
</script>

<template>
  <!-- Full width within the main column (same inset as page padding from parent) -->
  <div class="flex h-14 w-full min-w-0 items-center justify-between px-3 sm:px-4">
    <div class="flex min-w-0 items-center gap-10">
      <button
        type="button"
        class="inline-flex shrink-0 -translate-y-px cursor-pointer items-center border-0 bg-transparent p-0 outline-none"
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
            class="relative py-1 text-sm font-semibold tracking-tight transition-colors sm:text-base"
            :class="
              isActive(label)
                ? 'text-neutral-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                : 'text-neutral-400 hover:text-neutral-600'
            "
          >
            {{ displayTabLabel(label) }}
          </NuxtLink>
        </template>
        <!-- Marker between built-ins and customs. Sits OUTSIDE the
             draggable container so drags can't displace it. -->
        <div
          v-if="customsMutable.length"
          class="h-4 w-[2px] shrink-0 -translate-y-px rounded-full bg-neutral-300/70"
          aria-hidden="true"
          data-custom-boundary="true"
        />
        <div
          v-if="customsMutable.length"
          v-draggable="[customsMutable, draggableOptions]"
          class="flex items-center gap-4"
        >
          <NuxtLink
            v-for="t in customsMutable"
            :key="t.id"
            :data-custom-tab-id="t.id"
            :to="tabLinkTarget(t.to)"
            class="ph-custom-tab relative py-1 text-sm font-semibold tracking-tight transition-colors sm:text-base"
            :class="
              activeCustomId === t.id
                ? 'text-neutral-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                : 'text-neutral-400 hover:text-neutral-600'
            "
          >
            {{ t.label }}
          </NuxtLink>
        </div>
      </nav>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <NotificationsInbox />
    </div>
  </div>
</template>
