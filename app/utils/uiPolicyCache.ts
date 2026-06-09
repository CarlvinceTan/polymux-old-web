/**
 * Durable UI policy snapshots for seamless cold loads. Authoritative enforcement
 * still comes from the server / fresh PostHog `/decide`; these values only seed
 * the first paint and avoid show-then-hide flicker on repeat visits.
 */

const LIMIT_POLICY_KEY = 'polymux_limit_policy'
const WORKSPACE_PLANS_KEY = 'polymux_workspace_plans'
const WORKSPACE_MEMBER_COUNTS_KEY = 'polymux_workspace_member_counts'
const FEATURE_FLAGS_KEY = 'polymux_feature_flags_cache'

const LIMIT_POLICY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FEATURE_FLAGS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface LimitPolicySnapshot {
  workspaceId: string
  workspacePlan: string
  planLimitsEnforced: boolean
  browserAgentCap: number
  updatedAt: number
}

type WorkspacePlanCache = Record<string, { plan: string, name?: string, updatedAt: number }>
type WorkspaceMemberCountCache = Record<string, { count: number, updatedAt: number }>

type FeatureFlagsCache = {
  flags: Record<string, boolean>
  updatedAt: number
}

function readJson<T>(key: string): T | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  }
  catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {}
}

export function readLimitPolicySnapshot(workspaceId: string | null | undefined): LimitPolicySnapshot | null {
  if (!workspaceId) return null
  const snap = readJson<LimitPolicySnapshot>(LIMIT_POLICY_KEY)
  if (!snap || snap.workspaceId !== workspaceId) return null
  if (Date.now() - snap.updatedAt > LIMIT_POLICY_TTL_MS) return null
  return snap
}

export function writeLimitPolicySnapshot(
  snapshot: Omit<LimitPolicySnapshot, 'updatedAt'>,
) {
  writeJson(LIMIT_POLICY_KEY, { ...snapshot, updatedAt: Date.now() })
}

export function readCachedWorkspacePlan(workspaceId: string | null | undefined): string | null {
  if (!workspaceId) return null
  const cache = readJson<WorkspacePlanCache>(WORKSPACE_PLANS_KEY)
  const entry = cache?.[workspaceId]
  if (!entry?.plan) return null
  return entry.plan
}

export function readCachedWorkspaceName(workspaceId: string | null | undefined): string | null {
  if (!workspaceId) return null
  const cache = readJson<WorkspacePlanCache>(WORKSPACE_PLANS_KEY)
  const name = cache?.[workspaceId]?.name
  return name?.trim() ? name : null
}

export function writeCachedWorkspacePlan(workspaceId: string, plan: string) {
  if (!workspaceId || !plan) return
  const cache = readJson<WorkspacePlanCache>(WORKSPACE_PLANS_KEY) ?? {}
  cache[workspaceId] = { plan, updatedAt: Date.now() }
  writeJson(WORKSPACE_PLANS_KEY, cache)
}

export function writeCachedWorkspacePlans(workspaces: Array<{ id: string, plan: string, name?: string }>) {
  if (!workspaces.length) return
  const cache = readJson<WorkspacePlanCache>(WORKSPACE_PLANS_KEY) ?? {}
  const now = Date.now()
  for (const ws of workspaces) {
    if (!ws.id || !ws.plan) continue
    const prev = cache[ws.id]
    cache[ws.id] = {
      plan: ws.plan,
      name: ws.name?.trim() || prev?.name,
      updatedAt: now,
    }
  }
  writeJson(WORKSPACE_PLANS_KEY, cache)
}

/** No TTL — survives reload and sign-in; cleared only via `clearUiPolicyCache` on sign-out. */
export function readCachedMemberCount(workspaceId: string | null | undefined): number | null {
  if (!workspaceId) return null
  const cache = readJson<WorkspaceMemberCountCache>(WORKSPACE_MEMBER_COUNTS_KEY)
  const entry = cache?.[workspaceId]
  if (entry === undefined || entry.count === undefined) return null
  return entry.count
}

export function writeCachedMemberCount(workspaceId: string, count: number) {
  if (!workspaceId || count < 0) return
  const cache = readJson<WorkspaceMemberCountCache>(WORKSPACE_MEMBER_COUNTS_KEY) ?? {}
  cache[workspaceId] = { count, updatedAt: Date.now() }
  writeJson(WORKSPACE_MEMBER_COUNTS_KEY, cache)
}

export function readCachedFeatureFlag(flagName: string): boolean | null {
  const cache = readJson<FeatureFlagsCache>(FEATURE_FLAGS_KEY)
  if (!cache) return null
  if (Date.now() - cache.updatedAt > FEATURE_FLAGS_TTL_MS) return null
  if (!(flagName in cache.flags)) return null
  return cache.flags[flagName]!
}

export function writeCachedFeatureFlags(flags: Record<string, boolean>) {
  if (!Object.keys(flags).length) return
  writeJson(FEATURE_FLAGS_KEY, { flags, updatedAt: Date.now() } satisfies FeatureFlagsCache)
}

export function clearUiPolicyCache() {
  if (!import.meta.client) return
  try {
    localStorage.removeItem(LIMIT_POLICY_KEY)
    localStorage.removeItem(WORKSPACE_PLANS_KEY)
    localStorage.removeItem(WORKSPACE_MEMBER_COUNTS_KEY)
    localStorage.removeItem(FEATURE_FLAGS_KEY)
  }
  catch {}
}

/** Resolve workspace plan from live data or the plan cache. */
export function resolveWorkspacePlan(
  workspaceId: string | null | undefined,
  livePlan?: string | null,
): string | null {
  if (livePlan) return livePlan
  return readCachedWorkspacePlan(workspaceId)
}

/** Seed browser-agent cap UI before WS / PostHog resolve. */
export function resolveInitialBrowserAgentCap(
  workspaceId: string | null | undefined,
  livePlan?: string | null,
): { cap: number, resolved: boolean } {
  const cached = readLimitPolicySnapshot(workspaceId)
  if (cached) {
    return {
      cap: cached.planLimitsEnforced ? cached.browserAgentCap : 0,
      resolved: true,
    }
  }
  return { cap: 0, resolved: false }
}
