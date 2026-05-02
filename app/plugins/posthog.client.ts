// Initialises PostHog for feature-flag evaluation. Identifies the current
// Supabase user (and re-identifies on auth state changes) so flag targeting
// rules that filter on `email` resolve correctly. Capture is intentionally
// off — we only use PostHog for flags here, not product analytics.
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
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      // Bridge PostHog's flag callbacks into the useMeFeatures state. We
      // can't import the composable at module load (circular), so we stash
      // the latest snapshot on the Nuxt app and let useMeFeatures pick it
      // up reactively.
      ph.onFeatureFlags((flags, payloads) => {
        const enabled: Record<string, boolean> = {}
        for (const key of flags) enabled[key] = true
        // PostHog's `flags` array only contains keys that resolved truthy.
        // We can't enumerate the full set here without an extra call;
        // useMeFeatures' isEnabled() defaults absent keys to true (fail-open)
        // until a known list is fetched, so this is fine.
        nuxtApp.payload.__posthogFlags = { ready: true, enabled, payloads }
        // Trigger a state read on the composable side.
        const event = new CustomEvent('posthog:flags-changed')
        window.dispatchEvent(event)
      })
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
