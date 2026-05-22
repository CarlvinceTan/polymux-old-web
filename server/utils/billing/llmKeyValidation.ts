// Validation helpers for workspace BYOK LLM keys.

/** Normalize an optional api_base to a canonical https URL or null. */
export function normalizeApiBase(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Drop trailing slashes so cache keys and display stay stable.
    return url.toString().replace(/\/+$/, '')
  }
  catch {
    return null
  }
}

/** Returns null when unset, a normalized URL when valid, or 'invalid'. */
export function parseApiBase(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && !raw.trim()) return null
  const normalized = normalizeApiBase(raw)
  if (normalized === null) return 'invalid'
  return normalized
}
