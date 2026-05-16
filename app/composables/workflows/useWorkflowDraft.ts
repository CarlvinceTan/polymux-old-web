import type { Ref } from 'vue'
import type { SessionHandle } from '~/composables/workflows/useWorkflowSession'
import type { WorkflowGraph } from '~/composables/workflows/useWorkflows'
import type { WorkflowOp } from '~/composables/workflows/useWorkflowMutations'
import { applyOp } from '~/composables/workflows/useWorkflowMutations'

interface DraftPatchEvent {
  before_revision: number
  after_revision: number
  op: WorkflowOp
  snapshot: WorkflowGraph | null
}

function emptyGraph(): WorkflowGraph {
  return { nodes: [], wires: [] }
}

// Mirrors the orchestrator's in-progress workflow graph from the server's
// `workflow_draft` event into shared state, scoped per-session so different
// workflows in different tabs don't bleed. Bound at the page level so
// updates keep arriving while the user is in chat or viewport view and
// `WorkflowNodeCanvas` is unmounted.
export function useWorkflowDraft(session: SessionHandle, sessionId: Ref<string> | string) {
  const id = typeof sessionId === 'string' ? sessionId : sessionId.value
  const graphKey = `workflow-draft-graph:${id}`
  const tickKey = `workflow-draft-tick:${id}`
  const revKey = `workflow-draft-rev:${id}`
  const lastOpKey = `workflow-draft-last-op:${id}`

  const draftGraph = useState<WorkflowGraph>(graphKey, () => emptyGraph())
  const lastDraftAt = useState<number>(tickKey, () => 0)
  const draftRevision = useState<number>(revKey, () => 0)
  // Exposed so the canvas can flash recently-touched nodes/wires.
  const lastDraftOp = useState<WorkflowOp | null>(lastOpKey, () => null)

  const onDraft = (p: { graph: WorkflowGraph | null }) => {
    draftGraph.value = (p?.graph && Array.isArray(p.graph.nodes)) ? p.graph : emptyGraph()
    lastDraftAt.value = Date.now()
  }

  // `workflow_draft_patch` carries an op envelope so we can replay it
  // locally with a flash animation rather than swap the whole graph. The
  // full `snapshot` is the recovery fallback — if applyOp rejects (because
  // the client is out of sync) we restore from it.
  const onDraftPatch = (p: DraftPatchEvent) => {
    if (!p) return
    const r = applyOp(draftGraph.value, p.op)
    if (r.ok) {
      draftGraph.value = r.graph
    }
    else if (p.snapshot && Array.isArray(p.snapshot.nodes)) {
      draftGraph.value = p.snapshot
    }
    draftRevision.value = p.after_revision
    lastDraftAt.value = Date.now()
    lastDraftOp.value = p.op
  }

  session.on<{ graph: WorkflowGraph | null }>('workflow_draft', onDraft)
  session.on<DraftPatchEvent>('workflow_draft_patch', onDraftPatch)

  // Hydrate from session_state on initial connect / reconnect so a refresh
  // mid-turn doesn't leave the workflow view blank until the next mutation.
  const stop = watch(session.sessionState, (state) => {
    if (!state) return
    const initial = (state as { workflow_draft?: WorkflowGraph }).workflow_draft
    if (initial && Array.isArray(initial.nodes)) {
      draftGraph.value = initial
      lastDraftAt.value = Date.now()
    }
  }, { immediate: true })

  onScopeDispose(() => {
    session.off('workflow_draft', onDraft)
    session.off('workflow_draft_patch', onDraftPatch)
    stop()
  })

  return { draftGraph, lastDraftAt, draftRevision, lastDraftOp }
}
