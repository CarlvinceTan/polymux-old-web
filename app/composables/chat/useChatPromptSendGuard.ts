import type { Ref } from 'vue'
import { useAgentConfig } from '~/composables/account/useAgentConfig'
import { useMeFeatures } from '~/composables/account/useMeFeatures'
import { useAppToast } from '~/composables/ui/useAppToast'
import { promptUpgrade } from '~/composables/account/useUpgradePlanModal'
import { tokenBudgetWeeklyFromPlan } from '~/utils/planLimits'
import { weekStartUtc } from '~/utils/weekStartUtc'

function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Conservative overhead for a single turn (system prompt context, tool
 * schemas, a short assistant reply). The real number varies wildly by model
 * and conversation length but 2 000 keeps us safely within ~97 % of the cap
 * on the free plan before the server ever starts the LLM call.
 */
const MIN_RESPONSE_OVERHEAD = 2_000

/** How long a cached usage value is trusted before we re-fetch from Supabase. */
const CACHE_TTL_MS = 30_000

/** Module-level cache keyed by workspace id. */
const usageCache = new Map<string, { used: number; fetchedAt: number }>()

/**
 * Workspaces the server has explicitly told us are over the weekly cap (via
 * a TOKEN_BUDGET_EXCEEDED frame). Once a workspace lands in this set every
 * subsequent send is blocked client-side without hitting the WS, regardless
 * of the Supabase RPC result. Cleared by `clearStickyOverBudget` (called
 * from the prompt-input retry affordance) or on page reload.
 *
 * Why we need this in addition to `usageCache`: Supabase reflects the flushed
 * floor, not the polymux server's in-memory counter. The server can be over
 * cap before the next 5 s flush lands, so the RPC keeps reporting "OK" and
 * the pre-flight keeps green-lighting wasted sends. Once the server has told
 * us "over cap" we believe it until proven otherwise.
 */
const stickyOverBudget = new Set<string>()

/**
 * Blocks composer sends when the heuristic per-message token cap is exceeded or
 * the workspace's recorded weekly usage + estimated turn cost would breach the
 * plan cap.
 *
 * The guard caches the last-known usage from the Supabase RPC and optimistically
 * increments it on every send that passes, so consecutive rapid sends don't all
 * slip through the async fetch window. The cache is invalidated whenever a
 * TOKEN_BUDGET_EXCEEDED WS error arrives (see `invalidateUsageCache`).
 */
export function useChatPromptSendGuard(
  workspaceId: Ref<string>,
  plan: Ref<string | null | undefined>,
) {
  const toast = useAppToast()
  const { t } = useI18n()
  const { inputTokenCap } = useAgentConfig()
  const { isPlanLimitsEnforced } = useMeFeatures()
  const supabase = useSupabaseClient()

  /**
   * Synchronous, in-memory-only gate. Returns immediately — safe to call on
   * the hot path (e.g. before applying optimistic chat UI) because it never
   * awaits a network round-trip. Covers:
   *   - per-message input-token cap (model-config heuristic)
   *   - sticky-over-budget flag set by a prior TOKEN_BUDGET_EXCEEDED frame
   */
  function canSendPromptSync(text: string): boolean {
    const trimmed = text.trim()
    const capLocal = inputTokenCap.value
    if (capLocal && capLocal > 0 && trimmed.length > 0) {
      const estimated = estimatePromptTokens(trimmed)
      if (estimated > capLocal) {
        toast.show(t('chat.tokenCapExceeded', { tokens: estimated, cap: capLocal }), 'warning')
        return false
      }
    }

    const wid = workspaceId.value?.trim()
    if (!wid) return true

    // Mirrors the polymux server: when the `plan_limits` flag is off, the
    // backend bypasses budgetLimitedModel, so the frontend pre-flight check
    // must also stand down — otherwise the toast fires while the request
    // itself would have succeeded.
    if (!isPlanLimitsEnforced()) return true

    // Sticky cap: the server has already rejected at least one send this
    // page-load with TOKEN_BUDGET_EXCEEDED. Block here so the spinner never
    // even starts — the user has to dismiss the modal (which clears the flag)
    // before they can try again, and a stale Supabase floor can't quietly
    // wave through another doomed send.
    if (stickyOverBudget.has(wid)) {
      promptUpgrade(
        { reason: 'weekly_token_budget' },
        { message: t('chat.weeklyTokenBudgetToastFallback'), duration: 12_000 },
      )
      return false
    }

    return true
  }

  /**
   * Async weekly-cap pre-flight. Runs the Supabase RPC (with cache) and
   * optimistically increments the cache on success so consecutive rapid
   * sends see the projected spend. Designed to run AFTER the optimistic UI
   * has applied — callers should roll back the optimistic state when this
   * returns false. Always returns true when the workspace is unset or the
   * `plan_limits` feature is off.
   */
  async function canSendPromptAsync(text: string): Promise<boolean> {
    const wid = workspaceId.value?.trim()
    if (!wid) return true
    if (!isPlanLimitsEnforced()) return true

    const weeklyCap = tokenBudgetWeeklyFromPlan(plan.value ?? null)
    if (weeklyCap <= 0) return true

    const trimmed = text.trim()
    const turnEstimate = estimatePromptTokens(trimmed) + MIN_RESPONSE_OVERHEAD

    try {
      const used = await resolveUsage(wid)

      if (used + turnEstimate >= weeklyCap) {
        promptUpgrade(
          { reason: 'weekly_token_budget' },
          { message: t('chat.weeklyTokenBudgetToastFallback'), duration: 12_000 },
        )
        return false
      }

      // Optimistic increment so the next rapid send sees the projected spend.
      bumpCachedUsage(wid, turnEstimate)
    }
    catch (e) {
      console.warn('[useChatPromptSendGuard] weekly check failed:', e)
      return true
    }

    return true
  }

  /**
   * Combined sync + async gate. Use when the caller doesn't need an
   * instant optimistic-UI path (e.g. the general-chat welcome suggestion
   * send).
   * For the in-chat path, call `canSendPromptSync` before applying the
   * optimistic update and `canSendPromptAsync` after, rolling back on
   * rejection.
   */
  async function canSendPrompt(text: string): Promise<boolean> {
    if (!canSendPromptSync(text)) return false
    return canSendPromptAsync(text)
  }

  /**
   * Returns the current weekly usage, preferring a fresh cache hit over a
   * Supabase RPC round-trip. On RPC failure the function falls back to the
   * stale cache (if any) and, failing that, returns 0 (fail-open).
   */
  async function resolveUsage(wid: string): Promise<number> {
    const cached = usageCache.get(wid)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.used
    }

    try {
      const weekStart = weekStartUtc()
      const { data, error } = await (supabase as unknown as RpcCapable).rpc('get_workspace_token_usage', {
        p_workspace_id: wid,
        p_week_start: weekStart.toISOString(),
      })
      if (error) {
        console.warn('[useChatPromptSendGuard] get_workspace_token_usage:', error.message)
        return cached?.used ?? 0
      }
      const raw = typeof data === 'bigint' ? Number(data) : Number(data ?? 0)
      const used = Number.isFinite(raw) ? raw : 0
      usageCache.set(wid, { used, fetchedAt: Date.now() })
      return used
    }
    catch (e) {
      console.warn('[useChatPromptSendGuard] RPC failed, using cache:', e)
      return cached?.used ?? 0
    }
  }

  return { canSendPrompt, canSendPromptSync, canSendPromptAsync }
}

/**
 * Optimistically add `delta` tokens to the cached usage for `wid` so
 * consecutive sends within the cache TTL see the accumulated spend.
 */
function bumpCachedUsage(wid: string, delta: number) {
  const entry = usageCache.get(wid)
  if (entry) {
    entry.used += delta
  }
}

/**
 * Invalidate the usage cache for a workspace — called when a
 * TOKEN_BUDGET_EXCEEDED WS error arrives so the next send re-fetches
 * the authoritative total from Supabase.
 */
export function invalidateUsageCache(workspaceId?: string) {
  if (workspaceId) {
    usageCache.delete(workspaceId)
  } else {
    usageCache.clear()
  }
}

/**
 * Mark a workspace as over-cap after the server has rejected a send with
 * TOKEN_BUDGET_EXCEEDED. Subsequent `canSendPrompt` calls return false
 * without hitting Supabase. Cleared via `clearStickyOverBudget`.
 */
export function markStickyOverBudget(workspaceId?: string) {
  if (!workspaceId) return
  stickyOverBudget.add(workspaceId)
}

/**
 * Clear the sticky over-budget flag — used by the budget-exceeded modal's
 * dismiss action, so the user can retry once they know the wall is real.
 * The very next send still has to clear the Supabase RPC check; if the
 * cap is genuinely exceeded the server will reject it again and we re-arm
 * the sticky flag.
 */
export function clearStickyOverBudget(workspaceId?: string) {
  if (!workspaceId) {
    stickyOverBudget.clear()
    return
  }
  stickyOverBudget.delete(workspaceId)
}
