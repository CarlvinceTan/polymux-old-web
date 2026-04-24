/**
 * Protected routes require an authenticated user. Marketing/landing pages remain public.
 * Unauthenticated hits carry the original path through `?redirect=<path>` so the sign-in page
 * can return the user to where they were headed.
 */
const PROTECTED_PREFIXES = ['/workflow', '/dashboard', '/settings', '/storage', '/vault', '/integrations', '/session']

function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))
}

export default defineNuxtRouteMiddleware((to) => {
  if (!isProtectedPath(to.path)) return
  const user = useSupabaseUser()
  if (user.value) return
  return navigateTo(`/sign-in?redirect=${encodeURIComponent(to.fullPath)}`)
})
