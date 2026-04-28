/**
 * Drives the silent extension pairing handshake whenever a signed-in user is
 * on the Polymux website. The composable owns its per-tab cache so this
 * plugin can call pair() liberally without spamming the Go server.
 *
 * Auth pages are excluded because the user isn't signed in yet there; on
 * every other page we pair as soon as the user becomes available. This
 * matches the user-stated intent: "connect automatically whenever a
 * Polymux tab is active or opened."
 */
const AUTH_PREFIXES = ['/sign-in', '/sign-up', '/confirm', '/forgot-password', '/reset-password']

function isAuthPath(path: string): boolean {
  return AUTH_PREFIXES.some(p => path === p || path.startsWith(p + '/'))
}

export default defineNuxtPlugin((nuxtApp) => {
  const supabaseUser = useSupabaseUser()
  const router = nuxtApp.$router as ReturnType<typeof useRouter>
  const { pair, invalidate } = useExtensionAutoPair()

  function maybePair(path: string, trigger: string): void {
    if (!supabaseUser.value) {
      console.info(`polymux: auto-pair skipped (${trigger}, no user)`)
      return
    }
    if (isAuthPath(path)) {
      console.info(`polymux: auto-pair skipped (${trigger}, auth route)`)
      return
    }
    console.info(`polymux: auto-pair triggered (${trigger}, ${path})`)
    pair().catch((err) => {
      console.warn('polymux: pair() rejected', err)
    })
  }

  // Run once on initial client hydration. Supabase may not have hydrated the
  // user ref yet — the watch below catches that case.
  if (typeof window !== 'undefined') {
    maybePair(window.location.pathname, 'mount')
  }

  // React to auth-state transitions: pair when the user appears, invalidate
  // the cache when they sign out so a future sign-in re-probes.
  watch(supabaseUser, (next, prev) => {
    if (prev && !next) {
      invalidate()
      return
    }
    if (!prev && next && typeof window !== 'undefined') {
      maybePair(window.location.pathname, 'user-available')
    }
  })

  router.afterEach((to) => {
    maybePair(to.path, 'navigation')
  })
})
