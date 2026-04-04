<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface Props {
  /** Display label → route path (optional `?query` allowed; compared pathname-only for active tab). */
  tabs: Record<string, string>
}

const props = defineProps<Props>()
const route = useRoute()

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
</script>

<template>
  <!-- Full width within the main column (same inset as page padding from parent) -->
  <div class="flex h-14 w-full min-w-0 items-center px-3 sm:px-4">
    <div class="flex items-baseline gap-10">
      <h1 class="text-lg font-bold tracking-tight text-neutral-950 sm:text-xl sm:font-bold">
        Archetype
      </h1>
      <nav class="flex items-center gap-4">
        <NuxtLink
          v-for="(routePath, label) in tabs"
          :key="label"
          :to="tabLinkTarget(routePath)"
          class="relative pb-1 text-sm font-semibold tracking-tight transition-colors sm:text-base"
          :class="
            isActive(label)
              ? 'text-neutral-950 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-neutral-950'
              : 'text-neutral-400 hover:text-neutral-600'
          "
        >
          {{ formatTabLabel(label) }}
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
