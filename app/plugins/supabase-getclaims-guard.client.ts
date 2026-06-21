/**
 * Neutralizes the token-refresh AMPLIFIER that lives in `@nuxtjs/supabase`.
 *
 * That plugin's auth listener calls `client.auth.getClaims()` with NO argument
 * (`@nuxtjs/supabase/.../supabase.client.js:53`). With no jwt, `getClaims()`
 * falls into `if (!token) { ... getSession() }` (`@supabase/auth-js`
 * `GoTrueClient.js:4821`), and on an expired/stale token `getSession()` triggers
 * another refresh → `TOKEN_REFRESHED` → the listener runs again → … an unbounded
 * refresh loop. We reproduced it at ~18 refreshes/sec (prod's exact rate) in a
 * faithful harness; with this guard the same scenario drops to ~1/sec.
 *
 * We can't edit the third-party plugin, so instead we make every NO-ARG
 * `getClaims()` pass the CURRENT session's access token, which skips the
 * `getSession()` re-entry. A stale token then just verifies in place (no refresh
 * side-effect); the normal auto-refresh tick still refreshes it, paced, no storm.
 *
 * Runs `post` so the `@nuxtjs/supabase` plugin (`enforce: 'pre'`) has created the
 * singleton client and keeps `useSupabaseSession()` in sync. The listener reads
 * `client.auth.getClaims` at call time, so reassigning it here takes effect.
 *
 * See also `~/utils/auth/refreshGuard` (the circuit-breaker backstop).
 */
export default defineNuxtPlugin({
  name: 'supabase-getclaims-guard',
  enforce: 'post',
  setup() {
    if (!import.meta.client) return

    const client = useSupabaseClient()
    const session = useSupabaseSession()
    const auth = client.auth as unknown as {
      getClaims?: (jwt?: string, opts?: unknown) => Promise<unknown>
      onAuthStateChange?: (cb: (e: string, s: { access_token?: string } | null) => void) => unknown
    }
    // Defensive: if auth-js changes its shape, do nothing rather than break auth.
    if (typeof auth.getClaims !== 'function') return

    // The @nuxtjs/supabase session ref is the ordering-safe source (it's set
    // synchronously right before getClaims() in the offending listener). Keep a
    // local mirror too, for any call that lands before that ref is populated.
    let mirrored: string | null = session.value?.access_token ?? null
    auth.onAuthStateChange?.((_e, s) => { mirrored = s?.access_token ?? mirrored })

    const original = auth.getClaims.bind(auth)
    auth.getClaims = (jwt, opts) =>
      original(jwt ?? session.value?.access_token ?? mirrored ?? undefined, opts)
  },
})
