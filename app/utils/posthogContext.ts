// Helpers to thread PostHog browser session context into polymux API calls.
// WebSocket upgrades do not get posthog-js tracing headers automatically.

type PostHogLike = {
  get_session_id?: () => string
  get_distinct_id?: () => string
}

function posthogClient(): PostHogLike | null {
  if (!import.meta.client) return null
  try {
    return (useNuxtApp().$posthog ?? null) as PostHogLike | null
  } catch {
    return null
  }
}

export function getPostHogBrowserSessionId(): string {
  return posthogClient()?.get_session_id?.() ?? ''
}

export function getPostHogDistinctId(): string {
  return posthogClient()?.get_distinct_id?.() ?? ''
}

/** Hostnames that should receive X-POSTHOG-* tracing headers on fetch. */
export function posthogTracingHeaderHosts(serverUrl: string): string[] {
  const hosts = new Set(['localhost', '127.0.0.1', 'polymux.com', 'polymux.co'])
  try {
    const h = new URL(serverUrl).hostname
    if (h) hosts.add(h)
  } catch {
    // ignore invalid serverUrl during dev
  }
  return [...hosts]
}
