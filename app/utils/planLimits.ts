/** Max uploaded file size per plan — mirrors `session.Plans[..].FileBytes` in polymux Go. */
export const PLAN_MAX_FILE_UPLOAD_BYTES: Record<string, number> = {
  free: 100 * 1024 * 1024,
  pro: 5 * 1024 * 1024 * 1024,
  max: 20 * 1024 * 1024 * 1024,
  enterprise: 100 * 1024 * 1024 * 1024,
}

export const PLAN_BROWSER_AGENT_CAPS: Record<string, number> = {
  free: 2,
  pro: 8,
  max: 20,
  enterprise: 50,
}

export const PLAN_TOKEN_BUDGET_WEEKLY: Record<string, number> = {
  free: 100_000,
  pro: 2_000_000,
  max: 5_000_000,
  enterprise: 0, // unlimited
}

export const PLAN_TOKEN_RATE_PER_MINUTE: Record<string, number> = {
  free: 5_000,
  pro: 50_000,
  max: 200_000,
  enterprise: 1_000_000,
}

export const PLAN_WORKFLOW_RUNS_MONTHLY: Record<string, number> = {
  free: 50,
  pro: 500,
  max: 5_000,
  enterprise: 0, // unlimited
}

export const PLAN_MAX_MEMBERS: Record<string, number> = {
  free: 3,
  pro: 10,
  max: 50,
  enterprise: 0, // unlimited
}

export const PLAN_BYOK: Record<string, boolean> = {
  free: false,
  pro: true,
  max: true,
  enterprise: true,
}

export const PLAN_PRIORITY_SUPPORT: Record<string, boolean> = {
  free: false,
  pro: false,
  max: true,
  enterprise: true,
}

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

export function byokAllowedFromPlan(plan?: string | null): boolean {
  if (!plan) return PLAN_BYOK.free!
  return PLAN_BYOK[plan] ?? PLAN_BYOK.free!
}

export function maxFileUploadBytesFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_MAX_FILE_UPLOAD_BYTES.free!
  const key = plan.toLowerCase().trim()
  return PLAN_MAX_FILE_UPLOAD_BYTES[key] ?? PLAN_MAX_FILE_UPLOAD_BYTES.free!
}

export function workflowRunsMonthlyCapFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_WORKFLOW_RUNS_MONTHLY.free!
  const key = plan.toLowerCase().trim()
  return PLAN_WORKFLOW_RUNS_MONTHLY[key] ?? PLAN_WORKFLOW_RUNS_MONTHLY.free!
}
