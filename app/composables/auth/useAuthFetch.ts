import type { SupabaseClient } from '@supabase/supabase-js'
import { getPostHogBrowserSessionId, getPostHogDistinctId } from '~/utils/posthogContext'

// Module-level cache of the current access token. Supabase already keeps the
// session in memory, but `getSession()` is async — every authFetch awaits a
// promise and only resolves on the next microtask. With a dashboard that fires
// 4+ parallel fetches per mount (sessions/wallet/transactions/budgets) this
// adds up. We mirror the token here once via onAuthStateChange and read it
// synchronously per call.
let cachedToken: string | null = null
let cachedExpiresAt = 0
let pendingRefresh: Promise<string | null> | null = null
let listenerInstalled = false

function tokenExpiresSoon(): boolean {
  if (!cachedExpiresAt) return true
  return Date.now() / 1000 > cachedExpiresAt - 60
}

function cacheSession(session: { access_token: string; expires_at?: number } | null | undefined) {
  cachedToken = session?.access_token ?? null
  cachedExpiresAt = session?.expires_at ?? 0
}

function installListener(supabase: SupabaseClient) {
  if (listenerInstalled || !import.meta.client) return
  listenerInstalled = true
  supabase.auth.getSession().then(({ data }) => {
    cacheSession(data.session)
  }).catch(() => {})
  supabase.auth.onAuthStateChange((_event, session) => {
    cacheSession(session)
  })
}

async function resolveToken(supabase: SupabaseClient): Promise<string | null> {
  if (cachedToken && !tokenExpiresSoon()) return cachedToken
  if (!pendingRefresh) {
    pendingRefresh = supabase.auth.getSession()
      .then(({ data }) => {
        cacheSession(data.session)
        return cachedToken
      })
      .catch(() => null)
      .finally(() => { pendingRefresh = null })
  }
  return pendingRefresh
}

export function useAuthFetch() {
  const supabase = useSupabaseClient()
  const config = useRuntimeConfig()
  const baseURL = config.public.serverUrl as string

  installListener(supabase)

  async function authFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const token = await resolveToken(supabase)
    if (!token) throw new Error('Not authenticated')

    const { headers: optsHeaders, ...rest } = opts
    const phSession = getPostHogBrowserSessionId()
    const phDistinct = getPostHogDistinctId()
    const buildOpts = (t: string) => ({
      baseURL,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        ...(phSession ? { 'X-POSTHOG-SESSION-ID': phSession } : {}),
        ...(phDistinct ? { 'X-POSTHOG-DISTINCT-ID': phDistinct } : {}),
        ...(optsHeaders as Record<string, string> | undefined),
      },
      ...rest,
    })

    try {
      return await apiFetch<T>(path, buildOpts(token))
    }
    catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status !== 401) throw err
      cachedToken = null
      cachedExpiresAt = 0
      const fresh = await resolveToken(supabase)
      if (!fresh || fresh === token) throw err
      return apiFetch<T>(path, buildOpts(fresh))
    }
  }

  return { authFetch }
}
