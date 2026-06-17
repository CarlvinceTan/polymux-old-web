/**
 * Shared PostHog feature-flag resolution policy. Kept separate from
 * useMeFeatures so the posthog.client plugin can persist snapshots without
 * a circular import.
 */

export const STRICT_OPT_IN_FLAGS = new Set([
  'wallet',
  'chrome_extension',
  'apple_login',
])

export const KNOWN_FEATURE_FLAGS = [
  'plan_limits',
  'account_access',
  'workflows',
  'vault',
  'integrations',
  'forum',
  'wallet',
  'chrome_extension',
  'apple_login',
] as const

type FeatureFlagReader = {
  isFeatureEnabled: (key: string) => boolean | undefined
}

export function resolveFeatureFlagValue(
  ph: FeatureFlagReader | null,
  key: string,
  ready: boolean,
  posthogDisabled = false,
): boolean {
  if (posthogDisabled) return true

  const strict = STRICT_OPT_IN_FLAGS.has(key)
  if (!ready) return strict ? false : true
  if (!ph) return strict ? false : true

  const value = ph.isFeatureEnabled(key)
  if (value === undefined) return strict ? false : true
  return Boolean(value)
}

export function snapshotKnownFeatureFlags(
  ph: FeatureFlagReader,
  ready: boolean,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  for (const key of KNOWN_FEATURE_FLAGS) {
    flags[key] = resolveFeatureFlagValue(ph, key, ready)
  }
  return flags
}
