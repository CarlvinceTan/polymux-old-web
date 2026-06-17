// Host-based routing for the admin surface.
//
// Production: admin.polymux.com serves the maintainer console; the apex
// (polymux.com) serves the product. On the admin host only /admin/* (plus auth
// pages) are reachable — everything else bounces to /admin; and /admin links hit
// on the apex are forwarded to the admin subdomain. Locally and on *.vercel.app
// previews there is no admin subdomain, so /admin is reached by path.
//
// Auth: /admin is a protected prefix (auth.global.ts redirects unauthed users to
// sign-in). This middleware layers the maintainer check on top — UX only; the
// /api/admin/* endpoints enforce requireMaintainer server-side regardless.

import { isAlwaysAllowed } from '~/utils/routeGroups'

const ROOT_DOMAIN = 'polymux.com'

function hostname(host: string): string {
  return (host || '').split(':')[0] || ''
}

async function isMaintainer(): Promise<boolean> {
  const cached = useState<boolean | null>('is-maintainer', () => null)
  if (cached.value !== null) return cached.value
  // useRequestFetch forwards the incoming cookies on SSR so the probe sees the
  // session; on the client it's a normal credentialed fetch.
  const apiFetch = useRequestFetch()
  try {
    const res = await apiFetch<{ isMaintainer: boolean }>('/api/admin/me')
    cached.value = !!res?.isMaintainer
  }
  catch {
    cached.value = false
  }
  return cached.value
}

export default defineNuxtRouteMiddleware(async (to) => {
  const h = hostname(useRequestURL().host)
  const isAdminHost = h.startsWith('admin.')
  const isAdminPath = to.path === '/admin' || to.path.startsWith('/admin/')
  const onProdDomain = h === ROOT_DOMAIN || h.endsWith('.' + ROOT_DOMAIN)

  // Apex (prod) → forward any /admin hit to the admin subdomain.
  if (onProdDomain && !isAdminHost && isAdminPath) {
    return navigateTo(`https://admin.${ROOT_DOMAIN}${to.fullPath}`, { external: true })
  }

  // On the admin host, only /admin/* (and auth pages) are reachable.
  if (isAdminHost && !isAdminPath && !isAlwaysAllowed(to.path)) {
    return navigateTo('/admin')
  }

  // Maintainer gate for the admin surface. auth.global handles the unauthed case
  // (redirect to sign-in); here we only bounce a signed-in non-maintainer.
  if (isAdminPath) {
    const user = useSupabaseUser()
    if (user.value && !(await isMaintainer())) {
      return isAdminHost
        ? navigateTo(`https://${ROOT_DOMAIN}/`, { external: true })
        : navigateTo('/')
    }
  }
})
