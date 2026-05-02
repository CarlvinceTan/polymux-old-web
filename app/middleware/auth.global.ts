/**
 * Protected routes require an authenticated user. Marketing/landing pages remain public.
 * Unauthenticated hits carry the original path through `?redirect=<path>` so the sign-in page
 * can return the user to where they were headed.
 */
const PROTECTED_PREFIXES = ['/workflow', '/dashboard', '/storage', '/vault', '/integrations', '/session']

function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))
}

export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  // Authenticated users landing on the root are sent straight to the dashboard,
  // avoiding a flash of the marketing page followed by a client-side redirect.
  if (to.path === '/' && user.value) {
    return navigateTo('/dashboard/home', { replace: true })
  }

  if (!isProtectedPath(to.path)) return
  if (user.value) return
  return navigateTo(`/sign-in?redirect=${encodeURIComponent(to.fullPath)}`)
})
