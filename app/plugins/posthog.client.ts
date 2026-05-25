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

// PostHog popover surveys re-evaluate every ~1s and on SPA navigations. They
// only mark localStorage "seen" on dismiss/submit — not on display — so a
// route change that tears down the popover DOM re-triggers display. Mark all
// popovers as seen on first display and track session state to suppress repeats.
const PRODUCT_ANNOUNCEMENT_SURVEY_ID = '019e4827-e154-0000-1ae4-7bce48e9a26e'
const CSAT_SURVEY_ID = '019e4828-8ea8-0000-623f-d5edcabf600f'
const NPS_SURVEY_ID = '019e4828-5c2a-0000-5c2e-a6664b09aa0d'
const WORKFLOW_VIEW_INTUITIVENESS_SURVEY_ID =
  '019e536a-7cf8-0000-f1da-2be9f8f5a45b'
const AUTO_SWITCH_TO_VIEW_SURVEY_ID = '019e536a-8503-0000-c7a2-69c78160ff0f'
const OPEN_FEEDBACK_SURVEY_ID = '019e4828-287a-0000-3b3b-09ec1fac624a'

const POPOVER_SURVEY_IDS = [
  PRODUCT_ANNOUNCEMENT_SURVEY_ID,
  CSAT_SURVEY_ID,
  NPS_SURVEY_ID,
  WORKFLOW_VIEW_INTUITIVENESS_SURVEY_ID,
  AUTO_SWITCH_TO_VIEW_SURVEY_ID,
] as const

// Widget surveys are not session-deduped like popovers; cancel when leaving
// workspace routes so the tab does not linger over marketing pages.
const WIDGET_SURVEY_IDS = [OPEN_FEEDBACK_SURVEY_ID] as const

const SESSION_SHOWN_PREFIX = 'polymux:posthog-survey-session:'
const FIRST_VISIT_KEY = 'polymux:first_visit_at'
const POSTHOG_SEEN_PREFIX = 'seenSurvey_'

const WORKSPACE_ROUTE_PREFIXES = [
  '/workflow',
  '/dashboard',
  '/storage',
  '/vault',
  '/integrations',
  '/session',
] as const

function isWorkspaceRoute(path: string): boolean {
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

function sessionShownKey(surveyId: string): string {
  return `${SESSION_SHOWN_PREFIX}${surveyId}`
}

function posthogSeenKey(surveyId: string, iteration?: number | null): string {
  if (iteration && iteration > 0) {
    return `${POSTHOG_SEEN_PREFIX}${surveyId}_${iteration}`
  }
  return `${POSTHOG_SEEN_PREFIX}${surveyId}`
}

function markSurveyShownInSession(surveyId: string) {
  sessionStorage.setItem(sessionShownKey(surveyId), '1')
}

function wasSurveyShownThisSession(surveyId: string): boolean {
  return sessionStorage.getItem(sessionShownKey(surveyId)) === '1'
}

// Mirrors posthog-js setSurveySeenOnLocalStorage so eligibility checks stop
// re-displaying popovers after the first show in an iteration.
function markPostHogSurveySeen(surveyId: string, iteration?: number | null) {
  const key = posthogSeenKey(surveyId, iteration)
  if (localStorage.getItem(key)) return
  localStorage.setItem(key, 'true')
}

function suppressSessionPopoverReshow(ph: typeof posthog) {
  for (const surveyId of POPOVER_SURVEY_IDS) {
    if (!wasSurveyShownThisSession(surveyId)) continue
    ph.surveys?.cancelPendingSurvey(surveyId)
  }
}

function cancelNonWorkspaceSurveys(ph: typeof posthog) {
  for (const surveyId of POPOVER_SURVEY_IDS) {
    ph.surveys?.cancelPendingSurvey(surveyId)
  }
  for (const surveyId of WIDGET_SURVEY_IDS) {
    ph.surveys?.cancelPendingSurvey(surveyId)
  }
}

function syncSurveyDisplay(path: string, ph: typeof posthog) {
  if (!isWorkspaceRoute(path)) {
    cancelNonWorkspaceSurveys(ph)
  } else {
    suppressSessionPopoverReshow(ph)
  }
}

function ensureFirstVisitTimestamp(path: string) {
  if (!isWorkspaceRoute(path)) return
  if (!localStorage.getItem(FIRST_VISIT_KEY)) {
    localStorage.setItem(FIRST_VISIT_KEY, new Date().toISOString())
  }
}

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

  const router = useRouter()

  posthog.init(publicKey, {
    api_host: host || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
    // Keep surveys enabled at init so the manager loads on landing pages too.
    // Users often hit / first then navigate into /workflow; toggling
    // disable_surveys after init does not re-run onRemoteConfig, which left
    // the Open Feedback widget permanently hidden. Popovers/widgets on
    // marketing routes are suppressed via cancelPendingSurvey and PostHog URL
    // conditions on each survey.
    disable_surveys: false,
    __add_tracing_headers: ['localhost', 'polymux.com'],
    loaded: (ph) => {
      ensureFirstVisitTimestamp(router.currentRoute.value.path)

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

      ph.on('survey shown', (survey) => {
        if (survey.type !== 'popover') return
        markSurveyShownInSession(survey.id)
        markPostHogSurveySeen(survey.id, survey.current_iteration)
      })

      syncSurveyDisplay(router.currentRoute.value.path, ph)
      router.afterEach((to) => syncSurveyDisplay(to.path, ph))
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
      const path = router.currentRoute.value.path
      if (current?.id) {
        ensureFirstVisitTimestamp(path)
        posthog.identify(current.id, {
          email: current.email,
        })
        const activeSince = localStorage.getItem(FIRST_VISIT_KEY)
        if (activeSince) {
          posthog.people.set_once({
            polymux_active_since: activeSince,
          })
        }
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
