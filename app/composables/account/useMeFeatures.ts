// Reactive wrapper around PostHog's flag state. Every gated UI in the app
// (FeatureGate component, account-access middleware) reads through this
// composable so a future swap to a different flag backend touches one file.
//
// Behaviour:
// - `ready`: a live /decide response has been seen for this session (not the
//   localStorage cache fire), or PostHog is not configured (fail-open).
//   Middleware and FeatureGate use this to avoid acting on stale "unknown"
//   state. The posthog.client plugin gates this on the featureFlagsReloading
//   → onFeatureFlags handshake so a flag toggled off in PostHog doesn't read
//   as enabled from cache on the next page load.
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

  // Opt-in flags (wallet, extension_mode) must match the Go server's
  // IsEnabledStrict semantics: absent/unknown ⇒ off once PostHog is wired.
  // Generic isEnabled() fail-opens undefined keys to true, which breaks
  // wallet when PostHog omits disabled keys from the client payload.
  function isEnabledStrict(key: string, absentResult: boolean): boolean {
    if (!import.meta.client) return absentResult
    const nuxtApp = useNuxtApp()
    const ph = (nuxtApp.$posthog ?? null) as
      | { isFeatureEnabled?: (k: string) => boolean | undefined }
      | null
    if (!ph || typeof ph.isFeatureEnabled !== 'function') {
      // No PostHog public key — dev fail-open for opt-in features.
      return absentResult ? false : true
    }
    if (!state.value.ready) return absentResult
    const v = ph.isFeatureEnabled(key)
    if (v === undefined) return absentResult
    return Boolean(v)
  }

  function isWalletEnabled(): boolean {
    return isEnabledStrict('wallet', false)
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
    return isEnabledStrict('extension_mode', false)
  }

  return { ready, isEnabled, isEnabledStrict, isWalletEnabled, refresh, isExtensionModeGloballyAllowed }
}
