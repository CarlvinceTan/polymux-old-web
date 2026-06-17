// Plain-typed wrapper over `$fetch` for the web app's own admin API
// (`/api/admin/*`).
//
// Nuxt's `$fetch` infers the response type by matching the request URL against
// the full generated route union. With the admin route surface present, that
// inference recurses past the TypeScript instantiation budget and surfaces as
// "Excessive stack depth" errors that hop between admin call sites as you fix
// them. Admin responses are typed explicitly by the caller via `<T>`, so the
// route inference buys nothing here — call through a plain string signature to
// skip it. Runtime behaviour is identical to `$fetch`.
export function adminFetch<T = unknown>(path: string, opts?: Record<string, unknown>): Promise<T> {
  return ($fetch as unknown as (p: string, o?: Record<string, unknown>) => Promise<T>)(path, opts)
}
