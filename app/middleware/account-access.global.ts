// Redirects users to /account-suspended whenever the `account_access` PostHog
// flag resolves false for them. Runs after the auth middleware so it only
// fires for signed-in users; the suspended page itself and auth pages are
// always accessible so the user can sign out or contact support.
import { isAlwaysAllowed } from '~/utils/routeGroups'

export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return
  if (isAlwaysAllowed(to.path)) return

  const user = useSupabaseUser()
  if (!user.value) return

  const { isEnabled, ready } = useMeFeatures()
  // Only redirect once flags have actually resolved — otherwise we'd redirect
  // on every cold load before PostHog has a chance to evaluate.
  if (!ready.value) return
  if (isEnabled('account_access')) return

  return navigateTo('/account-suspended', { replace: true })
})
