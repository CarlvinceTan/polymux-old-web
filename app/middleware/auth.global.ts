/**
 * Protected routes require an authenticated user. Marketing/landing pages remain public.
 * Unauthenticated hits carry the original path through `?redirect=<path>` so the sign-in page
 * can return the user to where they were headed.
 */
import { isProtectedPath } from '~/utils/routeGroups'

export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  if (!isProtectedPath(to.path)) return
  if (user.value) return
  // The admin subdomain gets its own stripped, sign-in-only page (no marketing /
  // app chrome) that always lands on /admin.
  if (useRequestURL().host.startsWith('admin.')) return navigateTo('/admin-sign-in')
  return navigateTo(`/sign-in?redirect=${encodeURIComponent(to.fullPath)}`)
})
