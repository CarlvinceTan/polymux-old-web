/**
 * Centralized sign-out. `useState` caches and live WebSocket sessions persist across SPA
 * navigation, so a plain `supabase.auth.signOut()` leaves stale chat/workspace/wallet state
 * in memory. We clear per-user localStorage and full-reload to `/` to drop all in-memory state.
 *
 * Why we don't just call `supabase.auth.signOut()`: it issues the network revoke FIRST and
 * only then clears the local cookies. Awaiting it freezes the UI for ~500ms on cold
 * connections. Kicking it off fire-and-forget *and* navigating leaves the auth cookies in
 * place during the hard reload, so SSR renders the next page as still-signed-in for a beat.
 *
 * What we do instead, in this order:
 *   1. Capture the access token from the session ref (sync read).
 *   2. Synchronously expire the Supabase auth cookies (and any `.0`/`.1` chunks). After
 *      this point the browser is logged out from the local device.
 *   3. Fire the server revoke directly with `keepalive: true` so the request survives the
 *      imminent page unload — keeps cross-device/tab sign-out working.
 *   4. Hard reload to `/`. SSR sees no cookies and renders signed-out.
 */
import { clearUiPolicyCache } from '~/utils/uiPolicyCache'

export function useSignOut() {
  const session = useSupabaseSession()
  const { url, key, cookiePrefix } = useRuntimeConfig().public.supabase

  function expireSupabaseAuthCookies() {
    if (!cookiePrefix) return
    const escaped = cookiePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^${escaped}(\\.\\d+)?$`)
    const expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim()
      if (name && pattern.test(name)) {
        document.cookie = `${name}=; ${expiry}`
      }
    }
  }

  function revokeServerSide(accessToken: string) {
    // `keepalive: true` lets the request outlive the upcoming `window.location.assign` —
    // without it the navigation can cancel the in-flight fetch before it leaves the tab.
    fetch(`${url}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      keepalive: true,
    }).catch((err) => {
      console.error('[useSignOut] server revoke failed', err)
    })
  }

  function signOut() {
    if (!import.meta.client) return

    const accessToken = session.value?.access_token

    try {
      localStorage.removeItem('polymux_current_workspace_id')
      clearUiPolicyCache()
    }
    catch { /* ignore storage access errors */ }

    expireSupabaseAuthCookies()

    if (accessToken) revokeServerSide(accessToken)

    window.location.assign('/')
  }

  return { signOut }
}
