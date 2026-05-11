export const PLAN_BROWSER_AGENT_CAPS: Record<string, number> = {
  free: 2,
  pro: 8,
  max: 20,
  enterprise: 50,
}

export function browserAgentCapFromPlan(plan?: string | null): number {
  if (!plan) return PLAN_BROWSER_AGENT_CAPS.free!
  return PLAN_BROWSER_AGENT_CAPS[plan] ?? PLAN_BROWSER_AGENT_CAPS.free!
}
