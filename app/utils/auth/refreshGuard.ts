/**
 * Client-side circuit breaker for the Supabase token-refresh path.
 *
 * The problem it solves
 * ---------------------
 * When a returning user's access token is expired, `@supabase/auth-js` refreshes
 * it on load. If that refresh fails (e.g. HTTP 429 because the project's auth
 * rate limit is saturated), auth-js's failure path re-enters itself with **no
 * backoff**:
 *
 *   _callRefreshToken (fail) -> _removeSession -> _notifyAllSubscribers
 *     -> _handleTokenChanged -> getSession -> _callRefreshToken (fail) -> ...
 *
 * Each iteration re-reads the same expired session from the cookie, so it
 * snowballs into ~18 refresh calls/sec. That keeps the rate limit pinned, the
 * session never settles (so the user is bounced back to /sign-in), and the auth
 * backend is hammered for *everyone*.
 *
 * What this does
 * --------------
 * Wraps the fetch the auth client uses and, when refresh calls burst, it:
 *   1. stops hitting the server (returns a synthetic failure instead),
 *   2. paces the loop (so it can't spin the CPU either), and
 *   3. purges the stale session once — removing the loop's fuel so it self-heals.
 *
 * Note: we purge by clearing the cookie directly rather than calling
 * `auth.signOut()`, because signOut runs through `_useSession -> __loadSession`,
 * which on an expired session tries to *refresh first* — re-entering the very
 * loop we are breaking.
 *
 * The core is dependency-injected so it can be unit-tested without a browser.
 */

export interface RefreshGuardDeps {
  /** The fetch the Supabase auth client would otherwise have used. */
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /** Remove the persisted session so the loop stops re-reading it. Best-effort. */
  purge: () => void
  /** Called once each time the breaker trips (logging / telemetry). */
  onTrip?: (info: { count: number, windowMs: number }) => void
  /** Injectable clock (tests). Defaults to Date.now. */
  now?: () => number
  /** Injectable delay (tests). Defaults to setTimeout. */
  delay?: (ms: number) => Promise<void>
}

export interface RefreshGuardOptions {
  /** Sliding window over which refreshes are counted. */
  windowMs?: number
  /** Max refreshes allowed to reach the server within the window before tripping. */
  maxInWindow?: number
  /** While tripped, how long each refresh attempt is held before failing (paces the loop). */
  throttleMs?: number
}

const REFRESH_PATH = '/auth/v1/token'
const REFRESH_GRANT = 'grant_type=refresh_token'

/** True for a Supabase access-token *refresh* request (not password/PKCE/etc.). */
export function isRefreshRequest(url: string): boolean {
  return url.includes(REFRESH_PATH) && url.includes(REFRESH_GRANT)
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return (input as Request).url ?? ''
}

function throttledResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'refresh_throttled',
      error_description: 'Token refresh paced by the client-side circuit breaker',
    }),
    { status: 429, headers: { 'content-type': 'application/json' } },
  )
}

export function createRefreshGuard(deps: RefreshGuardDeps, opts: RefreshGuardOptions = {}) {
  const windowMs = opts.windowMs ?? 10_000
  const maxInWindow = opts.maxInWindow ?? 6
  const throttleMs = opts.throttleMs ?? 3_000
  const now = deps.now ?? (() => Date.now())
  const delay = deps.delay ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))

  let hits: number[] = []
  let cooldownUntil = 0
  let purgedThisBurst = false

  return async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!isRefreshRequest(urlOf(input))) return deps.fetch(input, init)

    const t = now()
    hits = hits.filter(h => t - h < windowMs)

    const tripped = t < cooldownUntil || hits.length >= maxInWindow
    if (tripped) {
      const firstOfBurst = t >= cooldownUntil
      if (firstOfBurst) {
        cooldownUntil = t + windowMs
        purgedThisBurst = false
        deps.onTrip?.({ count: hits.length, windowMs })
      }
      if (!purgedThisBurst) {
        purgedThisBurst = true
        deps.purge()
      }
      // Pace the loop: no server hit, no CPU spin.
      await delay(throttleMs)
      return throttledResponse()
    }

    hits.push(t)
    return deps.fetch(input, init)
  }
}
