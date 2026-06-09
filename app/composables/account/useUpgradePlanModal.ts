import { computed, ref } from 'vue'
import type { UpgradePlanPayload, UpgradePlanReason } from '~/types/upgradePlan'
import type { PlanUpgradePlanKey } from '~/composables/account/usePlanUpgradeNavigation'
import { useAppToast } from '~/composables/ui/useAppToast'
import { useMeFeatures } from '~/composables/account/useMeFeatures'

const modalState = ref<{ open: boolean, payload: UpgradePlanPayload | null }>({
  open: false,
  payload: null,
})

/**
 * Optional presenter the chat page registers so plan-limit prompts surface as
 * in-chat cards instead of the modal overlay while the chat view is visible.
 * Returns true when it has presented the prompt (the modal is then skipped);
 * false to fall through to the modal — e.g. when the user is in the viewport or
 * flow view where the message stream isn't the visible surface.
 */
type UpgradeChatPresenter = (payload: UpgradePlanPayload) => boolean
let chatPresenter: UpgradeChatPresenter | null = null

/**
 * Register the in-chat presenter and get back an unregister fn. The unregister
 * is identity-safe: it only clears the slot if `fn` is still the active
 * presenter, so a workflow remount (new page mounts before the old unmounts on
 * an id change) can't have the outgoing page null out the incoming one.
 */
export function registerUpgradeChatPresenter(fn: UpgradeChatPresenter): () => void {
  chatPresenter = fn
  return () => {
    if (chatPresenter === fn) chatPresenter = null
  }
}

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

/**
 * Surface the plan-limit prompt when plan limits are enforced. Prefers the
 * in-chat card (when the chat presenter is registered and accepts it) and
 * falls back to the modal overlay. Returns true if either was shown.
 */
export function showUpgradePlanModal(payload: UpgradePlanPayload): boolean {
  const { isPlanLimitsEnforced } = useMeFeatures()
  if (!isPlanLimitsEnforced()) return false

  if (chatPresenter && chatPresenter(payload)) return true

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
