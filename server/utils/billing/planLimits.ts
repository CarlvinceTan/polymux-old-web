const MB = 1024 * 1024
const GB = 1024 * MB

// 0 means "feature unavailable on this plan" (Free has no Cloud allocation).
// A null in the planLimits map would express the same intent but `0` keeps
// arithmetic comparisons (used+size > cap) safe without nullish handling
// across the codebase. Enterprise still uses a finite-but-very-large cap;
// we'll bump it explicitly if the contract grows past 200 GB cloud / 20 GB
// artifacts.

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

export const PLAN_PRIORITY_SUPPORT: Record<string, boolean> = {
  free: false,
  pro: false,
  max: true,
  enterprise: true,
}

// Workflow artifact gallery cap (B2 artifacts/ prefix). Every plan has a
// fixed quota — the agent surfaces ARTIFACT_QUOTA_EXCEEDED when crossed.
export const PLAN_ARTIFACT_BYTES: Record<string, number> = {
  free: 50 * MB,
  pro: 200 * MB,
  max: 2 * GB,
  enterprise: 20 * GB,
}

// Polymux-managed "Cloud" persistent storage (B2 workspaces/ prefix). Free
// gets none — those users must connect Drive or stay on local (OPFS).
export const PLAN_CLOUD_BYTES: Record<string, number> = {
  free: 0,
  pro: 2 * GB,
  max: 20 * GB,
  enterprise: 200 * GB,
}

// Per-file upload cap. Independent of backend choice — applies to Drive,
// Cloud (B2), and Local uploads. Keeps a single very-large upload from
// blocking the request handler.
export const PLAN_FILE_BYTES: Record<string, number> = {
  free: 100 * MB,
  pro: 5 * GB,
  max: 20 * GB,
  enterprise: 100 * GB,
}

export function browserAgentCap(plan: string): number {
  return PLAN_BROWSER_AGENT_CAPS[plan] ?? PLAN_BROWSER_AGENT_CAPS.free!
}

export function fileCap(plan: string): number {
  return PLAN_FILE_BYTES[plan] ?? PLAN_FILE_BYTES.free!
}

export function artifactCap(plan: string): number {
  return PLAN_ARTIFACT_BYTES[plan] ?? PLAN_ARTIFACT_BYTES.free!
}

// cloudCap returns the per-workspace Cloud (B2-backed persistent storage)
// byte quota for the given plan. Zero means "feature not available"; upload
// endpoints should refuse B2-backed writes when the cap is 0.
export function cloudCap(plan: string): number {
  return PLAN_CLOUD_BYTES[plan] ?? PLAN_CLOUD_BYTES.free!
}

export function tokenBudgetWeekly(plan: string): number {
  return PLAN_TOKEN_BUDGET_WEEKLY[plan] ?? PLAN_TOKEN_BUDGET_WEEKLY.free!
}

export function tokenRatePerMinute(plan: string): number {
  return PLAN_TOKEN_RATE_PER_MINUTE[plan] ?? PLAN_TOKEN_RATE_PER_MINUTE.free!
}

export function workflowRunsMonthly(plan: string): number {
  return PLAN_WORKFLOW_RUNS_MONTHLY[plan] ?? PLAN_WORKFLOW_RUNS_MONTHLY.free!
}

export function maxMembers(plan: string): number {
  return PLAN_MAX_MEMBERS[plan] ?? PLAN_MAX_MEMBERS.free!
}

// LLM providers supported for BYOK. Keep in sync with the
// workspace_llm_keys.provider check constraint in the migration. The Go
// model factory accepts the same three values via ProviderConfig.Type.
export const VALID_LLM_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
export type LLMProvider = (typeof VALID_LLM_PROVIDERS)[number]

export function isValidProvider(p: string): p is LLMProvider {
  return (VALID_LLM_PROVIDERS as readonly string[]).includes(p)
}
