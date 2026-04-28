import type { Ref } from 'vue'
import type { SessionHandle } from '~/composables/useSession'
import type { WorkflowStep } from '~/composables/useWorkflows'

// Mirrors the orchestrator's in-progress workflow tree from the server's
// `workflow_draft` event into shared state, scoped per-session so different
// workflows in different tabs don't bleed. Bound at the page level (see
// `pages/workflow/[id].vue`) so updates keep arriving while the user is in
// chat or viewport view and `WorkflowDock` is unmounted.
export function useWorkflowDraft(session: SessionHandle, sessionId: Ref<string> | string) {
  const id = typeof sessionId === 'string' ? sessionId : sessionId.value
  const stepsKey = `workflow-draft-steps:${id}`
  const tickKey = `workflow-draft-tick:${id}`

  const draftSteps = useState<WorkflowStep[]>(stepsKey, () => [])
  const lastDraftAt = useState<number>(tickKey, () => 0)

  const onDraft = (p: { steps: WorkflowStep[] | null }) => {
    draftSteps.value = Array.isArray(p?.steps) ? p.steps : []
    lastDraftAt.value = Date.now()
  }

  session.on<{ steps: WorkflowStep[] | null }>('workflow_draft', onDraft)

  // Hydrate from session_state on initial connect / reconnect so a refresh
  // mid-turn doesn't leave the workflow view blank until the next mutation.
  const stop = watch(session.sessionState, (state) => {
    if (!state) return
    const initial = (state as { workflow_draft?: WorkflowStep[] }).workflow_draft
    if (Array.isArray(initial)) {
      draftSteps.value = initial
      lastDraftAt.value = Date.now()
    }
  }, { immediate: true })

  onScopeDispose(() => {
    session.off('workflow_draft', onDraft)
    stop()
  })

  return { draftSteps, lastDraftAt }
}
