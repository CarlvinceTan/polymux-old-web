// Initialises PostHog for feature-flag evaluation and product analytics.
// Identifies the current Supabase user (and re-identifies on auth state
// changes) so flag targeting rules that filter on `email` resolve correctly.
// Tracing headers (X-POSTHOG-SESSION-ID, X-POSTHOG-DISTINCT-ID) are
// automatically added to requests to polymux.com and localhost so server
// routes can correlate client and server events.
//
// When POSTHOG_PUBLIC_KEY is empty the plugin is a no-op; useMeFeatures will
// then resolve every flag as enabled (fail-open) so dev environments without
// a PostHog project don't gate every page behind a placeholder.

import posthog from 'posthog-js'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const publicKey = config.public.posthogPublicKey as string | undefined
  const host = config.public.posthogHost as string | undefined

  if (!publicKey) {
    return {
      provide: {
        posthog: null as typeof posthog | null,
      },
    }
  }

  posthog.init(publicKey, {
    api_host: host || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
    __add_tracing_headers: ['localhost', 'polymux.com'],
    loaded: (ph) => {
      // Bridge PostHog's flag callbacks into the useMeFeatures state. We
      // can't import the composable at module load (circular), so we stash
      // the latest snapshot on the Nuxt app and let useMeFeatures pick it
      // up reactively.
      //
      // `ready` only flips true once a live /decide response has been seen
      // (not the immediate cache fire). Without this gate, a flag toggled
      // off in PostHog would still read as enabled from localStorage on the
      // next page load until posthog-js refreshes, causing fail-closed
      // checks (e.g. isExtensionModeGloballyAllowed) to wrongly pass and
      // fire requests that the server then 403s.
      let reloadInFlight = false
      let freshSeen = false

      ph.on('featureFlagsReloading', () => {
        reloadInFlight = true
      })

      ph.onFeatureFlags((flags, payloads) => {
        // A callback that arrives while a reload is in flight is the
        // network response for that reload. Anything before the first
        // reload is the cached snapshot from posthog-js's persistence.
        if (reloadInFlight) {
          freshSeen = true
          reloadInFlight = false
        }
        const enabled: Record<string, boolean> = {}
        for (const key of flags) enabled[key] = true
        // PostHog's `flags` array only contains keys that resolved truthy.
        // We can't enumerate the full set here without an extra call;
// useMeFeatures.resolveFeatureFlag() applies per-flag policy: opt-in keys
// (wallet, extension_mode) treat absent/disabled payload entries as off;
// fail-open keys (plan_limits, account_access, FeatureGate pages) default on.
        nuxtApp.payload.__posthogFlags = { ready: freshSeen, enabled, payloads }
        if (freshSeen) {
          window.dispatchEvent(new CustomEvent('posthog:flags-changed'))
        }
      })

      // Force a fresh /decide so we don't trust the localStorage cache for
      // gated requests. The featureFlagsReloading event above fires
      // synchronously here; the matching onFeatureFlags callback fires
      // when the response lands.
      ph.reloadFeatureFlags()
    },
  })

  // Wire identify/reset to Supabase auth changes. The @nuxtjs/supabase module
  // exposes useSupabaseUser() as a reactive ref; watch it here so identify
  // fires on initial load and on every sign-in/sign-out without each page
  // having to remember.
  const user = useSupabaseUser()
  watch(
    user,
    (current) => {
      if (current?.id) {
        posthog.identify(current.id, {
          email: current.email,
        })
      } else {
        posthog.reset()
      }
    },
    { immediate: true },
  )

  return {
    provide: {
      posthog: posthog as typeof posthog,
    },
  }
})
