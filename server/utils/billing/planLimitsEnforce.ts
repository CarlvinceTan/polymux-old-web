import { useServerPostHog } from '~~/server/utils/posthog'

// Reads the `plan_limits` PostHog flag. Defaults to true (enforce) when
// PostHog is unconfigured or the flag is indeterminate — fail-safe.
export async function planLimitsEnforce(): Promise<boolean> {
  try {
    const enabled = await useServerPostHog().isFeatureEnabled('plan_limits', 'server')
    return enabled !== false
  }
  catch {
    return true
  }
}
