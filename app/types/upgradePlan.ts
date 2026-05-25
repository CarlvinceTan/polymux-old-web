export type UpgradePlanReason =
  | 'weekly_token_budget'
  | 'browser_agent_limit'
  | 'member_limit'
  | 'cloud_storage'
  | 'feature_locked'

export interface UpgradePlanPayload {
  reason: UpgradePlanReason
  /** Optional server or caller-supplied detail line shown under the title. */
  message?: string
  cap?: number
  plan?: string
  onDismiss?: () => void
}
