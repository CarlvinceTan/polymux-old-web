import { parseCron } from '~/utils/cron'
import type { Ref } from 'vue'
import type { AutomationTrigger, ScheduleFrequency } from '~/composables/workflows/useScheduledWorkflows'

// Editing state for a single workflow's schedule — the frequency → cron
// translation, weekday/time/day-of-month inputs, one-off dates, timezone and
// the active toggle. Extracted from the old WorkflowScheduleEditor so the
// calendar's add/edit popover shares identical behaviour (activation requires a
// committed workflow version; hydrate reflects the last-saved config).
export function useScheduleForm(workflowId: Ref<string>, automationId?: Ref<string>) {
  const { t } = useI18n()
  const toast = useAppToast()
  const { currentWorkspaceId } = useWorkspaces()
  const { get: getScheduledConfig, getAutomation, upsert, remove, loaded: scheduleLoaded } = useScheduledWorkflows()
  const { getWorkflow } = useWorkflows()
  const { sessions } = useWorkflowList()

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const frequency = ref<ScheduleFrequency>('daily')
  const triggerType = ref<AutomationTrigger>('schedule')
  const automationName = ref('Automation')
  const integrationProvider = ref<'github' | 'gitlab'>('github')
  const integrationEvent = ref('push')
  const integrationRepo = ref('')
  const integrationBranch = ref('')
  const integrationBranchMatch = ref<'any' | 'exact' | 'prefix' | 'glob' | 'contains'>('any')
  const integrationBranchScope = ref<'event' | 'target' | 'source'>('event')
  const integrationStatus = ref('')
  const webhookSecret = ref('')
  const minute = ref(0)
  const hour = ref(9)
  const weekdays = ref<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const dayOfMonth = ref(15)
  const customExpr = ref('0 9 * * *')
  const active = ref(true)
  const oneOffDates = ref<Date[]>([])
  const timezone = ref<string>(localTz)

  // Activation requires a committed workflow_versions row — the Go scheduler
  // silently skips fires when LatestVersionID is empty.
  const hasSavedVersion = ref(false)

  const hourMinuteTime = computed({
    get: () => `${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')}`,
    set: (v: string) => {
      const [hh, mm] = (v || '').split(':')
      const h = Number(hh)
      const m = Number(mm)
      if (Number.isFinite(h)) hour.value = Math.min(23, Math.max(0, h))
      if (Number.isFinite(m)) minute.value = Math.min(59, Math.max(0, m))
    },
  })

  function toggleWeekday(idx: number) {
    const s = new Set(weekdays.value)
    if (s.has(idx)) s.delete(idx)
    else s.add(idx)
    weekdays.value = s
  }

  const cronExpression = computed(() => {
    switch (frequency.value) {
      case 'none':
        return ''
      case 'hourly':
        return `${minute.value} * * * *`
      case 'daily':
        return `${minute.value} ${hour.value} * * *`
      case 'weekly': {
        if (!weekdays.value.size) return ''
        const days = [...weekdays.value].sort((a, b) => a - b).join(',')
        return `${minute.value} ${hour.value} * * ${days}`
      }
      case 'monthly':
        return `${minute.value} ${hour.value} ${dayOfMonth.value} * *`
      case 'custom':
        return customExpr.value.trim()
    }
    return ''
  })

  const cronValid = computed(() => parseCron(cronExpression.value) != null)
  const hasSchedule = computed(() => cronValid.value || oneOffDates.value.length > 0)
  const hasAutomationConfig = computed(() => {
    if (triggerType.value === 'schedule') return hasSchedule.value
    if (triggerType.value === 'integration') return !!integrationProvider.value && !!integrationEvent.value
    return triggerType.value === 'webhook'
  })

  function hydrateFromStore() {
    const cfg = automationId?.value ? getAutomation(automationId.value) : getScheduledConfig(workflowId.value)
    if (!cfg) {
      // No stored schedule yet — reset to defaults for a clean "add" form.
      frequency.value = 'daily'
      minute.value = 0
      hour.value = 9
      weekdays.value = new Set([1, 2, 3, 4, 5])
      dayOfMonth.value = 15
      customExpr.value = '0 9 * * *'
      active.value = true
      triggerType.value = 'schedule'
      automationName.value = 'Automation'
      integrationProvider.value = 'github'
      integrationEvent.value = 'push'
      integrationRepo.value = ''
      integrationBranch.value = ''
      integrationBranchMatch.value = 'any'
      integrationBranchScope.value = 'event'
      integrationStatus.value = ''
      webhookSecret.value = ''
      oneOffDates.value = []
      timezone.value = localTz
      return
    }
    frequency.value = cfg.frequency
    triggerType.value = cfg.trigger_type ?? 'schedule'
    automationName.value = cfg.name || 'Automation'
    active.value = cfg.active
    timezone.value = cfg.timezone || localTz
    weekdays.value = new Set(cfg.weekdays)
    oneOffDates.value = cfg.one_off_ms.map(ms => new Date(ms))
    if (cfg.frequency === 'custom') customExpr.value = cfg.cron_expression || customExpr.value
    const parts = cfg.cron_expression?.split(/\s+/) ?? []
    const mm = Number(parts[0])
    const hh = Number(parts[1])
    const dom = Number(parts[2])
    if (Number.isFinite(mm)) minute.value = Math.max(0, Math.min(59, mm))
    if (Number.isFinite(hh)) hour.value = Math.max(0, Math.min(23, hh))
    if (cfg.frequency === 'monthly' && Number.isFinite(dom)) {
      dayOfMonth.value = Math.max(1, Math.min(31, dom))
    }
    const integration = cfg.integration_config ?? {}
    integrationProvider.value = integration.provider === 'gitlab' ? 'gitlab' : 'github'
    integrationEvent.value = typeof integration.event_type === 'string' ? integration.event_type : 'push'
    integrationRepo.value = typeof integration.repository === 'string' ? integration.repository : ''
    integrationBranch.value = typeof integration.branch === 'string' ? integration.branch : ''
    integrationBranchMatch.value = ['exact', 'prefix', 'glob', 'contains'].includes(String(integration.branch_match))
      ? integration.branch_match as typeof integrationBranchMatch.value
      : 'any'
    integrationBranchScope.value = ['target', 'source'].includes(String(integration.branch_scope))
      ? integration.branch_scope as typeof integrationBranchScope.value
      : 'event'
    integrationStatus.value = typeof integration.status === 'string' ? integration.status : ''
    const webhook = cfg.webhook_config ?? {}
    webhookSecret.value = typeof webhook.secret === 'string' ? webhook.secret : ''
  }

  async function refreshVersion() {
    const wsId = currentWorkspaceId.value
    const wfId = workflowId.value
    if (!wsId || !wfId) { hasSavedVersion.value = false; return }
    const wf = await getWorkflow(wsId, wfId)
    // Flow-pivot records may no longer resolve through the legacy workflow
    // detail endpoint. The picker only exposes promoted (non-draft) Flows, so
    // their list state is also authoritative evidence that they can run.
    const versionPresent = !!wf?.latest_version?.id
      || sessions.value.some(session => session.id === wfId && !session.is_draft)
    hasSavedVersion.value = versionPresent
    if (!versionPresent && active.value) active.value = false
  }

  // Hydrate whenever the target workflow, workspace, or the initial fetch
  // resolves — the schedule row may not exist yet at first render.
  watch([workflowId, currentWorkspaceId, scheduleLoaded, automationId ?? ref('')], async ([wfId, wsId, ready]) => {
    if (!wfId || !wsId || !ready) return
    hydrateFromStore()
    await refreshVersion()
  }, { immediate: true })

  function tryActivate() {
    if (!hasSavedVersion.value) {
      toast.show(t('schedule.activeNeedsVersion'), 'warning', 4000)
      return
    }
    active.value = true
  }

  async function save(): Promise<boolean> {
    if (!hasAutomationConfig.value) {
      toast.show(t('schedule.invalidCron'), 'error', 3000)
      return false
    }
    if (!currentWorkspaceId.value) {
      toast.show(t('schedule.invalidCron'), 'error', 3000)
      return false
    }
    if (active.value && !hasSavedVersion.value) {
      toast.show(t('schedule.activeNeedsVersion'), 'error', 4000)
      return false
    }
    const saved = await upsert(workflowId.value, {
      id: automationId?.value || undefined,
      name: automationName.value,
      active: active.value,
      trigger_type: triggerType.value,
      frequency: frequency.value,
      cron_expression: cronExpression.value,
      weekdays: [...weekdays.value].sort((a, b) => a - b),
      timezone: timezone.value,
      one_off_ms: oneOffDates.value.map(d => d.getTime()),
      integration_config: {
        provider: integrationProvider.value,
        event_type: integrationEvent.value,
        repository: integrationRepo.value.trim(),
        branch: integrationBranch.value.trim(),
        branch_match: integrationBranchMatch.value,
        branch_scope: integrationBranchScope.value,
        status: integrationStatus.value.trim(),
      },
      webhook_config: webhookSecret.value ? { secret: webhookSecret.value } : {},
      runner_config: { platform: 'web' },
    })
    if (saved) { toast.show(t('schedule.saved'), 'info', 3000); return true }
    toast.show(t('schedule.invalidCron'), 'error', 3000)
    return false
  }

  async function removeSchedule(): Promise<boolean> {
    const target = automationId?.value || getScheduledConfig(workflowId.value)?.automation_id || workflowId.value
    const ok = await remove(target)
    if (ok) toast.show(t('schedule.removed'), 'info', 3000)
    return ok
  }

  return {
    frequency, triggerType, automationName, integrationProvider, integrationEvent,
    integrationRepo, integrationBranch, integrationBranchMatch, integrationBranchScope, integrationStatus, webhookSecret,
    minute, hour, weekdays, dayOfMonth, customExpr, active,
    oneOffDates, timezone, localTz, hasSavedVersion,
    hourMinuteTime, toggleWeekday,
    cronExpression, cronValid, hasSchedule, hasAutomationConfig,
    hydrateFromStore, refreshVersion, tryActivate, save, removeSchedule,
  }
}
