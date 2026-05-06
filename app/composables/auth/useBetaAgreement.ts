// Bump VERSION whenever the OnboardingModal terms copy materially changes —
// users who accepted an older version will be re-prompted, and the new
// acceptance is logged server-side via /api/account/agreements/accept along
// with the IP, user agent, and timestamp for audit purposes.
const AGREEMENT = 'beta'
const VERSION = '2026-05-03'
const STORAGE_KEY = `polymux:betaAgreementAccepted:${VERSION}`

const accepted = ref(false)
const ready = ref(false)
let initialized = false

export function useBetaAgreement() {
  const { locale } = useI18n()
  const user = useSupabaseUser()

  function readCache(): boolean {
    if (!import.meta.client) return false
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    }
    catch {
      return false
    }
  }

  function writeCache() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    catch {
      // localStorage unavailable — keep the in-memory flag so the modal
      // doesn't reopen during this session.
    }
  }

  // Server is the source of truth for cross-device acceptance. If the user
  // accepted on another device we still want to skip the modal here, even
  // though localStorage is empty.
  async function checkServerStatus() {
    try {
      const res = await $fetch<{ accepted: boolean }>('/api/account/agreements/status', {
        query: { agreement: AGREEMENT, version: VERSION },
      })
      if (res.accepted) {
        accepted.value = true
        writeCache()
      }
    }
    catch (err) {
      console.error('[betaAgreement] failed to check acceptance status', err)
    }
  }

  async function init() {
    if (!import.meta.client) return

    // Cache hit — trust it and skip the round trip.
    if (readCache()) {
      accepted.value = true
      ready.value = true
      return
    }

    // Cache miss. If the user is already authenticated, await the server
    // check so the modal doesn't briefly flash for cross-device users.
    if (user.value) {
      await checkServerStatus()
      ready.value = true
      return
    }

    // Not authenticated yet — let the rest of the app proceed; once the user
    // signs in, hide any in-flight modal and recheck the server before
    // showing it again.
    ready.value = true
    const stop = watch(user, async (newUser) => {
      if (!newUser) return
      stop()
      if (accepted.value) return
      ready.value = false
      await checkServerStatus()
      ready.value = true
    })
  }

  async function accept() {
    accepted.value = true
    if (!import.meta.client) return

    writeCache()

    try {
      await $fetch('/api/account/agreements/accept', {
        method: 'POST',
        body: {
          agreement: AGREEMENT,
          version: VERSION,
          locale: locale.value,
        },
      })
    }
    catch (err) {
      // The modal stays dismissed for this user even if the audit POST
      // fails — re-nagging on a transient network error is worse UX than
      // the (rare) missed audit row, and clearing the local flag would
      // immediately re-open the modal mid-session.
      console.error('[betaAgreement] failed to record acceptance', err)
    }
  }

  if (import.meta.client && !initialized) {
    initialized = true
    void init()
  }

  return {
    accepted: readonly(accepted),
    ready: readonly(ready),
    accept,
  }
}
