/**
 * SPA navigation to the in-app pricing page with workspace context in the query
 * string (matches Stripe checkout cancel_url and pricing.vue expectations).
 */

export type PlanUpgradePlanKey = 'free' | 'pro' | 'max' | 'enterprise'

export function usePlanUpgradeNavigation() {
  const { currentWorkspace, currentWorkspaceId } = useWorkspaces()

  const planKey = computed<PlanUpgradePlanKey>(() => {
    const raw = (currentWorkspace.value?.plan as string | undefined)?.toLowerCase().trim() ?? ''
    if (raw === 'pro' || raw === 'max' || raw === 'enterprise' || raw === 'free')
      return raw
    return 'free'
  })

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
