// Reactive wrapper around PostHog's flag state. Every gated UI in the app
// (FeatureGate component, account-access middleware) reads through this
// composable so a future swap to a different flag backend touches one file.
//
// Behaviour:
// - `ready`: feature flags have finished resolving for this session, or PostHog
//   is not configured (fail-open). Middleware and FeatureGate use this to avoid
//   acting on stale "unknown" state.
// - isEnabled(key) defaults to `true` until PostHog has reported a flag list,
//   to avoid a flash-of-unauthorized inside callers that ignore `ready`.
// - When `posthog-js` is not initialised (POSTHOG_PUBLIC_KEY missing), every
//   flag resolves enabled — dev environments aren't gated.
// - isExtensionModeGloballyAllowed() matches the API's PostHog snapshot for
//   `extension_mode`: off until flags are ready when PostHog is configured,
//   unknown/false ⇒ off, no PostHog public key ⇒ on (fail-open for local dev).

//
// Server-only keys: the polymux binary evaluates PostHog flags such as
// `plan_limits` (upstream RPM) and `extension_mode` without using this module.

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

  const ready = computed(() => {
    if (!import.meta.client) return true
    const nuxtApp = useNuxtApp()
    const ph = (nuxtApp.$posthog ?? null) as
      | { isFeatureEnabled?: (k: string) => boolean | undefined }
      | null
    if (!ph || typeof ph.isFeatureEnabled !== 'function') return true
    return state.value.ready
  })

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

  function isExtensionModeGloballyAllowed(): boolean {
    if (!import.meta.client) return true
    const nuxtApp = useNuxtApp()
    const ph = (nuxtApp.$posthog ?? null) as
      | { isFeatureEnabled?: (k: string) => boolean | undefined }
      | null
    if (!ph || typeof ph.isFeatureEnabled !== 'function') {
      return true
    }
    if (!state.value.ready) return false
    return ph.isFeatureEnabled('extension_mode') === true
  }

  return { ready, isEnabled, refresh, isExtensionModeGloballyAllowed }
}
