export const PLAN_BROWSER_AGENT_CAPS: Record<string, number> = {
  free: 2,
  pro: 8,
  max: 20,
  enterprise: 50,
}

export function browserAgentCap(plan: string): number {
  return PLAN_BROWSER_AGENT_CAPS[plan] ?? PLAN_BROWSER_AGENT_CAPS.free!
}
