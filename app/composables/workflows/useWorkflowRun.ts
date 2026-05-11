import { onUnmounted, ref } from 'vue'
import type { SessionHandle } from './useWorkflowSession'
import type { WorkflowRunEventPayload } from '../types'
import type { WorkflowNodeState } from './useWorkflows'

// In-memory mirror of workflow_runs.node_states, updated as WS events arrive.
// Keyed by node_id; useful for painting timeline nodes without re-fetching.
export function useWorkflowRun(session: SessionHandle) {
  const activeRunId = ref<string | null>(null)
  const runStatus = ref<string | null>(null)
  const runError = ref<string | null>(null)
  const currentPath = ref<string[]>([])
  const nodeStates = ref<Record<string, WorkflowNodeState>>({})
  const lastEventAt = ref<string | null>(null)

  function patch(nodeID: string, fn: (cur: WorkflowNodeState) => WorkflowNodeState) {
    const cur = nodeStates.value[nodeID] ?? { status: 'pending' }
    nodeStates.value = { ...nodeStates.value, [nodeID]: fn(cur) }
  }

  function handleRunStarted(p: WorkflowRunEventPayload) {
    activeRunId.value = p.run_id
    runStatus.value = 'running'
    runError.value = null
    currentPath.value = p.path ?? []
    nodeStates.value = {}
    lastEventAt.value = p.occurred_at ?? null
  }

  function handleRunCompleted(p: WorkflowRunEventPayload) {
    runStatus.value = p.status ?? 'succeeded'
    runError.value = p.error || null
    currentPath.value = []
    lastEventAt.value = p.occurred_at ?? null
  }

  function handleNodeStarted(p: WorkflowRunEventPayload) {
    if (!p.node_id) return
    currentPath.value = p.path ?? []
    patch(p.node_id, cur => ({
      ...cur,
      status: 'running',
      started_at: p.occurred_at ?? cur.started_at,
    }))
    lastEventAt.value = p.occurred_at ?? null
  }

  function handleNodeCompleted(p: WorkflowRunEventPayload) {
    if (!p.node_id) return
    patch(p.node_id, cur => ({
      ...cur,
      status: p.status ?? 'succeeded',
      finished_at: p.occurred_at ?? cur.finished_at,
      error: p.error ?? cur.error,
    }))
    lastEventAt.value = p.occurred_at ?? null
  }

  function handleLoopIteration(p: WorkflowRunEventPayload) {
    if (!p.node_id) return
    patch(p.node_id, cur => ({
      ...cur,
      iteration: p.iteration ?? cur.iteration,
    }))
    lastEventAt.value = p.occurred_at ?? null
  }

  session.on<WorkflowRunEventPayload>('workflow_run_started', handleRunStarted)
  session.on<WorkflowRunEventPayload>('workflow_run_completed', handleRunCompleted)
  session.on<WorkflowRunEventPayload>('workflow_node_started', handleNodeStarted)
  session.on<WorkflowRunEventPayload>('workflow_node_completed', handleNodeCompleted)
  session.on<WorkflowRunEventPayload>('workflow_loop_iteration', handleLoopIteration)

  onUnmounted(() => {
    session.off('workflow_run_started', handleRunStarted)
    session.off('workflow_run_completed', handleRunCompleted)
    session.off('workflow_node_started', handleNodeStarted)
    session.off('workflow_node_completed', handleNodeCompleted)
    session.off('workflow_loop_iteration', handleLoopIteration)
  })

  function reset() {
    activeRunId.value = null
    runStatus.value = null
    runError.value = null
    currentPath.value = []
    nodeStates.value = {}
  }

  function hydrate(run: { id: string; status: string; current_node_path?: string[]; node_states?: Record<string, WorkflowNodeState>; error?: string }) {
    activeRunId.value = run.id
    runStatus.value = run.status
    runError.value = run.error ?? null
    currentPath.value = run.current_node_path ?? []
    nodeStates.value = { ...(run.node_states ?? {}) }
  }

  return {
    activeRunId,
    runStatus,
    runError,
    currentPath,
    nodeStates,
    lastEventAt,
    reset,
    hydrate,
  }
}
