/**
 * One-time migration cleanup for the auth cookie's scope.
 *
 * We pin the prod auth cookie to `Domain=.polymux.com` (see `nuxt.config.ts`,
 * `cookieOptions.domain`) so the session is shared with `admin.polymux.com`.
 * Existing browsers still carry a HOST-scoped (`polymux.com`, no `Domain`)
 * `sb-…-auth-token` from the period the cookie was host-scoped. Two cookies with
 * the same name but different scopes can shadow each other on read, which is what
 * fed the refresh loop (see `~/utils/auth/refreshGuard`).
 *
 * Fix: once a fresh session has been written in the new `.polymux.com` scope —
 * i.e. on a real `SIGNED_IN` / `TOKEN_REFRESHED` — delete the leftover host-scoped
 * cookie. This is ordering-safe: we never delete before the correct-scope cookie
 * exists, so no active session is ever lost. A host-scoped delete (no `Domain`
 * attribute) cannot touch the `.polymux.com` cookie of the same name.
 *
 * No-ops when the cookie isn't domain-scoped (localhost / *.vercel.app previews),
 * so there's nothing to migrate there.
 */
export default defineNuxtPlugin({
  name: 'supabase-cookie-scope-migrate',
  enforce: 'post',
  setup() {
    if (!import.meta.client) return

    const cfg = useRuntimeConfig().public.supabase as {
      cookiePrefix?: string
      cookieOptions?: { domain?: string }
    }
    // Only relevant once the cookie is domain-scoped (i.e. prod).
    if (!cfg.cookieOptions?.domain) return

    const name = cfg.cookiePrefix || 'sb-auth-token'
    const client = useSupabaseClient()
    const auth = client.auth as unknown as {
      onAuthStateChange?: (cb: (event: string) => void) => unknown
    }
    if (typeof auth.onAuthStateChange !== 'function') return

    const deleteHostScoped = () => {
      const secure = location.protocol === 'https:' ? '; Secure' : ''
      // Expire the cookie (and any chunks) WITHOUT a Domain attribute → targets
      // only the host-scoped leftover, never the `.polymux.com` cookie.
      for (const suffix of ['', '.0', '.1', '.2', '.3', '.4']) {
        document.cookie = `${name}${suffix}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      }
    }

    auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') deleteHostScoped()
    })
  },
})
