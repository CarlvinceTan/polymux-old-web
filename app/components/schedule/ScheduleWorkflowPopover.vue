<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import FlowFolderIcon from '~/components/FlowFolderIcon.vue'
import { computeNextRuns } from '~/utils/cron'
import { useScheduleForm } from '~/composables/workflows/useScheduleForm'
import type { ScheduleFrequency } from '~/composables/workflows/useScheduledWorkflows'

// Calendar add/edit panel. In "add" mode (automationId null) it opens with a
// Flow search; picking one loads an automation form. In "edit" mode it opens
// straight onto the exact Automation row.
const props = defineProps<{
  open: boolean
  automationId: string | null
  /** Optional `YYYY-MM-DD` to pre-seed a one-off when adding from a day cell. */
  prefillDate?: string | null
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const { sessions } = useWorkflowList()
const { folders: flowFolders, assignments: flowFolderAssignments, ensureFolders } = useFlowFolders()
const { getAutomation } = useScheduledWorkflows()
const { isInstalled, connectionFor } = useMarketplace()

const rootRef = ref<HTMLElement | null>(null)
onClickOutside(rootRef, () => { if (props.open) emit('close') })

// The workflow the form targets. In edit mode this is fixed to the prop; in add
// mode it starts empty and is set by the search picker.
const selectedId = ref<string>('')
const search = ref('')

const isEdit = computed(() => !!props.automationId)

const automationIdRef = computed(() => props.automationId ?? '')
const form = useScheduleForm(selectedId, automationIdRef)

const workflowName = computed(() =>
  sessions.value.find(s => s.id === selectedId.value)?.title ?? '',
)

const candidates = computed(() => {
  const q = search.value.trim().toLowerCase()
  const base = sessions.value.filter(s => !s.is_draft)
  if (!q) return base
  return base.filter(s => s.title.toLowerCase().includes(q))
})

const pickerCollapsedFolders = ref<Record<string, boolean>>({})
const pickerFolders = computed(() => {
  const q = search.value.trim().toLowerCase()
  return flowFolders.value.map(folder => {
    const flows = candidates.value.filter(flow => flowFolderAssignments.value[flow.id] === folder.id)
    const folderMatches = q && folder.name.toLowerCase().includes(q)
    return {
      ...folder,
      flows: folderMatches ? sessions.value.filter(flow => !flow.is_draft && flowFolderAssignments.value[flow.id] === folder.id) : flows,
    }
  }).filter(folder => folder.flows.length || (!q && !sessions.value.some(flow => flowFolderAssignments.value[flow.id] === folder.id)))
})
const unfolderedCandidates = computed(() => candidates.value.filter(flow => !flowFolderAssignments.value[flow.id]))
const hasPickerResults = computed(() => pickerFolders.value.length > 0 || unfolderedCandidates.value.length > 0)

function togglePickerFolder(id: string) {
  pickerCollapsedFolders.value = { ...pickerCollapsedFolders.value, [id]: !pickerCollapsedFolders.value[id] }
}

// (Re)initialise whenever the panel opens or its target changes.
watch(() => [props.open, props.automationId], () => {
  if (!props.open) return
  void ensureFolders()
  const existing = props.automationId ? getAutomation(props.automationId) : null
  selectedId.value = existing?.flow_id ?? ''
  search.value = ''
  seedPrefill()
}, { immediate: true })

function seedPrefill() {
  if (props.prefillDate && !isEdit.value) {
    form.frequency.value = 'none'
    oneOffDate.value = props.prefillDate
  }
}

function pickWorkflow(id: string) {
  selectedId.value = id
  search.value = ''
}
function clearWorkflow() {
  selectedId.value = ''
}

const FREQS: { value: ScheduleFrequency; labelKey: string }[] = [
  { value: 'none', labelKey: 'schedule.freq.none' },
  { value: 'hourly', labelKey: 'schedule.freq.hourly' },
  { value: 'daily', labelKey: 'schedule.freq.daily' },
  { value: 'weekly', labelKey: 'schedule.freq.weekly' },
  { value: 'monthly', labelKey: 'schedule.freq.monthly' },
  { value: 'custom', labelKey: 'schedule.freq.custom' },
]
const TRIGGERS = [
  { value: 'schedule', labelKey: 'schedule.trigger.schedule', icon: 'i-heroicons-calendar-days' },
  { value: 'integration', labelKey: 'schedule.trigger.integration', icon: 'i-heroicons-code-bracket-square' },
  { value: 'webhook', labelKey: 'schedule.trigger.webhook', icon: 'i-heroicons-bolt' },
] as const
const PROVIDER_EVENTS = {
  github: [
    { value: 'push', label: 'Push to branch' },
    { value: 'tag_push', label: 'Tag pushed' },
    { value: 'pull_request.opened', label: 'Pull request opened' },
    { value: 'pull_request.synchronize', label: 'Pull request updated' },
    { value: 'pull_request.reopened', label: 'Pull request reopened' },
    { value: 'pull_request.merged', label: 'Pull request merged' },
    { value: 'deployment', label: 'Deployment status' },
    { value: 'workflow_run.completed', label: 'Workflow run completed' },
  ],
  gitlab: [
    { value: 'push', label: 'Push to branch' },
    { value: 'tag_push', label: 'Tag pushed' },
    { value: 'merge_request.open', label: 'Merge request opened' },
    { value: 'merge_request.update', label: 'Merge request updated' },
    { value: 'merge_request.reopen', label: 'Merge request reopened' },
    { value: 'merge_request.merged', label: 'Merge request merged' },
    { value: 'pipeline', label: 'Pipeline event' },
    { value: 'job', label: 'Job event' },
    { value: 'deployment', label: 'Deployment event' },
    { value: 'release', label: 'Release event' },
  ],
} as const
const BRANCH_MATCHES = [
  { value: 'any', label: 'Any branch' },
  { value: 'exact', label: 'Exact' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'glob', label: 'Glob' },
  { value: 'contains', label: 'Contains' },
] as const
const BRANCH_SCOPES = [
  { value: 'event', label: 'Event branch' },
  { value: 'target', label: 'Target branch' },
  { value: 'source', label: 'Source branch' },
] as const
const STATUS_PRESETS = {
  github: ['success', 'failure', 'cancelled', 'neutral', 'skipped', 'timed_out', 'action_required'],
  gitlab: ['success', 'failed', 'canceled', 'skipped', 'running', 'pending', 'manual'],
} as const
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function pad2(n: number) { return n.toString().padStart(2, '0') }

// One-off entry (native date + time) — used under the "Once" interval.
const oneOffDate = ref<string>('')
const oneOffTime = ref<string>('09:00')

const sortedOneOffs = computed(() =>
  [...form.oneOffDates.value].sort((a, b) => a.getTime() - b.getTime()),
)
function addOneOff() {
  if (!oneOffDate.value) return
  const [y, m, d] = oneOffDate.value.split('-').map(Number)
  const [hh, mm] = oneOffTime.value.split(':').map(Number)
  if (!y || !m || !d) return
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0)
  if (dt.getTime() <= Date.now()) return
  const key = Math.floor(dt.getTime() / 60000)
  if (form.oneOffDates.value.some(x => Math.floor(x.getTime() / 60000) === key)) return
  form.oneOffDates.value = [...form.oneOffDates.value, dt]
  oneOffDate.value = ''
}
function removeOneOff(ms: number) {
  form.oneOffDates.value = form.oneOffDates.value.filter(d => d.getTime() !== ms)
}
function fmtOneOff(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: form.timezone.value, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

// Live human-readable summary + next run for the current form state.
const previewLine = computed(() => {
  if (!selectedId.value) return ''
  const tz = form.timezone.value
  const time = `${pad2(form.hour.value)}:${pad2(form.minute.value)}`
  switch (form.frequency.value) {
    case 'hourly': return t('schedule.human.hourly', { minute: form.minute.value })
    case 'daily': return t('schedule.human.daily', { time, tz })
    case 'weekly': {
      const days = [...form.weekdays.value].sort((a, b) => a - b)
        .map(i => t(`schedule.weekdayLong.${WEEKDAY_KEYS[i]}`)).join(', ')
      return days ? t('schedule.human.weekly', { days, time, tz }) : t('schedule.weeklyNoDays')
    }
    case 'monthly': return t('schedule.human.monthly', { day: form.dayOfMonth.value, time, tz })
    case 'custom': return t('schedule.human.custom')
    case 'none': return t('schedule.freq.noneHint')
  }
  return ''
})

const nextRunLabel = computed(() => {
  const tz = form.timezone.value
  const now = Date.now()
  let soonest = Infinity
  if (form.cronValid.value) {
    const n = computeNextRuns(form.cronExpression.value, tz, 1)[0]
    if (n) soonest = Math.min(soonest, n.getTime())
  }
  for (const d of form.oneOffDates.value) {
    if (d.getTime() > now) soonest = Math.min(soonest, d.getTime())
  }
  if (!Number.isFinite(soonest)) return ''
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(soonest))
})

const integrationEvents = computed(() => PROVIDER_EVENTS[form.integrationProvider.value])
const statusPresets = computed(() => STATUS_PRESETS[form.integrationProvider.value])
const providerInstalled = computed(() => isInstalled(form.integrationProvider.value))
const providerConnection = computed(() => connectionFor(form.integrationProvider.value))
const providerWebhookSecret = computed(() => {
  const secret = providerConnection.value?.metadata?.webhook_secret
  return typeof secret === 'string' ? secret : ''
})
const providerWebhookUrl = computed(() => {
  const path = `/api/flow-automations/${form.integrationProvider.value}`
  if (!import.meta.client) return path
  return `${window.location.origin}${path}`
})

watch(() => form.integrationProvider.value, (provider) => {
  if (!PROVIDER_EVENTS[provider].some(event => event.value === form.integrationEvent.value)) {
    form.integrationEvent.value = PROVIDER_EVENTS[provider][0]!.value
  }
  form.integrationStatus.value = ''
})

async function onSave() {
  if (!selectedId.value) return
  if (form.triggerType.value === 'integration' && !providerInstalled.value) return
  const ok = await form.save()
  if (ok) emit('saved')
}
async function onRemove() {
  if (!selectedId.value) return
  const ok = await form.removeSchedule()
  if (ok) emit('saved')
}
</script>

<template>
  <div
    v-if="open"
    ref="rootRef"
    class="absolute right-0 top-full z-50 mt-1 flex max-h-[calc(100vh-7rem)] w-[372px] flex-col overflow-hidden rounded-xl bg-white modal-surface"
  >
    <header v-if="isEdit" class="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
      <h2 class="text-body-lg font-semibold text-neutral-950">
        {{ isEdit ? t('schedule.editTitle') : t('schedule.addTitle') }}
      </h2>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:text-neutral-900"
        :title="t('common.close')"
        @click="emit('close')"
      >
        <UIcon name="i-heroicons-x-mark" class="size-4" />
      </button>
    </header>

    <div
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3"
      :class="isEdit ? '' : 'pt-3'"
    >
      <!-- Workflow picker -->
      <div>
        <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
          {{ t('schedule.workflow') }}
        </div>
        <div v-if="selectedId" class="flex h-[28px] items-center gap-2 rounded-md border border-neutral-200 px-2.5">
          <UIcon name="i-heroicons-bolt" class="size-3.5 shrink-0 text-neutral-400" />
          <span class="min-w-0 flex-1 truncate text-body-md font-medium text-neutral-900">{{ workflowName }}</span>
          <button
            v-if="!isEdit"
            type="button"
            class="text-caption text-neutral-500 transition-colors hover:text-neutral-900"
            @click="clearWorkflow"
          >
            {{ t('schedule.change') }}
          </button>
        </div>
        <div v-else>
          <div class="flex h-[28px] items-center gap-2 rounded-md border border-neutral-200 px-2.5 transition-colors focus-within:border-neutral-950">
            <UIcon name="i-heroicons-magnifying-glass" class="size-3.5 shrink-0 text-neutral-400" />
            <input
              v-model="search"
              name="wf-search"
              type="text"
              :placeholder="t('schedule.searchWorkflows')"
              class="min-w-0 flex-1 bg-transparent text-body-md text-neutral-900 outline-none placeholder:text-neutral-400"
            >
          </div>
          <div class="mt-1 max-h-40 overflow-y-auto">
            <div v-for="folder in pickerFolders" :key="folder.id">
              <button type="button"
                class="flex h-[28px] w-full items-center gap-1.5 rounded-md px-2.5 text-left text-body-md font-normal text-neutral-800 transition-colors hover:bg-neutral-100"
                @click="togglePickerFolder(folder.id)">
                <FlowFolderIcon :open="!pickerCollapsedFolders[folder.id]" />
                <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
              </button>
              <template v-if="!pickerCollapsedFolders[folder.id]">
                <button v-for="s in folder.flows" :key="s.id" type="button"
                  class="flex h-[28px] w-full items-center rounded-md pl-7 pr-2.5 text-left text-body-md text-neutral-800 transition-colors hover:bg-neutral-100"
                  @click="pickWorkflow(s.id)">
                  <span class="min-w-0 flex-1 truncate">{{ s.title }}</span>
                </button>
              </template>
            </div>
            <button v-for="s in unfolderedCandidates" :key="s.id" type="button"
              class="flex h-[28px] w-full items-center rounded-md px-2.5 text-left text-body-md text-neutral-800 transition-colors hover:bg-neutral-100"
              @click="pickWorkflow(s.id)">
              <span class="min-w-0 flex-1 truncate">{{ s.title }}</span>
            </button>
            <div v-if="!hasPickerResults" class="px-2.5 py-3 text-center text-caption text-neutral-500">
              {{ t('schedule.noWorkflows') }}
            </div>
          </div>
        </div>
      </div>

      <template v-if="selectedId">
        <div>
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
            {{ t('schedule.automationName') }}
          </div>
          <input
            v-model="form.automationName.value"
            name="automation-name"
            type="text"
            class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md font-medium text-neutral-950 outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
          >
        </div>

        <div class="grid h-[28px] grid-cols-3 gap-1 rounded-md bg-neutral-100 p-0.5">
          <button
            v-for="trigger in TRIGGERS"
            :key="trigger.value"
            type="button"
            class="inline-flex h-full items-center justify-center gap-1.5 rounded text-caption font-medium transition-all"
            :class="form.triggerType.value === trigger.value ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'"
            @click="form.triggerType.value = trigger.value"
          >
            <UIcon :name="trigger.icon" class="size-3.5" />
            {{ t(trigger.labelKey) }}
          </button>
        </div>

        <template v-if="form.triggerType.value === 'schedule'">
        <div>
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
            {{ t('schedule.interval') }}
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="f in FREQS"
              :key="f.value"
              type="button"
              class="h-[28px] rounded-md border px-2.5 text-caption font-medium transition-colors"
              :class="form.frequency.value === f.value
                ? 'border-neutral-950 bg-neutral-950 text-white'
                : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'"
              @click="form.frequency.value = f.value"
            >
              {{ t(f.labelKey) }}
            </button>
          </div>
        </div>

        <!-- Weekly days -->
        <div v-if="form.frequency.value === 'weekly'">
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
            {{ t('schedule.onDays') }}
          </div>
          <div class="flex gap-1.5">
            <button
              v-for="(key, i) in WEEKDAY_KEYS"
              :key="key"
              type="button"
              class="flex h-[28px] w-8 items-center justify-center rounded-md border text-caption font-semibold transition-all"
              :class="form.weekdays.value.has(i)
                ? 'border-neutral-950 bg-neutral-950 text-white'
                : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-900'"
              @click="form.toggleWeekday(i)"
            >
              {{ t(`schedule.weekdayShort.${key}`) }}
            </button>
          </div>
        </div>

        <!-- Custom cron -->
        <div v-if="form.frequency.value === 'custom'">
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">{{ t('schedule.cronExpr') }}</div>
          <input
            v-model="form.customExpr.value"
            name="sched-cron"
            type="text"
            spellcheck="false"
            placeholder="0 9 * * 1-5"
            class="h-[28px] w-full rounded-md border bg-neutral-50 px-2.5 font-mono text-body-md tabular-nums outline-none transition-colors focus:bg-white"
            :class="form.cronValid.value ? 'border-neutral-200 text-neutral-950 focus:border-neutral-950' : 'border-error/40 text-error focus:border-error'"
          >
        </div>

        <!-- Recurring timing: time and timezone form one logical row. -->
        <div class="flex items-end gap-2">
          <div v-if="form.frequency.value !== 'none' && form.frequency.value !== 'custom'">
            <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
              {{ form.frequency.value === 'hourly' ? t('schedule.atMinute') : t('schedule.atTime') }}
            </div>
            <input
              v-if="form.frequency.value === 'hourly'"
              v-model.number="form.minute.value"
              name="sched-minute"
              type="number"
              min="0"
              max="59"
              class="h-[28px] w-20 rounded-md border border-neutral-200 bg-white px-2.5 text-center font-mono text-body-md font-semibold text-neutral-950 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
            >
            <input
              v-else
              v-model="form.hourMinuteTime.value"
              name="sched-time"
              type="time"
              class="h-[28px] w-[96px] rounded-md border border-neutral-200 bg-white px-2.5 font-mono text-body-md font-semibold text-neutral-950 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950 [&::-webkit-calendar-picker-indicator]:hidden"
            >
          </div>
          <div :class="form.frequency.value !== 'none' && form.frequency.value !== 'custom' ? 'ml-auto' : ''">
            <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
              {{ t('schedule.timezone') }}
            </div>
            <ScheduleTimezonePicker v-model="form.timezone.value" />
          </div>
        </div>

        <div v-if="form.frequency.value === 'monthly'">
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">{{ t('schedule.onDayOfMonth') }}</div>
          <div class="inline-flex h-[28px] items-stretch overflow-hidden rounded-md border border-neutral-200 bg-white">
            <button type="button" class="flex w-[28px] items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40" :disabled="form.dayOfMonth.value <= 1" @click="form.dayOfMonth.value = Math.max(1, form.dayOfMonth.value - 1)">
              <UIcon name="i-heroicons-minus" class="size-3.5" />
            </button>
            <div class="flex items-center border-x border-neutral-200 px-2.5 font-mono text-body-md font-semibold text-neutral-950 tabular-nums">{{ pad2(form.dayOfMonth.value) }}</div>
            <button type="button" class="flex w-[28px] items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40" :disabled="form.dayOfMonth.value >= 31" @click="form.dayOfMonth.value = Math.min(31, form.dayOfMonth.value + 1)">
              <UIcon name="i-heroicons-plus" class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- One-off dates -->
        <div>
          <div class="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
            {{ form.frequency.value === 'none' ? t('schedule.pickDate') : t('schedule.specificDates') }}
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="oneOffDate"
              name="oneoff-date"
              type="date"
            class="h-[28px] min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
            >
            <input
              v-model="oneOffTime"
              name="oneoff-time"
              type="time"
              class="h-[28px] w-[92px] rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950 [&::-webkit-calendar-picker-indicator]:hidden"
            >
            <button
              type="button"
              class="flex h-[28px] shrink-0 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 text-body-md font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-50"
              :disabled="!oneOffDate"
              @click="addOneOff"
            >
              <UIcon name="i-heroicons-plus" class="size-3.5" />
            </button>
          </div>
          <ul v-if="sortedOneOffs.length" class="mt-2 flex flex-wrap gap-1.5">
            <li
              v-for="d in sortedOneOffs"
              :key="d.getTime()"
              class="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 py-0.5 pl-2 pr-1 text-caption text-neutral-800 tabular-nums"
            >
              <span>{{ fmtOneOff(d) }}</span>
              <button type="button" class="flex size-4 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-900" @click="removeOneOff(d.getTime())">
                <UIcon name="i-heroicons-x-mark" class="size-3" />
              </button>
            </li>
          </ul>
        </div>

        <p v-if="previewLine" class="text-caption text-neutral-500">
          {{ previewLine }}<template v-if="nextRunLabel"> · {{ t('schedule.nextRunAt', { when: nextRunLabel }) }}</template>
        </p>
        </template>

        <template v-else-if="form.triggerType.value === 'integration'">
          <div
            v-if="!providerInstalled"
            class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-caption leading-5 text-amber-800"
          >
            Connect {{ form.integrationProvider.value === 'github' ? 'GitHub' : 'GitLab' }} on the Connections page before enabling this automation.
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">{{ t('schedule.integrationProvider') }}</span>
              <select v-model="form.integrationProvider.value" class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 outline-none focus:border-neutral-950">
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">{{ t('schedule.integrationEvent') }}</span>
              <select v-model="form.integrationEvent.value" class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 outline-none focus:border-neutral-950">
                <option v-for="event in integrationEvents" :key="event.value" :value="event.value">{{ event.label }}</option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">
              {{ form.integrationProvider.value === 'github' ? 'Repository' : 'Project' }}
            </span>
            <input
              v-model="form.integrationRepo.value"
              name="integration-repo"
              type="text"
              :placeholder="form.integrationProvider.value === 'github' ? 'owner/repository' : 'group/project'"
              class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-950 outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
            >
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">Branch source</span>
              <select v-model="form.integrationBranchScope.value" class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 outline-none focus:border-neutral-950">
                <option v-for="scope in BRANCH_SCOPES" :key="scope.value" :value="scope.value">{{ scope.label }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">Match</span>
              <select v-model="form.integrationBranchMatch.value" class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-900 outline-none focus:border-neutral-950">
                <option v-for="match in BRANCH_MATCHES" :key="match.value" :value="match.value">{{ match.label }}</option>
              </select>
            </label>
          </div>

          <label v-if="form.integrationBranchMatch.value !== 'any'" class="block">
            <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">{{ t('schedule.integrationBranch') }}</span>
            <input
              v-model="form.integrationBranch.value"
              name="integration-branch"
              type="text"
              :placeholder="form.integrationBranchMatch.value === 'glob' ? 'release/*' : 'main'"
              class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-950 outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
            >
          </label>

          <label class="block">
            <span class="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-neutral-500">Status filter</span>
            <input
              v-model="form.integrationStatus.value"
              name="integration-status"
              type="text"
              list="integration-status-presets"
              placeholder="Any status"
              class="h-[28px] w-full rounded-md border border-neutral-200 bg-white px-2.5 text-body-md text-neutral-950 outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
            >
            <datalist id="integration-status-presets">
              <option v-for="status in statusPresets" :key="status" :value="status" />
            </datalist>
          </label>

          <div class="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div class="mb-1 text-caption font-semibold text-neutral-900">Provider webhook</div>
            <code class="block break-all rounded-md bg-white px-2 py-1.5 font-mono text-2xs text-neutral-700">
              {{ providerWebhookUrl }}
            </code>
            <code class="mt-1 block break-all rounded-md bg-white px-2 py-1.5 font-mono text-2xs text-neutral-700">
              {{ providerWebhookSecret || 'Connect provider to generate secret' }}
            </code>
          </div>
        </template>

        <template v-else>
          <div class="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div class="mb-1 text-caption font-semibold text-neutral-900">{{ t('schedule.webhookEndpoint') }}</div>
            <code class="block break-all rounded-md bg-white px-2 py-1.5 font-mono text-2xs text-neutral-700">
              /api/flow-automations/webhook/{{ form.webhookSecret.value || 'generated-after-save' }}
            </code>
          </div>
        </template>

      </template>
    </div>

    <div v-if="selectedId" class="flex min-h-[46px] shrink-0 items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-2">
      <div class="min-w-0">
        <div class="text-caption font-semibold text-neutral-900">{{ t('schedule.launchStatus') }}</div>
        <div class="truncate text-2xs text-neutral-500">{{ t('schedule.launchStatusHint') }}</div>
      </div>
      <div class="inline-flex h-[28px] shrink-0 items-center gap-1 rounded-md bg-neutral-100 p-0.5">
        <button
          type="button"
          class="inline-flex h-full items-center gap-1.5 rounded px-2 text-caption font-medium transition-all"
          :class="form.active.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
          @click="form.tryActivate()"
        >
          <UIcon name="i-heroicons-play-20-solid" class="size-3" />{{ t('schedule.activeOn') }}
        </button>
        <button
          type="button"
          class="inline-flex h-full items-center gap-1.5 rounded px-2 text-caption font-medium transition-all"
          :class="!form.active.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
          @click="form.active.value = false"
        >
          <UIcon name="i-heroicons-pause-20-solid" class="size-3" />{{ t('schedule.activeOff') }}
        </button>
      </div>
    </div>

    <footer
      v-if="selectedId"
      class="shrink-0 items-center gap-2 border-t border-neutral-200 px-4 py-2"
      :class="isEdit ? 'flex' : 'grid grid-cols-[88px_minmax(0,1fr)]'"
    >
      <button
        v-if="isEdit"
        type="button"
        class="mr-auto text-caption font-medium text-neutral-500 transition-colors hover:text-error"
        @click="onRemove"
      >
        {{ t('schedule.removeSchedule') }}
      </button>
      <button
        type="button"
        class="h-[28px] rounded-md border border-neutral-200 bg-white text-caption font-medium text-neutral-700 transition-colors hover:border-neutral-400"
        :class="isEdit ? 'ml-auto px-3' : 'w-full'"
        @click="emit('close')"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="h-[28px] rounded-md bg-neutral-950 text-caption font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        :class="isEdit ? 'px-3.5' : 'w-full'"
        :disabled="!form.hasAutomationConfig.value || (form.triggerType.value === 'integration' && !providerInstalled)"
        @click="onSave"
      >
        {{ isEdit ? t('schedule.save') : t('schedule.addToCalendar') }}
      </button>
    </footer>
  </div>
</template>
