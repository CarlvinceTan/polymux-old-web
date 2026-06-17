/**
 * Extract a human-readable message from an ofetch/$fetch error.
 * Prefers the server's `data.error` field, then the error's own `message`,
 * else returns `fallback` (default: undefined).
 */
export function extractServerError(err: unknown, fallback?: string): string | undefined {
  if (err && typeof err === 'object') {
    const data = (err as { data?: unknown }).data
    if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
      const e = (data as { error: string }).error
      if (e) return e
    }
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  return fallback
}

/** Numeric HTTP status from an ofetch/$fetch error, if present. */
export function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown, statusCode?: unknown }
    if (typeof e.status === 'number') return e.status
    if (typeof e.statusCode === 'number') return e.statusCode
  }
  return undefined
}
