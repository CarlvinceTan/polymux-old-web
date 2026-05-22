import { PostHog } from 'posthog-node'

let client: PostHog | null = null

export function useServerPostHog(): PostHog {
  if (!client) {
    const config = useRuntimeConfig()
    const publicKey = config.public.posthogPublicKey as string
    const host = config.public.posthogHost as string
    if (!publicKey) {
      // Return a no-op client when PostHog is not configured (e.g. local dev).
      client = new PostHog('no-op', { host, flushAt: 1, flushInterval: 0 })
      client.disable()
    }
    else {
      client = new PostHog(publicKey, { host })
    }
  }
  return client
}
