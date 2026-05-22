import type { SupabaseClient } from '@supabase/supabase-js'

// Module-level cache of the current access token. Supabase already keeps the
// session in memory, but `getSession()` is async — every authFetch awaits a
// promise and only resolves on the next microtask. With a dashboard that fires
// 4+ parallel fetches per mount (sessions/wallet/transactions/budgets) this
// adds up. We mirror the token here once via onAuthStateChange and read it
// synchronously per call.
let cachedToken: string | null = null
let pendingRefresh: Promise<string | null> | null = null
let listenerInstalled = false

function installListener(supabase: SupabaseClient) {
  if (listenerInstalled || !import.meta.client) return
  listenerInstalled = true
  // Seed the cache from whatever session supabase already has in memory.
  supabase.auth.getSession().then(({ data }) => {
    cachedToken = data.session?.access_token ?? null
  }).catch(() => {})
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.access_token ?? null
  })
}

async function resolveToken(supabase: SupabaseClient): Promise<string | null> {
  if (cachedToken) return cachedToken
  // First call (before the seed promise resolves) or signed-out state. Fall
  // back to getSession() — coalesce concurrent callers so we make at most one
  // round-trip while the cache is cold.
  if (!pendingRefresh) {
    pendingRefresh = supabase.auth.getSession()
      .then(({ data }) => {
        cachedToken = data.session?.access_token ?? null
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
    return apiFetch<T>(path, {
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(optsHeaders as Record<string, string> | undefined),
      },
      ...rest,
    })
  }

  return { authFetch }
}
