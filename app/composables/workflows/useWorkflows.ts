// Canvas-coord top-left + box size carried inline on each node so the
// rendered layout follows the saved workflow across devices, sessions, and
// version switches. Both are optional; absent means "auto-layout fills in".
export interface NodePosition { x: number, y: number }
export interface NodeSize { w: number, h: number }

export type WireSide = 'left' | 'right' | 'top' | 'bottom'

export interface WorkflowNode {
  id: string
  // Short human-readable name of what this step achieves
  // (e.g. "Update info.log in storage").
  title?: string
  // Ordered list of free-text action strings describing HOW the title is
  // achieved. Each entry is one intent the sub-agent will satisfy with
  // whatever low-level primitives it picks.
  actions?: string[]
  // Agent execution context — readable by the executor sub-agent and
  // written to by the orchestrator (tool-call summaries, prior-task stashes).
  // Users may also edit it via the canvas.
  details?: string
  // PRIVATE user-authored notes. Not consumed by the executor; the
  // orchestrator must not write to this field.
  notes?: string
  // When set, this node delegates to the referenced workflow (by UUID).
  // Title / actions / details are derived from the referenced workflow at
  // display time and not editable on this node. Mutually exclusive with
  // hand-authored actions.
  workflow_ref?: string
  // Run this node N times in succession before continuing through
  // outgoing wires. Absent / 0 / 1 = single run (default). Distinct from
  // a wire's max_iterations: repeat counts node firings within a single
  // visit; max_iterations caps wire firings across the run.
  repeat?: number
  // Presentation-only fields. The executor and orchestrator ignore them;
  // the canvas reads them when rendering and writes them back on user
  // drag / resize gestures.
  position?: NodePosition
  size?: NodeSize
}

// normalizeNode migrates legacy node shapes into the canonical
// title / actions / details / notes layout. Run it on every JSON
// ingestion site (workflow fetches, version loads, draft patches) so the
// rest of the app only deals with the new shape.
//
// Rules mirror the Go-side UnmarshalJSON in
// polymux/internal/agent/workflow_graph.go:
//   - title    := first non-empty of (title, description)
//   - actions  := raw.actions if non-empty; else, if any of action/target/
//                 value is set, a single-element list whose entry is the
//                 space-join of the non-empty parts in order
//   - details  := first non-empty of (details, annotation)
//   - notes    := raw.notes (legacy data has none)
//   - id, position, size pass through unchanged
export function normalizeNode(raw: unknown): WorkflowNode {
  const r = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown): string => typeof v === 'string' ? v : ''
  const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const arr = (v: unknown): string[] | undefined => Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined

  const out: WorkflowNode = {
    id: str(r.id),
  }

  const title = str(r.title) || str(r.description)
  if (title) out.title = title

  const actions = arr(r.actions)
  if (actions && actions.length > 0) {
    out.actions = actions
  }
  else {
    const action = str(r.action)
    const target = str(r.target)
    const value = str(r.value)
    if (action || target || value) {
      const parts = [action, target, value].filter(p => p !== '')
      out.actions = [parts.join(' ')]
    }
  }

  const details = str(r.details) || str(r.annotation)
  if (details) out.details = details

  const notes = str(r.notes)
  if (notes) out.notes = notes

  const workflowRef = str(r.workflow_ref)
  if (workflowRef) out.workflow_ref = workflowRef

  const repeat = num(r.repeat)
  if (repeat !== undefined && repeat > 0) out.repeat = repeat

  if (r.position && typeof r.position === 'object') {
    out.position = r.position as NodePosition
  }
  if (r.size && typeof r.size === 'object') {
    out.size = r.size as NodeSize
  }

  return out
}

// normalizeNodePatch is the partial-patch counterpart to normalizeNode.
// Maps legacy keys onto the new shape but only emits fields the input
// actually carried — used by applyOp's node_edit case so a patch like
// `{ description: 'new' }` becomes `{ title: 'new' }` before merge.
export function normalizeNodePatch(raw: unknown): Partial<WorkflowNode> {
  const r = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown): string => typeof v === 'string' ? v : ''
  const arr = (v: unknown): string[] | undefined => Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined

  const out: Partial<WorkflowNode> = {}

  if ('title' in r && str(r.title)) {
    out.title = str(r.title)
  }
  else if ('description' in r && str(r.description)) {
    out.title = str(r.description)
  }

  const actions = arr(r.actions)
  if (actions) {
    out.actions = actions
  }
  else if ('action' in r || 'target' in r || 'value' in r) {
    const parts = [str(r.action), str(r.target), str(r.value)].filter(p => p !== '')
    if (parts.length > 0) {
      out.actions = [parts.join(' ')]
    }
  }

  if ('details' in r && str(r.details)) {
    out.details = str(r.details)
  }
  else if ('annotation' in r && str(r.annotation)) {
    out.details = str(r.annotation)
  }

  if ('notes' in r && str(r.notes)) {
    out.notes = str(r.notes)
  }

  if ('workflow_ref' in r && str(r.workflow_ref)) {
    out.workflow_ref = str(r.workflow_ref)
  }

  if ('repeat' in r && typeof r.repeat === 'number' && Number.isFinite(r.repeat)) {
    out.repeat = r.repeat
  }

  if (r.position && typeof r.position === 'object') {
    out.position = r.position as NodePosition
  }
  if (r.size && typeof r.size === 'object') {
    out.size = r.size as NodeSize
  }

  return out
}

// normalizeGraph normalises every node in a graph. Wires pass through
// untouched — their shape hasn't changed.
export function normalizeGraph(raw: unknown): WorkflowGraph {
  const r = (raw ?? {}) as { nodes?: unknown[]; wires?: unknown[] }
  const nodes = Array.isArray(r.nodes) ? r.nodes.map(normalizeNode) : []
  const wires = Array.isArray(r.wires) ? (r.wires as WorkflowWire[]) : []
  return { nodes, wires }
}

export interface WorkflowWire {
  id: string
  // from_id / to_id are required at runtime — the executor traverses by
  // node id. At edit time either side may be temporarily detached: when
  // the user drags an endpoint off its node into empty canvas space, the
  // corresponding *_id is empty and *_pos carries the floating drop point
  // instead. A detached wire is non-functional until reconnected, but
  // persists so the user can pick the loose end back up later.
  from_id: string
  to_id: string
  from_pos?: NodePosition
  to_pos?: NodePosition
  label?: string
  condition?: string
  max_iterations?: number
  // Presentation-only: which port side the wire visually attaches to on
  // each end. Empty / absent means "auto-pick at render time".
  from_side?: WireSide
  to_side?: WireSide
  // Ordered step-routing corner points between the source and target
  // ports. Absent / empty means "auto-route at render time".
  bends?: NodePosition[]
}

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  wires: WorkflowWire[]
}

export interface Workflow {
  id: string
  workspace_id: string
  name: string
  description?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkflowVersion {
  id: string
  workflow_id: string
  version: number
  // Persisted column is named `steps` for migration continuity; the payload
  // is the full `{nodes, edges}` graph.
  steps: WorkflowGraph
  source: 'user' | 'agent' | string
  change_summary?: string
  impact_level: 'trivial' | 'preference' | 'significant' | 'fundamental' | string
  agent_concern?: string
  tags: string[]
  // Node ids the user has pinned from orchestrator edits.
  locked_node_ids?: string[]
  client_nonce?: string
  created_by: string
  created_at: string
}

export interface WorkflowWithLatest extends Workflow {
  latest_version?: WorkflowVersion
}

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | string

export interface WorkflowRun {
  id: string
  workflow_id: string
  workflow_version_id: string
  session_id?: string
  status: WorkflowRunStatus
  current_node_path: string[]
  node_states?: Record<string, WorkflowNodeState>
  error?: string
  started_by: string
  started_at?: string
  finished_at?: string
}

export interface WorkflowNodeState {
  status: string
  started_at?: string
  finished_at?: string
  iteration?: number
  error?: string
}

export class VersionConflictError extends Error {
  currentVersion: number
  constructor(currentVersion: number) {
    super(`workflow version conflict (current=${currentVersion})`)
    this.name = 'VersionConflictError'
    this.currentVersion = currentVersion
  }
}

export interface CreateVersionInput {
  steps: WorkflowGraph
  expected_version: number
  source?: 'user' | 'agent'
  change_summary?: string
  impact_level?: 'trivial' | 'preference' | 'significant' | 'fundamental'
  agent_concern?: string
  tags?: string[]
  locked_node_ids?: string[]
  client_nonce?: string
}

export interface StartRunInput {
  session_id: string
  version_id?: string
  resume_from_node_id?: string
}

// normalizeVersion mutates a WorkflowVersion's graph in-place so its
// nodes follow the canonical title/actions/details/notes shape. Returns
// the same object for chaining.
function normalizeVersion(v: WorkflowVersion): WorkflowVersion {
  if (v && v.steps) {
    v.steps = normalizeGraph(v.steps)
  }
  return v
}

function normalizeWithLatest(w: WorkflowWithLatest): WorkflowWithLatest {
  if (w.latest_version) normalizeVersion(w.latest_version)
  return w
}

export function useWorkflows() {
  const workflows = useState<WorkflowWithLatest[]>('workflows', () => [])
  const versions = useState<WorkflowVersion[]>('workflow-versions', () => [])
  const { authFetch } = useAuthFetch()

  async function fetchWorkflows(workspaceID: string) {
    try {
      const data = await authFetch<WorkflowWithLatest[]>(`/workspaces/${workspaceID}/workflows`)
      workflows.value = (data ?? []).map(normalizeWithLatest)
    }
    catch (err) {
      console.error('[useWorkflows] fetchWorkflows failed', err)
    }
  }

  async function getWorkflow(workspaceID: string, workflowID: string): Promise<WorkflowWithLatest | null> {
    try {
      const wf = normalizeWithLatest(await authFetch<WorkflowWithLatest>(`/workspaces/${workspaceID}/workflows/${workflowID}`))
      const idx = workflows.value.findIndex(w => w.id === workflowID)
      if (idx !== -1) workflows.value[idx] = wf
      else workflows.value = [wf, ...workflows.value]
      return wf
    }
    catch (err) {
      console.error('[useWorkflows] getWorkflow failed', err)
      return null
    }
  }

  async function fetchVersions(workspaceID: string, workflowID: string): Promise<WorkflowVersion[]> {
    try {
      const data = await authFetch<WorkflowVersion[]>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions`)
      versions.value = (data ?? []).map(normalizeVersion)
      return versions.value
    }
    catch (err) {
      console.error('[useWorkflows] fetchVersions failed', err)
      return []
    }
  }

  // createVersion throws VersionConflictError on 409 so the caller can re-pull
  // the latest version and re-display a merge/conflict UI. All other failures
  // resolve null.
  async function createVersion(workspaceID: string, workflowID: string, input: CreateVersionInput): Promise<WorkflowVersion | null> {
    try {
      const v = normalizeVersion(await authFetch<WorkflowVersion>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }))
      versions.value = [v, ...versions.value]
      const idx = workflows.value.findIndex(w => w.id === workflowID)
      if (idx !== -1) workflows.value[idx] = { ...workflows.value[idx]!, latest_version: v }
      return v
    }
    catch (err: unknown) {
      const e = err as { status?: number; data?: { current_version?: number } }
      if (e?.status === 409) {
        const cur = typeof e.data?.current_version === 'number' ? e.data.current_version : 0
        throw new VersionConflictError(cur)
      }
      console.error('[useWorkflows] createVersion failed', err)
      return null
    }
  }

  async function startRun(workspaceID: string, workflowID: string, input: StartRunInput): Promise<{ run: WorkflowRun } | { error: string }> {
    try {
      const run = await authFetch<WorkflowRun>(`/workspaces/${workspaceID}/workflows/${workflowID}/runs`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return { run }
    }
    catch (err) {
      console.error('[useWorkflows] startRun failed', err)
      return { error: extractServerError(err) ?? 'Unknown error' }
    }
  }

  function extractServerError(err: unknown): string | null {
    if (!err || typeof err !== 'object') return null
    const data = (err as { data?: unknown }).data
    if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
      return (data as { error: string }).error
    }
    const msg = (err as { message?: unknown }).message
    return typeof msg === 'string' && msg ? msg : null
  }

  // Reset the workflow to a previously-saved version by deleting every
  // version strictly newer than the target on the server.
  async function resetToVersion(workspaceID: string, workflowID: string, versionID: string): Promise<{ version: WorkflowVersion } | { error: string }> {
    try {
      const version = normalizeVersion(await authFetch<WorkflowVersion>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions/${versionID}/reset`, {
        method: 'POST',
      }))
      versions.value = versions.value.filter(v => v.version <= version.version)
      return { version }
    }
    catch (err) {
      console.error('[useWorkflows] resetToVersion failed', err)
      return { error: extractServerError(err) ?? 'Unknown error' }
    }
  }

  return {
    workflows,
    versions,
    fetchWorkflows,
    getWorkflow,
    fetchVersions,
    createVersion,
    startRun,
    resetToVersion,
  }
}
