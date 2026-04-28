import { runsInNextDays } from '~/utils/cron'

// Database-backed schedule store. The Schedule tab under /workflow/[id]
// upserts rows here; dashboard/usage lists active rows to project recurring
// cost. Rows are keyed by workflow_id — workflows now own all durable state
// (see migration 20260427000000_workflow_runtime_collapse).

export type ScheduleFrequency = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface ScheduledWorkflowConfig {
  workflow_id: string
  workspace_id: string
  active: boolean
  frequency: ScheduleFrequency
  cron_expression: string
  weekdays: number[]
  timezone: string
  one_off_ms: number[]
  updated_by: string
  created_at: string
  updated_at: string
}

export interface ScheduledWorkflowView extends ScheduledWorkflowConfig {
  workflow_name: string
}

export type ScheduleUpsertInput = Pick<
  ScheduledWorkflowConfig,
  'active' | 'frequency' | 'cron_expression' | 'weekdays' | 'timezone' | 'one_off_ms'
>

export function useScheduledWorkflows() {
  const { currentWorkspaceId } = useWorkspaces()
  const { sessions } = useWorkflowList()

  // Shared workflow-level state so consumers on multiple pages de-duplicate.
  const list = useState<ScheduledWorkflowConfig[]>('workflow-schedules', () => [])
  const loaded = useState<boolean>('workflow-schedules-loaded', () => false)
  const loading = useState<boolean>('workflow-schedules-loading', () => false)

  async function fetchList(force = false) {
    if (!force && (loaded.value || loading.value)) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    loading.value = true
    try {
      const data = await $fetch<ScheduledWorkflowConfig[]>(
        `/api/workspaces/${wsId}/workflow-schedules`,
      )
      list.value = data ?? []
      loaded.value = true
    }
    catch (err) {
      console.warn('[useScheduledWorkflows] fetch failed', err)
    }
    finally {
      loading.value = false
    }
  }

  // Workspace change invalidates the cached list and re-fetches.
  watch(currentWorkspaceId, (wsId) => {
    loaded.value = false
    list.value = []
    if (wsId) fetchList().catch(() => {})
  }, { immediate: true })

  // Refetch when the server comes back online — without this, the initial
  // fetch that failed during downtime never retries.
  useOnReconnect(() => {
    if (currentWorkspaceId.value) fetchList(true).catch(() => {})
  })

  const nameFor = (workflowId: string): string => {
    const s = sessions.value.find(x => x.id === workflowId)
    return s?.title || `Workflow ${workflowId.slice(0, 8)}`
  }

  const views = computed<ScheduledWorkflowView[]>(() =>
    list.value.map(c => ({ ...c, workflow_name: nameFor(c.workflow_id) })),
  )
  const active = computed<ScheduledWorkflowView[]>(() => views.value.filter(c => c.active))

  function get(workflowId: string): ScheduledWorkflowView | null {
    return views.value.find(c => c.workflow_id === workflowId) ?? null
  }

  async function upsert(workflowId: string, input: ScheduleUpsertInput): Promise<ScheduledWorkflowConfig | null> {
    const wsId = currentWorkspaceId.value
    if (!wsId) return null
    try {
      const saved = await $fetch<ScheduledWorkflowConfig>(
        `/api/workspaces/${wsId}/workflow-schedules/${workflowId}`,
        { method: 'PUT', body: input },
      )
      const idx = list.value.findIndex(c => c.workflow_id === workflowId)
      if (idx === -1) list.value = [saved, ...list.value]
      else {
        const next = [...list.value]
        next[idx] = saved
        list.value = next
      }
      return saved
    }
    catch (err) {
      console.error('[useScheduledWorkflows] upsert failed', err)
      return null
    }
  }

  async function remove(workflowId: string): Promise<boolean> {
    const wsId = currentWorkspaceId.value
    if (!wsId) return false
    try {
      await $fetch(`/api/workspaces/${wsId}/workflow-schedules/${workflowId}`, { method: 'DELETE' })
      list.value = list.value.filter(c => c.workflow_id !== workflowId)
      return true
    }
    catch (err) {
      console.error('[useScheduledWorkflows] remove failed', err)
      return false
    }
  }

  // Approximate runs/month per config. Closed-form for preset frequencies;
  // cron walk for custom.
  function runsPerMonth(cfg: ScheduledWorkflowConfig): number {
    if (!cfg.active) return 0
    switch (cfg.frequency) {
      case 'hourly': return 24 * 30
      case 'daily': return 30
      case 'weekly': return Math.max(0, cfg.weekdays.length) * 4.33
      case 'monthly': return 1
      case 'custom':
        return cfg.cron_expression
          ? runsInNextDays(cfg.cron_expression, cfg.timezone || 'UTC', 30)
          : 0
      case 'none':
      default:
        return 0
    }
  }

  return { list, active, get, upsert, remove, runsPerMonth, fetchList, loaded, loading }
}
