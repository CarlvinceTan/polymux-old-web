// Client for the web→Go admin bridge (server/api/admin/go/[...path].ts).
//
// Attaches the maintainer's Supabase access token as a Bearer header so the
// bridge can forward it to the Go backend's /admin/* endpoints. Mirrors the
// console app's useAdminApi(), but routed through the web app's own origin.

export interface AdminGoOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, unknown>
}

export function useAdminGo() {
  const session = useSupabaseSession()

  // `$fetch`'s typed-route inference recurses over the entire route union to
  // match the request URL; the admin catch-all (`/api/admin/go/[...path]`)
  // pushes that recursion past the TS stack limit. This bridge is intentionally
  // untyped per-route (the caller's <T> types the response), so call through a
  // plain string-keyed signature to skip the route matching entirely.
  const adminFetch = $fetch as unknown as <R>(
    req: string,
    opts?: {
      method?: string
      headers?: Record<string, string>
      query?: Record<string, unknown>
      body?: unknown
    },
  ) => Promise<R>

  async function call<T = unknown>(path: string, opts: AdminGoOptions = {}): Promise<T> {
    const token = session.value?.access_token
    if (!token) throw new Error('Not authenticated.')
    const p = path.replace(/^\/+/, '')
    return await adminFetch<T>(`/api/admin/go/${p}`, {
      method: opts.method ?? 'GET',
      headers: { authorization: `Bearer ${token}` },
      query: opts.query,
      body: opts.body,
    })
  }

  return { call }
}
