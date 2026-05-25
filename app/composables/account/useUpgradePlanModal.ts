import { computed, ref } from 'vue'
import type { UpgradePlanPayload, UpgradePlanReason } from '~/types/upgradePlan'
import type { PlanUpgradePlanKey } from '~/composables/account/usePlanUpgradeNavigation'
import { useAppToast } from '~/composables/ui/useAppToast'
import { useMeFeatures } from '~/composables/account/useMeFeatures'

const modalState = ref<{ open: boolean, payload: UpgradePlanPayload | null }>({
  open: false,
  payload: null,
})

const NEXT_PLAN: Record<PlanUpgradePlanKey, PlanUpgradePlanKey | null> = {
  free: 'pro',
  pro: 'max',
  max: 'enterprise',
  enterprise: null,
}

export function useUpgradePlanModal() {
  const open = computed(() => modalState.value.open)
  const payload = computed(() => modalState.value.payload)

  function dismiss() {
    const onDismiss = modalState.value.payload?.onDismiss
    modalState.value = { open: false, payload: null }
    onDismiss?.()
  }

  return { open, payload, dismiss }
}

/** Show the upgrade plan modal when plan limits are enforced. Returns true if shown. */
export function showUpgradePlanModal(payload: UpgradePlanPayload): boolean {
  const { isPlanLimitsEnforced } = useMeFeatures()
  if (!isPlanLimitsEnforced()) return false

  modalState.value = { open: true, payload }
  return true
}

/** Prefer the upgrade modal; fall back to a toast when plan limits are disabled. */
export function promptUpgrade(
  payload: UpgradePlanPayload,
  fallback: { message: string, duration?: number },
): void {
  if (showUpgradePlanModal(payload)) return
  useAppToast().show(fallback.message, 'warning', fallback.duration ?? 8000)
}

export function suggestedUpgradePlan(currentPlan?: string | null): PlanUpgradePlanKey | null {
  const raw = (currentPlan ?? 'free').toLowerCase().trim()
  const key: PlanUpgradePlanKey =
    raw === 'pro' || raw === 'max' || raw === 'enterprise' || raw === 'free' ? raw : 'free'
  return NEXT_PLAN[key]
}

export function upgradePlanReasonKey(reason: UpgradePlanReason): string {
  switch (reason) {
    case 'weekly_token_budget':
      return 'upgradePlan.reasons.weeklyTokenBudget'
    case 'browser_agent_limit':
      return 'upgradePlan.reasons.browserAgentLimit'
    case 'member_limit':
      return 'upgradePlan.reasons.memberLimit'
    case 'cloud_storage':
      return 'upgradePlan.reasons.cloudStorage'
    case 'feature_locked':
      return 'upgradePlan.reasons.featureLocked'
  }
}
