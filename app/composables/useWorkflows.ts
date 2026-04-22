export type WorkflowStepKind = 'directive' | 'loop' | 'parallel'

export interface WorkflowStep {
  id?: string
  kind?: WorkflowStepKind
  action?: string
  target?: string
  value?: string
  description?: string
  annotation?: string
  condition?: string
  max_iterations?: number
  shared_context_keys?: string[]
  children?: WorkflowStep[]
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
  steps: WorkflowStep[]
  source: 'user' | 'agent' | string
  change_summary?: string
  impact_level: 'trivial' | 'preference' | 'significant' | 'fundamental' | string
  agent_concern?: string
  tags: string[]
  locked_step_indices: number[]
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

export interface CreateWorkflowInput {
  name: string
  description?: string
  steps: WorkflowStep[]
  source?: 'user' | 'agent'
  change_summary?: string
  impact_level?: 'trivial' | 'preference' | 'significant' | 'fundamental'
  agent_concern?: string
  tags?: string[]
  locked_step_indices?: number[]
  client_nonce?: string
}

export interface CreateVersionInput {
  steps: WorkflowStep[]
  expected_version: number
  source?: 'user' | 'agent'
  change_summary?: string
  impact_level?: 'trivial' | 'preference' | 'significant' | 'fundamental'
  agent_concern?: string
  tags?: string[]
  locked_step_indices?: number[]
  client_nonce?: string
}

export interface StartRunInput {
  session_id: string
  version_id?: string
  resume_from_node_id?: string
}

export function useWorkflows() {
  const workflows = useState<WorkflowWithLatest[]>('workflows', () => [])
  const currentWorkflowId = useState<string | null>('current-workflow-id', () => null)
  const versions = useState<WorkflowVersion[]>('workflow-versions', () => [])
  const runs = useState<WorkflowRun[]>('workflow-runs', () => [])
  const { authFetch } = useAuthFetch()

  const currentWorkflow = computed(() =>
    workflows.value.find(w => w.id === currentWorkflowId.value) ?? null,
  )

  async function fetchWorkflows(workspaceID: string) {
    try {
      const data = await authFetch<WorkflowWithLatest[]>(`/workspaces/${workspaceID}/workflows`)
      workflows.value = data ?? []
    }
    catch (err) {
      console.error('[useWorkflows] fetchWorkflows failed', err)
    }
  }

  async function createWorkflow(workspaceID: string, input: CreateWorkflowInput): Promise<WorkflowWithLatest | null> {
    try {
      const wf = await authFetch<WorkflowWithLatest>(`/workspaces/${workspaceID}/workflows`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      workflows.value = [wf, ...workflows.value]
      currentWorkflowId.value = wf.id
      return wf
    }
    catch (err) {
      console.error('[useWorkflows] createWorkflow failed', err)
      return null
    }
  }

  async function getWorkflow(workspaceID: string, workflowID: string): Promise<WorkflowWithLatest | null> {
    try {
      const wf = await authFetch<WorkflowWithLatest>(`/workspaces/${workspaceID}/workflows/${workflowID}`)
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

  async function updateWorkflow(workspaceID: string, workflowID: string, patch: { name?: string; description?: string }): Promise<Workflow | null> {
    try {
      const wf = await authFetch<Workflow>(`/workspaces/${workspaceID}/workflows/${workflowID}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const idx = workflows.value.findIndex(w => w.id === workflowID)
      if (idx !== -1) {
        const prev = workflows.value[idx]!
        workflows.value[idx] = { ...prev, ...wf }
      }
      return wf
    }
    catch (err) {
      console.error('[useWorkflows] updateWorkflow failed', err)
      return null
    }
  }

  async function deleteWorkflow(workspaceID: string, workflowID: string): Promise<boolean> {
    try {
      await authFetch(`/workspaces/${workspaceID}/workflows/${workflowID}`, { method: 'DELETE' })
      workflows.value = workflows.value.filter(w => w.id !== workflowID)
      if (currentWorkflowId.value === workflowID) currentWorkflowId.value = null
      return true
    }
    catch (err) {
      console.error('[useWorkflows] deleteWorkflow failed', err)
      return false
    }
  }

  async function fetchVersions(workspaceID: string, workflowID: string): Promise<WorkflowVersion[]> {
    try {
      const data = await authFetch<WorkflowVersion[]>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions`)
      versions.value = data ?? []
      return versions.value
    }
    catch (err) {
      console.error('[useWorkflows] fetchVersions failed', err)
      return []
    }
  }

  // createVersion throws VersionConflictError on 409 so the caller can re-pull the
  // latest version and re-display a merge/conflict UI. All other failures resolve null.
  async function createVersion(workspaceID: string, workflowID: string, input: CreateVersionInput): Promise<WorkflowVersion | null> {
    try {
      const v = await authFetch<WorkflowVersion>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
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

  async function fetchRuns(workspaceID: string, workflowID: string): Promise<WorkflowRun[]> {
    try {
      const data = await authFetch<WorkflowRun[]>(`/workspaces/${workspaceID}/workflows/${workflowID}/runs`)
      runs.value = data ?? []
      return runs.value
    }
    catch (err) {
      console.error('[useWorkflows] fetchRuns failed', err)
      return []
    }
  }

  async function startRun(workspaceID: string, workflowID: string, input: StartRunInput): Promise<WorkflowRun | null> {
    try {
      const run = await authFetch<WorkflowRun>(`/workspaces/${workspaceID}/workflows/${workflowID}/runs`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      runs.value = [run, ...runs.value]
      return run
    }
    catch (err) {
      console.error('[useWorkflows] startRun failed', err)
      return null
    }
  }

  async function getRun(workspaceID: string, workflowID: string, runID: string): Promise<WorkflowRun | null> {
    try {
      return await authFetch<WorkflowRun>(`/workspaces/${workspaceID}/workflows/${workflowID}/runs/${runID}`)
    }
    catch (err) {
      console.error('[useWorkflows] getRun failed', err)
      return null
    }
  }

  function selectWorkflow(id: string | null) {
    currentWorkflowId.value = id
  }

  return {
    workflows,
    versions,
    runs,
    currentWorkflow,
    currentWorkflowId,
    fetchWorkflows,
    createWorkflow,
    getWorkflow,
    updateWorkflow,
    deleteWorkflow,
    fetchVersions,
    createVersion,
    fetchRuns,
    startRun,
    getRun,
    selectWorkflow,
  }
}
