import { runsInNextDays } from '~/utils/cron'

// Database-backed Automation store. The calendar still consumes schedule-like
// fields, but rows are keyed by automation id so a single Flow can have several
// triggers: schedule, integration, and webhook.

export type ScheduleFrequency = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'
export type AutomationTrigger = 'schedule' | 'integration' | 'webhook'

export interface ScheduledWorkflowConfig {
  id: string
  automation_id: string
  flow_id: string
  workflow_id: string
  workspace_id: string
  name: string
  active: boolean
  trigger_type: AutomationTrigger
  frequency: ScheduleFrequency
  cron_expression: string
  weekdays: number[]
  timezone: string
  one_off_ms: number[]
  integration_config: Record<string, unknown>
  webhook_config: Record<string, unknown>
  runner_config: Record<string, unknown>
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledWorkflowView extends ScheduledWorkflowConfig {
  workflow_name: string
}

export type ScheduleUpsertInput = Pick<
  ScheduledWorkflowConfig,
  'active' | 'frequency' | 'cron_expression' | 'weekdays' | 'timezone' | 'one_off_ms'
> & Partial<Pick<ScheduledWorkflowConfig, 'id' | 'name' | 'trigger_type' | 'integration_config' | 'webhook_config' | 'runner_config'>>

function normalizeAutomation(row: ScheduledWorkflowConfig): ScheduledWorkflowConfig {
  return {
    ...row,
    automation_id: row.automation_id || row.id,
    flow_id: row.flow_id || row.workflow_id,
    workflow_id: row.workflow_id || row.flow_id,
    trigger_type: row.trigger_type || 'schedule',
    integration_config: row.integration_config ?? {},
    webhook_config: row.webhook_config ?? {},
    runner_config: row.runner_config ?? { platform: 'web' },
  }
}

export function useScheduledWorkflows() {
  const { currentWorkspaceId } = useWorkspaces()
  const { sessions } = useWorkflowList()

  const list = useState<ScheduledWorkflowConfig[]>('flow-automations', () => [])
  const loaded = useState<boolean>('flow-automations-loaded', () => false)
  const loading = useState<boolean>('flow-automations-loading', () => false)

  async function fetchList(force = false) {
    if (!force && (loaded.value || loading.value)) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    loading.value = true
    try {
      const data = await $fetch<ScheduledWorkflowConfig[]>(
        `/api/workspaces/${wsId}/flow-automations`,
      )
      list.value = (data ?? []).map(normalizeAutomation)
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

  const nameFor = (flowId: string): string => {
    const s = sessions.value.find(x => x.id === flowId)
    return s?.title || `Flow ${flowId.slice(0, 8)}`
  }

  const views = computed<ScheduledWorkflowView[]>(() =>
    list.value.map(c => ({ ...c, workflow_name: nameFor(c.flow_id) })),
  )
  const active = computed<ScheduledWorkflowView[]>(() => views.value.filter(c => c.active))

  function get(flowId: string): ScheduledWorkflowView | null {
    return views.value.find(c => c.flow_id === flowId && c.trigger_type === 'schedule') ?? null
  }

  function getAutomation(automationId: string): ScheduledWorkflowView | null {
    return views.value.find(c => c.id === automationId || c.automation_id === automationId) ?? null
  }

  async function upsert(flowId: string, input: ScheduleUpsertInput): Promise<ScheduledWorkflowConfig | null> {
    const wsId = currentWorkspaceId.value
    if (!wsId) return null
    const automationId = input.id
    const body = { ...input, flow_id: flowId, trigger_type: input.trigger_type ?? 'schedule' }
    try {
      const saved = await $fetch<ScheduledWorkflowConfig>(
        automationId
          ? `/api/workspaces/${wsId}/flow-automations/${automationId}`
          : `/api/workspaces/${wsId}/flow-automations`,
        { method: automationId ? 'PUT' : 'POST', body },
      )
      const normalized = normalizeAutomation(saved)
      const idx = list.value.findIndex(c => c.id === normalized.id)
      if (idx === -1) list.value = [normalized, ...list.value]
      else {
        const next = [...list.value]
        next[idx] = normalized
        list.value = next
      }
      return normalized
    }
    catch (err) {
      console.error('[useScheduledWorkflows] upsert failed', err)
      return null
    }
  }

  async function remove(id: string): Promise<boolean> {
    const wsId = currentWorkspaceId.value
    if (!wsId) return false
    try {
      await $fetch(`/api/workspaces/${wsId}/flow-automations/${id}`, { method: 'DELETE' })
      list.value = list.value.filter(c => c.id !== id && c.automation_id !== id)
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

  return { list, active, get, getAutomation, upsert, remove, runsPerMonth, fetchList, loaded, loading }
}
