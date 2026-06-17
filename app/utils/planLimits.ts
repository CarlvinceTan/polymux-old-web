// The cap maps live in server/utils/billing/planLimits.ts (the enforcement
// side, and the authoritative mirror of the Go `PlanConfig`). We re-export them
// here so the caps the UI *displays* can never drift from what the server
// *enforces*. That module is pure data + helpers with no server-only imports,
// so it is safe to pull into the client bundle (same pattern as
// useCustomTabs importing `~~/server/utils/integrations/layoutSections`).
import {
  PLAN_BROWSER_AGENT_CAPS,
  PLAN_TOKEN_BUDGET_WEEKLY,
  PLAN_WORKFLOW_RUNS_MONTHLY,
  PLAN_MAX_MEMBERS,
  PLAN_FILE_BYTES,
} from '~~/server/utils/billing/planLimits'

export {
  PLAN_BROWSER_AGENT_CAPS,
  PLAN_TOKEN_BUDGET_WEEKLY,
  PLAN_WORKFLOW_RUNS_MONTHLY,
  PLAN_MAX_MEMBERS,
}
/** Max uploaded file size per plan — mirrors `session.Plans[..].FileBytes` in polymux Go. */
export { PLAN_FILE_BYTES as PLAN_MAX_FILE_UPLOAD_BYTES }

export function browserAgentCapFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_BROWSER_AGENT_CAPS.free!
  return PLAN_BROWSER_AGENT_CAPS[plan] ?? PLAN_BROWSER_AGENT_CAPS.free!
}

export function tokenBudgetWeeklyFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_TOKEN_BUDGET_WEEKLY.free!
  return PLAN_TOKEN_BUDGET_WEEKLY[plan] ?? PLAN_TOKEN_BUDGET_WEEKLY.free!
}

export function maxMembersFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_MAX_MEMBERS.free!
  return PLAN_MAX_MEMBERS[plan] ?? PLAN_MAX_MEMBERS.free!
}

export function maxFileUploadBytesFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_FILE_BYTES.free!
  const key = plan.toLowerCase().trim()
  return PLAN_FILE_BYTES[key] ?? PLAN_FILE_BYTES.free!
}

export function workflowRunsMonthlyCapFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_WORKFLOW_RUNS_MONTHLY.free!
  const key = plan.toLowerCase().trim()
  return PLAN_WORKFLOW_RUNS_MONTHLY[key] ?? PLAN_WORKFLOW_RUNS_MONTHLY.free!
}
