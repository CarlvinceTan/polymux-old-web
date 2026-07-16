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
   * Custom (user-installed layout) tabs. Rendered after built-ins, to the right
   * of a separator, and drag-reorderable. Built-in tabs stay in their order.
   */
  customTabs?: CustomTabProp[]
  /** Route path before which a vertical divider is shown (pathname-only match). */
  separatorBeforePath?: string
  /** When true, labels are shown as-is (already translated). When false, title-cased. */
  rawTabLabels?: boolean
}

const props = defineProps<Props>()
const route = useRoute()
const { t } = useI18n()
const { isCollapsed: isSidebarCollapsed } = useSidebar()

defineSlots<{
  /** Trailing actions on the right of the sub-nav (page-specific controls). */
  actions?: () => unknown
}>()

/** Title-case each word so labels look consistent whatever the prop keys look like. */
function formatTabLabel(raw: string) {
  return raw
    .trim()
    .split(/\s+/)
    .map(word => (word.length ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
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
  if (q === -1) return normalizePath(pathWithOptionalQuery)
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
      if (!best || r.length > best.len) best = { label, len: r.length }
    }
  }
  return best?.label ?? null
})

const activeCustomId = computed(() => {
  const path = normalizePath(route.path)
  for (const tab of props.customTabs ?? []) {
    const r = tabPathOnly(tab.to)
    if (path === r || path.startsWith(`${r}/`)) return tab.id
  }
  return null
})

function isActive(label: string) {
  return activeLabel.value === label
}

/**
 * The plugin/publishing docs link rides along the whole Publish section — the
 * hub (`/integrations/publish`) plus the new/[id] flows. Elsewhere the sub-nav
 * shows only its tabs (notifications now live in the Sidebar).
 */
const showPublishDocs = computed(() => {
  const p = normalizePath(route.path)
  return p === '/integrations/publish' || p.startsWith('/integrations/publish/')
})

function displayTabLabel(label: string) {
  return props.rawTabLabels ? label : formatTabLabel(label)
}

/** Stable test ids for demo recordings and e2e (e.g. vault-settings-tab). */
function tabTestId(routePath: string): string | undefined {
  const segments = tabPathOnly(routePath).split('/').filter(Boolean)
  if (segments.length >= 2) return `${segments[0]}-${segments[1]}-tab`
  return undefined
}

const hasBuiltInTabs = computed(() => Object.keys(props.tabs).length > 0)

// Drag-reorder is opt-in: only call the reorder API when the section can be
// inferred from a custom tab's `to` path.
const inferredSection = computed(() => {
  for (const tab of props.customTabs ?? []) {
    const s = sectionFromPath(tab.to)
    if (s) return s
  }
  return null
})

// Local mirror of the customs prop that v-draggable mutates in place.
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
  onMove: (evt: { related?: HTMLElement | null }) => {
    if (evt.related?.dataset?.customBoundary === 'true') return false
    return true
  },
  onEnd: async () => {
    const fn = reorderFn.value
    if (!fn) return
    await fn(customsMutable.value.map(tab => tab.id))
  },
}

// Quiet ghost-pill styling, shared by built-in and custom tabs.
const pillBase
  = 'relative rounded-lg px-[11px] py-[5px] text-[13.5px] leading-none transition-colors'
function pillClass(active: boolean) {
  return active
    ? 'bg-neutral-100 font-semibold text-neutral-950'
    : 'font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
}
</script>

<template>
  <!-- Breaks out of the page wrapper's `px-4 pt-2` so the bottom divider spans
       the full content-card width and the bar sits flush to the card top, while
       the tabs stay aligned with the content's left edge (re-added `px-4`). -->
  <div class="-mx-4 -mt-2 shrink-0">
    <div
      class="flex items-center justify-between gap-4 px-4 pb-2.5 pt-2"
      :class="{ 'lg:pl-11': isSidebarCollapsed }"
    >
      <nav class="flex min-w-0 items-center gap-[3px]">
        <template v-for="(routePath, label) in tabs" :key="label">
          <div
            v-if="separatorBeforePath && tabPathOnly(routePath) === tabPathOnly(separatorBeforePath)"
            class="mx-1 h-4 w-px shrink-0 bg-neutral-200"
            aria-hidden="true"
          />
          <NuxtLink
            :to="tabLinkTarget(routePath)"
            :data-testid="tabTestId(routePath)"
            :class="[pillBase, pillClass(isActive(label))]"
          >
            {{ displayTabLabel(label) }}
          </NuxtLink>
        </template>

        <!-- Marker between built-ins and customs; sits OUTSIDE the draggable
             container so drags can't displace it. -->
        <div
          v-if="customsMutable.length && hasBuiltInTabs"
          class="mx-1 h-4 w-px shrink-0 bg-neutral-200"
          aria-hidden="true"
          data-custom-boundary="true"
        />
        <div
          v-if="customsMutable.length"
          v-draggable="[customsMutable, draggableOptions]"
          class="flex items-center gap-[3px]"
        >
          <NuxtLink
            v-for="tab in customsMutable"
            :key="tab.id"
            :data-custom-tab-id="tab.id"
            :to="tabLinkTarget(tab.to)"
            :class="[pillBase, pillClass(activeCustomId === tab.id)]"
          >
            {{ tab.label }}
          </NuxtLink>
        </div>
      </nav>

      <div class="flex shrink-0 items-center gap-2">
        <!-- Plain <a> so it behaves as a native link (new-tab / cmd-click). -->
        <a
          v-if="showPublishDocs"
          href="/documentation/plugin-overview"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('integrations.editorDocs')"
          class="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-950"
        >
          {{ t('integrations.editorDocs') }}
          <UIcon name="i-heroicons-arrow-up-right-20-solid" class="size-3.5" />
        </a>
        <slot name="actions" />
      </div>
    </div>
    <div class="h-px w-full bg-neutral-200" aria-hidden="true" />
  </div>
</template>
