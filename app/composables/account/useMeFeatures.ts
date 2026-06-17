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
import { resolveFeatureFlagValue, STRICT_OPT_IN_FLAGS } from '~/utils/featureFlagResolve'
import { readCachedFeatureFlag } from '~/utils/uiPolicyCache'

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

function getPostHogClient(): { isFeatureEnabled: (k: string) => boolean | undefined } | null {
  if (!import.meta.client) return null
  const ph = (useNuxtApp().$posthog ?? null) as
    | { isFeatureEnabled?: (k: string) => boolean | undefined }
    | null
  if (!ph || typeof ph.isFeatureEnabled !== 'function') return null
  return ph as { isFeatureEnabled: (k: string) => boolean | undefined }
}

function isStrictOptIn(key: string): boolean {
  return STRICT_OPT_IN_FLAGS.has(key)
}

function resolveFeatureFlag(key: string): boolean {
  if (!import.meta.client) {
    return isStrictOptIn(key) ? false : true
  }

  const ph = getPostHogClient()
  return resolveFeatureFlagValue(ph, key, state.value.ready, !ph)
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

  function isWalletEnabled(): boolean {
    return resolveFeatureFlag('wallet')
  }

  function isExtensionModeGloballyAllowed(): boolean {
    return resolveFeatureFlag('chrome_extension')
  }

  function isPlanLimitsEnforced(): boolean {
    if (import.meta.client && !state.value.ready) {
      const cached = readCachedFeatureFlag('plan_limits')
      if (cached !== null) return cached
    }
    return resolveFeatureFlag('plan_limits')
  }

  function hasAccountAccess(): boolean {
    if (import.meta.client && !state.value.ready) {
      const cached = readCachedFeatureFlag('account_access')
      if (cached !== null) return cached
    }
    return resolveFeatureFlag('account_access')
  }

  return {
    ready,
    posthogConfigured,
    isEnabled,
    isWalletEnabled,
    isExtensionModeGloballyAllowed,
    isPlanLimitsEnforced,
    hasAccountAccess,
  }
}
