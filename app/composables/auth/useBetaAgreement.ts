// Bump VERSION whenever the OnboardingModal terms copy materially changes —
// users who accepted an older version will be re-prompted, and the new
// acceptance is logged server-side via /api/account/agreements/accept along
// with the IP, user agent, and timestamp for audit purposes.
const AGREEMENT = 'beta'
const VERSION = '2026-05-03'

// `accepted` holds POSITIVE evidence of acceptance (local cache or a server
// record). `ready` means we have made a definitive show/don't-show decision.
// The modal opens only when ready && !accepted, so until we can prove the user
// has NOT accepted we keep the modal closed — a transient status-check failure
// must never re-nag a user who already agreed.
const accepted = ref(false)
const ready = ref(false)
let initialized = false
let resolving = false

/** Read-only acceptance flag for plugins that cannot call useI18n(). */
export const betaAgreementAccepted = readonly(accepted)

export function useBetaAgreement() {
  const { locale } = useI18n()
  const user = useSupabaseUser()

  // Key is scoped to both version and user ID so a prior user's acceptance on
  // the same device doesn't carry over to a new account.
  function storageKey(userId: string): string {
    return `polymux:betaAgreementAccepted:${VERSION}:${userId}`
  }

  function readCache(userId: string): boolean {
    if (!import.meta.client) return false
    try {
      return localStorage.getItem(storageKey(userId)) === 'true'
    }
    catch {
      return false
    }
  }

  function writeCache(userId: string) {
    if (!import.meta.client) return
    try {
      localStorage.setItem(storageKey(userId), 'true')
    }
    catch {
      // localStorage unavailable — keep the in-memory flag so the modal
      // doesn't reopen during this session.
    }
  }

  // Returns true if the server has a record of acceptance, false if it
  // definitively does NOT, or null if we couldn't tell (network error, or the
  // auth session was still being restored when we asked and the request 401'd).
  // A null result must not re-prompt an already-accepted user.
  async function fetchServerStatus(): Promise<boolean | null> {
    try {
      const res = await $fetch<{ accepted: boolean }>('/api/account/agreements/status', {
        query: { agreement: AGREEMENT, version: VERSION },
      })
      return !!res.accepted
    }
    catch (err) {
      // 401s here are usually transient: on a returning visit the status check
      // can fire before the Supabase session cookie is finished restoring /
      // refreshing. Treat as "unknown" and let the caller retry.
      console.error('[betaAgreement] status check failed', err)
      return null
    }
  }

  // Decide whether to show the modal for a known, signed-in user. Cache is
  // authoritative and instant; otherwise we ask the server, retrying a few
  // times to ride out the brief window after page load where the session
  // isn't ready yet. We only mark `ready` once we reach a definitive answer —
  // an inconclusive run leaves the modal closed and is retried on the next
  // user change or page load rather than nagging.
  async function resolve(userId: string) {
    if (resolving || ready.value) return
    resolving = true
    try {
      if (readCache(userId)) {
        accepted.value = true
        ready.value = true
        return
      }

      for (let attempt = 0; attempt < 4; attempt++) {
        const status = await fetchServerStatus()
        if (status === true) {
          accepted.value = true
          writeCache(userId)
          ready.value = true
          return
        }
        if (status === false) {
          // Server is sure this user has not accepted → show the modal.
          accepted.value = false
          ready.value = true
          return
        }
        // status === null → transient failure. Back off and try again before
        // giving up; never flip `ready` on an inconclusive answer.
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
      }
      // Still inconclusive after retries: leave the modal closed (ready stays
      // false). A later sign-in or a fresh page load will try again.
    }
    finally {
      resolving = false
    }
  }

  function init() {
    if (!import.meta.client || initialized) return
    initialized = true

    // Resolve as soon as we have a user, and re-resolve if the user changes
    // (e.g. sign-in). We never show the modal while the user is unknown, so
    // there's no flash during the session-restore window.
    watch(user, (u) => {
      if (!u || accepted.value || ready.value) return
      void resolve(u.id)
    }, { immediate: true })
  }

  async function accept() {
    accepted.value = true
    if (!import.meta.client) return

    if (user.value) writeCache(user.value.id)

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

  if (import.meta.client) init()

  return {
    accepted: readonly(accepted),
    ready: readonly(ready),
    accept,
  }
}
