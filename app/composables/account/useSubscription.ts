import { toValue, type MaybeRefOrGetter } from 'vue'

// Mirror of the server's SubscriptionStatus (server/utils/billing/subscriptionState.ts).
// These routes are Nuxt server routes (/api/stripe/*) hit with same-origin
// `$fetch`, which carries the Supabase auth cookie the routes authenticate with.
export interface SubscriptionStatus {
  plan: string
  status: string | null
  billingPeriod: string | null
  /** ISO timestamp of the current period end, or null when not subscribed. */
  currentPeriodEnd: string | null
  /** True when the plan is set to revert to free at period end. */
  cancelAtPeriodEnd: boolean
  /** Lower paid plan scheduled to take over at period end (paid→paid), or null. */
  scheduledPlan: string | null
  hasSubscription: boolean
}

function extractError(e: unknown): string {
  const err = e as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string } | null
  return err?.data?.statusMessage || err?.statusMessage || err?.data?.message || err?.message || 'Something went wrong. Please try again.'
}

/**
 * Subscription status + management actions for a workspace. `workspaceId` may be
 * a ref, computed, or getter; actions are no-ops until it resolves. Each action
 * returns whether it succeeded and refreshes `status` from the server response.
 */
export function useSubscription(workspaceId: MaybeRefOrGetter<string | null | undefined>) {
  const status = ref<SubscriptionStatus | null>(null)
  const loading = ref(false)
  const actionLoading = ref(false)
  const error = ref('')

  async function fetchStatus() {
    const id = toValue(workspaceId)
    if (!id) {
      status.value = null
      return
    }
    loading.value = true
    error.value = ''
    try {
      status.value = await $fetch<SubscriptionStatus>('/api/stripe/subscription', {
        query: { workspaceId: id },
      })
    }
    catch (e) {
      console.warn('[useSubscription] fetchStatus failed', e)
      status.value = null
    }
    finally {
      loading.value = false
    }
  }

  async function runAction(path: string, body: Record<string, unknown>): Promise<boolean> {
    const id = toValue(workspaceId)
    if (!id) return false
    actionLoading.value = true
    error.value = ''
    try {
      status.value = await $fetch<SubscriptionStatus>(path, {
        method: 'POST',
        body: { ...body, workspaceId: id },
      })
      return true
    }
    catch (e) {
      error.value = extractError(e)
      return false
    }
    finally {
      actionLoading.value = false
    }
  }

  /** Schedule cancellation at period end (→ free). */
  function cancel() {
    return runAction('/api/stripe/cancel-subscription', {})
  }

  /** Schedule a paid→paid downgrade (e.g. 'pro') at period end. */
  function downgrade(targetPlan: string) {
    return runAction('/api/stripe/downgrade-subscription', { targetPlan })
  }

  /** Undo a pending cancellation or downgrade. */
  function resume() {
    return runAction('/api/stripe/resume-subscription', {})
  }

  return { status, loading, actionLoading, error, fetchStatus, cancel, downgrade, resume }
}
