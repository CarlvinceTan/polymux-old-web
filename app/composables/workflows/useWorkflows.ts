export type WorkflowStepKind = 'directive' | 'sequence' | 'loop' | 'parallel'

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
  const versions = useState<WorkflowVersion[]>('workflow-versions', () => [])
  const { authFetch } = useAuthFetch()

  async function fetchWorkflows(workspaceID: string) {
    try {
      const data = await authFetch<WorkflowWithLatest[]>(`/workspaces/${workspaceID}/workflows`)
      workflows.value = data ?? []
    }
    catch (err) {
      console.error('[useWorkflows] fetchWorkflows failed', err)
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
      // The Go handler returns {"error": "..."} for every failure mode
      // (session not connected, no versions, decode-step failures, etc).
      // Bubble that up so the caller can surface the specific cause instead
      // of a generic "failed to start run" toast.
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
  // version strictly newer than the target on the server. The chosen version
  // becomes the new latest; the caller is responsible for re-syncing local
  // canvas state (draft steps, overrides, etc.) to the returned version.
  async function resetToVersion(workspaceID: string, workflowID: string, versionID: string): Promise<{ version: WorkflowVersion } | { error: string }> {
    try {
      const version = await authFetch<WorkflowVersion>(`/workspaces/${workspaceID}/workflows/${workflowID}/versions/${versionID}/reset`, {
        method: 'POST',
      })
      // Drop any cached newer versions locally so the history drawer reflects
      // the truncated server state without a refetch.
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
