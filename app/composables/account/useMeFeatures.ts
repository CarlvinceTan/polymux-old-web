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
// - resolveFeatureFlag(key) applies per-flag policy (see STRICT_OPT_IN).
//   Opt-in flags match Go IsEnabledStrict(..., false): off while loading,
//   off when PostHog omits a disabled key from the client payload.
//   Fail-open flags match Go IsEnabled / planLimitsEnforce: on while loading
//   and when the key is absent.
// - When `posthog-js` is not initialised (POSTHOG_PUBLIC_KEY missing), every
//   flag resolves enabled — dev environments aren't gated.
//
// Server-only keys: the polymux binary evaluates PostHog flags such as
// `plan_limits` (upstream RPM) and `extension_mode` without using this module.

import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

type FlagState = {
  ready: boolean
  enabled: Record<string, boolean>
}

// Must stay aligned with model/featureflag.go strict opt-in keys.
const STRICT_OPT_IN = new Set([
  'wallet',
  'extension_mode',
])

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

function getPostHogClient() {
  if (!import.meta.client) return null
  const ph = (useNuxtApp().$posthog ?? null) as
    | { isFeatureEnabled?: (k: string) => boolean | undefined }
    | null
  if (!ph || typeof ph.isFeatureEnabled !== 'function') return null
  return ph
}

function isStrictOptIn(key: string): boolean {
  return STRICT_OPT_IN.has(key)
}

function resolveFeatureFlag(key: string): boolean {
  if (!import.meta.client) {
    return isStrictOptIn(key) ? false : true
  }

  const ph = getPostHogClient()
  if (!ph) {
    // PostHog disabled (no public key). Fail open.
    return true
  }

  const strict = isStrictOptIn(key)
  if (!state.value.ready) {
    return strict ? false : true
  }

  const v = ph.isFeatureEnabled(key)
  if (v === undefined) {
    return strict ? false : true
  }
  return Boolean(v)
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
    if (!getPostHogClient()) return true
    return state.value.ready
  })

  const posthogConfigured = computed(() => !!getPostHogClient())

  function isEnabled(key: string): boolean {
    return resolveFeatureFlag(key)
  }

  /** @deprecated Use isEnabled — kept for callers that referenced the strict helper directly. */
  function isEnabledStrict(key: string, absentResult: boolean): boolean {
    if (!import.meta.client) return absentResult
    const ph = getPostHogClient()
    if (!ph) return absentResult ? false : true
    if (!state.value.ready) return absentResult
    const v = ph.isFeatureEnabled(key)
    if (v === undefined) return absentResult
    return Boolean(v)
  }

  function isWalletEnabled(): boolean {
    return resolveFeatureFlag('wallet')
  }

  function isExtensionModeGloballyAllowed(): boolean {
    return resolveFeatureFlag('extension_mode')
  }

  function isPlanLimitsEnforced(): boolean {
    return resolveFeatureFlag('plan_limits')
  }

  function hasAccountAccess(): boolean {
    return resolveFeatureFlag('account_access')
  }

  async function refresh() {
    const ph = getPostHogClient() as { reloadFeatureFlags?: () => void } | null
    if (ph?.reloadFeatureFlags) {
      ph.reloadFeatureFlags()
    }
  }

  return {
    ready,
    posthogConfigured,
    isEnabled,
    isEnabledStrict,
    isWalletEnabled,
    isExtensionModeGloballyAllowed,
    isPlanLimitsEnforced,
    hasAccountAccess,
    refresh,
  }
}
