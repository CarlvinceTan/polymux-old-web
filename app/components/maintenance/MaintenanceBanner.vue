<script setup lang="ts">
// Sticky push-down maintenance banner.
//
// Two visible states:
//   * `scheduled` — amber background. Operator scheduled downtime within 72h.
//     Dismissable per-browser via localStorage so the user can hide it after
//     they've read it.
//   * `active` — red background. Maintenance is in progress. Non-dismissable
//     by design — hiding "service may be unavailable right now" while the user
//     is hitting failures would be hostile.
//
// The composable's RLS-bounded subscription guarantees the banner only mounts
// when there's a real window in the 72h envelope, so this component never
// needs to gate on time itself.

import { ref, computed, watch } from 'vue'

const { t, locale } = useI18n()
const { window: maintenanceWindow, state } = useActiveMaintenance()

const dismissedId = ref<string | null>(null)

function dismissedKey(id: string) {
  return `maintenance_dismissed_${id}`
}

function hydrateDismissed(id: string | null | undefined) {
  if (!import.meta.client || !id) {
    dismissedId.value = null
    return
  }
  try {
    if (localStorage.getItem(dismissedKey(id)) === '1') {
      dismissedId.value = id
    } else {
      dismissedId.value = null
    }
  } catch {
    dismissedId.value = null
  }
}

watch(maintenanceWindow, (w) => {
  hydrateDismissed(w?.id)
}, { immediate: true })

const showBanner = computed(() => {
  const w = maintenanceWindow.value
  if (!w) return false
  if (state.value === 'none') return false
  if (state.value === 'active') return true // non-dismissable
  return dismissedId.value !== w.id
})

const isActive = computed(() => state.value === 'active')

const startsFmt = computed(() => {
  const w = maintenanceWindow.value
  if (!w) return ''
  return formatDateTime(w.starts_at, locale.value)
})

const endsFmt = computed(() => {
  const w = maintenanceWindow.value
  if (!w) return ''
  return formatDateTime(w.ends_at, locale.value)
})

function formatDateTime(iso: string, lc: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(lc, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

const bannerText = computed(() => {
  const w = maintenanceWindow.value
  if (!w) return ''
  if (isActive.value) {
    return t('maintenance.bannerActive', {
      title: w.title,
      endsAt: endsFmt.value,
    })
  }
  return t('maintenance.bannerScheduled', {
    title: w.title,
    startsAt: startsFmt.value,
    endsAt: endsFmt.value,
  })
})

function dismiss() {
  const w = maintenanceWindow.value
  if (!w) return
  if (isActive.value) return // shouldn't be reachable; defence in depth
  try {
    localStorage.setItem(dismissedKey(w.id), '1')
  } catch {
    // localStorage disabled (private mode, etc.) — fall back to session-only.
  }
  dismissedId.value = w.id
}
</script>

<template>
  <ClientOnly>
    <div
      v-if="showBanner"
      class="flex w-full shrink-0 items-center gap-3 px-4 py-2 text-sm"
      :class="isActive
        ? 'bg-red-600 text-white'
        : 'bg-amber-50 text-amber-900 border-b border-amber-200'"
      role="alert"
      :aria-live="isActive ? 'assertive' : 'polite'"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4 shrink-0"
        aria-hidden="true"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span class="min-w-0 flex-1 truncate font-medium">{{ bannerText }}</span>
      <button
        v-if="!isActive"
        type="button"
        class="ml-auto inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-transparent px-2 text-xs font-medium outline-none transition-colors hover:bg-amber-100/80"
        @click="dismiss"
      >
        {{ t('maintenance.bannerDismiss') }}
      </button>
    </div>
  </ClientOnly>
</template>
