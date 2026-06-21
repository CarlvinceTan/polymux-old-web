import { createRefreshGuard } from '~/utils/auth/refreshGuard'

/**
 * Installs the token-refresh circuit breaker onto the live Supabase auth client.
 *
 * Runs `post` so the `@nuxtjs/supabase` plugin (`enforce: 'pre'`) has already
 * created the client. We wrap `auth.fetch` — the seam auth-js uses for every
 * request — because auth-js binds its fetch at construction, so wrapping the
 * global `fetch` would not intercept refresh calls.
 *
 * See `~/utils/auth/refreshGuard` for the why.
 */
export default defineNuxtPlugin({
  name: 'supabase-refresh-guard',
  enforce: 'post',
  setup() {
    if (!import.meta.client) return

    const supabase = useSupabaseClient()
    const auth = supabase.auth as unknown as {
      fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    }
    // Defensive: if auth-js changes its internal shape, do nothing rather than break auth.
    if (typeof auth.fetch !== 'function') return

    const cfg = useRuntimeConfig().public.supabase as {
      cookiePrefix?: string
      cookieOptions?: { domain?: string }
    }
    const cookieName = cfg.cookiePrefix || 'sb-auth-token'
    const cookieDomain = cfg.cookieOptions?.domain

    const original = auth.fetch
    auth.fetch = createRefreshGuard({
      fetch: (input, init) => original(input, init),
      purge: () => purgeAuthCookie(cookieName, cookieDomain),
      onTrip: ({ count, windowMs }) => {
        console.warn(
          `[polymux] token-refresh storm detected (${count}+ refreshes within ${windowMs}ms) — `
          + 'pacing requests and clearing the stale session to break the loop',
        )
      },
    })
  },
})

/**
 * Remove the (possibly chunked) Supabase auth cookie directly. We avoid
 * `auth.signOut()` because it loads the session first and an expired session
 * would trigger a refresh — re-entering the loop. Best-effort across the cookie's
 * domain scopes; clearing the wrong scope is harmless.
 */
function purgeAuthCookie(name: string, domain?: string) {
  if (typeof document === 'undefined') return
  const names = ['', '.0', '.1', '.2', '.3', '.4'].map(suffix => name + suffix)
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  // Include the registrable parent domain so we can also clear a `.polymux.com`
  // (shared-across-subdomains) cookie, not just the host-scoped one — a no-Domain
  // delete can't touch a Domain-scoped cookie.
  const host = location.hostname
  const parent = host.split('.').slice(-2).join('.')
  const domains = new Set<string | undefined>([undefined, domain, host, parent, `.${parent}`])
  for (const cookieName of names) {
    for (const d of domains) {
      document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax${d ? `; Domain=${d}` : ''}${secure}`
    }
  }
}
