/**
 * SPA navigation to the in-app pricing page with workspace context in the query
 * string (matches Stripe checkout cancel_url and pricing.vue expectations).
 */

export type PlanUpgradePlanKey = 'free' | 'pro' | 'max' | 'enterprise'

/** Coerce any raw plan string (case/whitespace-insensitive) to a known plan key, defaulting to 'free'. */
export function normalizePlanKey(raw?: string | null): PlanUpgradePlanKey {
  const v = (raw ?? '').toLowerCase().trim()
  return v === 'pro' || v === 'max' || v === 'enterprise' || v === 'free' ? v : 'free'
}

export function usePlanUpgradeNavigation() {
  const { currentWorkspace, currentWorkspaceId } = useWorkspaces()

  const planKey = computed<PlanUpgradePlanKey>(() =>
    normalizePlanKey(currentWorkspace.value?.plan as string | undefined),
  )

  const pricingUpgradeQuery = computed(() => {
    const q: Record<string, string> = { current: planKey.value }
    if (currentWorkspaceId.value)
      q.workspaceId = currentWorkspaceId.value
    return q
  })

  function navigateToPricing() {
    return navigateTo({ path: '/pricing', query: pricingUpgradeQuery.value })
  }

  return { planKey, pricingUpgradeQuery, navigateToPricing }
}
