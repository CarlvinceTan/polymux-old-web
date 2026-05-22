import { ref, type Ref } from 'vue'

/**
 * Per-workflow thumbs-up / thumbs-down state for assistant bubbles. The Map
 * is keyed by message id and only stores entries the calling user has rated;
 * an absent key means "no rating". Mutations write through to the polymux
 * backend (POST/DELETE /sessions/{id}/messages/{messageId}/feedback) and the
 * local map updates optimistically — failures roll back so the UI reflects
 * the durable state. The backend emits a matching PostHog $ai_metric event
 * when posthog.project_api_key is configured.
 */
export function useMessageFeedback(sessionId: string) {
  const { authFetch } = useAuthFetch()
  const feedback: Ref<Map<string, 'up' | 'down'>> = ref(new Map())

  async function load() {
    try {
      const rows = await authFetch<{ message_id: string, rating: 'up' | 'down' }[]>(
        `/sessions/${sessionId}/feedback`,
      )
      const next = new Map<string, 'up' | 'down'>()
      for (const r of rows) next.set(r.message_id, r.rating)
      feedback.value = next
    } catch (err) {
      // A draft session has no row yet so feedback is empty by definition;
      // 403/404 here is benign noise.
      const status = (err as { status?: number })?.status
      if (status !== 403 && status !== 404) {
        console.error('[useMessageFeedback] load failed', err)
      }
    }
  }

  async function setRating(messageId: string, rating: 'up' | 'down' | null) {
    const prev = feedback.value.get(messageId) ?? null
    if (prev === rating) return

    // Optimistic update so the toggle responds immediately; revert on failure.
    const next = new Map(feedback.value)
    if (rating === null) next.delete(messageId)
    else next.set(messageId, rating)
    feedback.value = next

    try {
      if (rating === null) {
        await authFetch(`/sessions/${sessionId}/messages/${messageId}/feedback`, {
          method: 'DELETE',
        })
      } else {
        await authFetch(`/sessions/${sessionId}/messages/${messageId}/feedback`, {
          method: 'POST',
          body: JSON.stringify({ rating }),
        })
      }
    } catch (err) {
      console.error('[useMessageFeedback] persist failed', err)
      const rollback = new Map(feedback.value)
      if (prev === null) rollback.delete(messageId)
      else rollback.set(messageId, prev)
      feedback.value = rollback
    }
  }

  return { feedback, load, setRating }
}
