/**
 * Tracks the last route the user visited that is neither an auth page nor a protected route,
 * so the back arrow on /sign-in and /sign-up returns to the actual prior page (skipping any
 * auth hops like /sign-in → /sign-up) rather than bouncing around inside the auth flow.
 *
 * Stored per-tab so concurrent tabs don't leak back targets between each other.
 */
import { AUTH_PREFIXES, PROTECTED_PREFIXES, hasPrefix } from '~/utils/routeGroups'

const AUTH_BACK_KEY = 'polymux_auth_back'

export default defineNuxtPlugin((nuxtApp) => {
  const router = nuxtApp.$router as ReturnType<typeof useRouter>
  router.afterEach((to) => {
    const path = to.path
    if (hasPrefix(path, AUTH_PREFIXES) || hasPrefix(path, PROTECTED_PREFIXES)) return
    try { sessionStorage.setItem(AUTH_BACK_KEY, to.fullPath) }
    catch { /* storage quota / private mode — ignore */ }
  })
})
