// Reactive wrapper around PostHog's flag state. Every gated UI in the app
// (FeatureGate component, account-access middleware) reads through this
// composable so a future swap to a different flag backend touches one file.
//
// Behaviour:
// - isEnabled(key) defaults to `true` until PostHog has reported a flag list,
//   to avoid a flash-of-unauthorized state on first paint.
// - When `posthog-js` is not initialised (POSTHOG_PUBLIC_KEY missing), every
//   flag resolves enabled — dev environments aren't gated.
// - The plugin dispatches `posthog:flags-changed` on the window when PostHog
//   recomputes flags; this composable listens to that and refreshes its
//   reactive snapshot.

import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

type FlagState = {
  ready: boolean
  enabled: Record<string, boolean>
}

const state = ref<FlagState>({ ready: false, enabled: {} })

function readSnapshot(): FlagState {
  if (!import.meta.client) return state.value
  const nuxtApp = useNuxtApp()
  const snap = (nuxtApp.payload as Record<string, unknown>).__posthogFlags as FlagState | undefined
  return snap ?? state.value
}

function syncFromWindow() {
  state.value = readSnapshot()
}

let listenerAttached = false
function ensureListener() {
  if (!import.meta.client || listenerAttached) return
  window.addEventListener('posthog:flags-changed', syncFromWindow)
  listenerAttached = true
  syncFromWindow()
}

export function useMeFeatures() {
  if (import.meta.client) {
    // Global route middlewares call this composable outside any component
    // setup, where Vue's lifecycle hooks have nothing to bind to. Attach the
    // listener directly in that path; component callers still get the usual
    // mount/unmount wiring. ensureListener is idempotent.
    if (getCurrentInstance()) {
      onMounted(() => ensureListener())
      onBeforeUnmount(() => {})
    } else {
      ensureListener()
    }
    syncFromWindow()
  }

  const ready = computed(() => state.value.ready)

  function isEnabled(key: string): boolean {
    if (!import.meta.client) return true
    const nuxtApp = useNuxtApp()
    const ph = (nuxtApp.$posthog ?? null) as
      | { isFeatureEnabled?: (k: string) => boolean | undefined }
      | null
    if (!ph || typeof ph.isFeatureEnabled !== 'function') {
      // PostHog disabled (no public key). Fail open.
      return true
    }
    if (!state.value.ready) return true
    const v = ph.isFeatureEnabled(key)
    if (v === undefined) return true
    return Boolean(v)
  }

  async function refresh() {
    const nuxtApp = useNuxtApp()
    const ph = (nuxtApp.$posthog ?? null) as
      | { reloadFeatureFlags?: () => void }
      | null
    if (ph?.reloadFeatureFlags) {
      ph.reloadFeatureFlags()
    }
  }

  return { ready, isEnabled, refresh }
}
