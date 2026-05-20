<script setup lang="ts">
import { CalendarDate, type DateValue, today, getLocalTimeZone } from '@internationalized/date'
import { onClickOutside } from '@vueuse/core'
import { parseCron, computeNextRuns, computePastRuns } from '~/utils/cron'
import type { ScheduleFrequency } from '~/composables/workflows/useScheduledWorkflows'

const { t } = useI18n()
const toast = useAppToast()

const route = useRoute()
const workflowId = computed(() => route.params.id as string)
const { currentWorkspaceId } = useWorkspaces()
const { get: getScheduledConfig, upsert: upsertSchedule, loaded: scheduleLoaded } = useScheduledWorkflows()
const { getWorkflow } = useWorkflows()

// Activation requires a committed workflow_versions row — the Go scheduler
// silently skips fires when LatestVersionID is empty, so an "active" schedule
// on a never-saved workflow would never run.
const hasSavedVersion = ref(false)

type Frequency = ScheduleFrequency

const frequency = ref<Frequency>('daily')
const minute = ref(0)
const hour = ref(9)

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
const minuteText = computed({
  get: () => `:${String(minute.value).padStart(2, '0')}`,
  set: (v: string) => {
    const digits = (v || '').replace(/\D/g, '').slice(-2)
    const n = digits === '' ? 0 : Number(digits)
    if (Number.isFinite(n)) minute.value = Math.min(59, Math.max(0, n))
  },
})
const weekdays = ref<Set<number>>(new Set([1, 2, 3, 4, 5]))
const dayOfMonth = ref(15)
const customExpr = ref('0 9 * * *')
const active = ref(false)
const oneOffDates = ref<Date[]>([])

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezone = ref<string>(localTz)

const allTimezones: string[] = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const tzOpen = ref(false)
const tzQuery = ref('')
const tzTriggerRef = ref<HTMLElement | null>(null)
const tzPanelRef = ref<HTMLElement | null>(null)

function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch { return '' }
}

function tzCity(tz: string): string {
  if (tz === 'UTC') return 'UTC'
  const seg = tz.split('/').pop() ?? tz
  return seg.replace(/_/g, ' ')
}

const pinnedTimezones = computed(() => {
  const pins: string[] = ['UTC']
  if (localTz && !pins.includes(localTz)) pins.unshift(localTz)
  return pins
})

const filteredTimezones = computed(() => {
  const q = tzQuery.value.trim().toLowerCase()
  const base = allTimezones.filter(z => !pinnedTimezones.value.includes(z))
  if (!q) return base
  return base.filter(z => z.toLowerCase().includes(q) || tzCity(z).toLowerCase().includes(q))
})

function pickTz(tz: string) {
  timezone.value = tz
  tzOpen.value = false
  tzQuery.value = ''
}

function onTzDocClick(e: MouseEvent) {
  if (!tzOpen.value) return
  const target = e.target as Node
  if (tzPanelRef.value?.contains(target)) return
  if (tzTriggerRef.value?.contains(target)) return
  tzOpen.value = false
}

const currentTime = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

const liveNow = computed(() =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone.value,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(currentTime.value),
)

const timelineScrollEl = ref<HTMLElement | null>(null)

function centerTimeline(smooth = false) {
  const scroller = timelineScrollEl.value
  if (!scroller) return
  const anchor = scroller.querySelector<HTMLElement>('[data-timeline-anchor="true"]')
  if (!anchor) return
  const target = anchor.offsetTop - scroller.clientHeight / 2 + anchor.clientHeight / 2
  scroller.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
}

function scrollTimelineTo(ms: number) {
  nextTick(() => {
    const scroller = timelineScrollEl.value
    if (!scroller) return
    const el = scroller.querySelector<HTMLElement>(`[data-timeline-ms="${ms}"]`)
    if (!el) return
    const target = el.offsetTop - scroller.clientHeight / 2 + el.clientHeight / 2
    scroller.scrollTop = Math.max(0, target)
  })
}

onMounted(() => {
  document.addEventListener('mousedown', onTzDocClick)
  clockTimer = setInterval(() => { currentTime.value = new Date() }, 15000)
  nextTick(() => centerTimeline())
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onTzDocClick)
  if (clockTimer) clearInterval(clockTimer)
})

const frequencyOptions: { value: Frequency; icon: string; labelKey: string }[] = [
  { value: 'none',    icon: 'i-heroicons-no-symbol',     labelKey: 'schedule.freq.none' },
  { value: 'hourly',  icon: 'i-heroicons-clock',         labelKey: 'schedule.freq.hourly' },
  { value: 'daily',   icon: 'i-heroicons-sun',           labelKey: 'schedule.freq.daily' },
  { value: 'weekly',  icon: 'i-heroicons-calendar-days', labelKey: 'schedule.freq.weekly' },
  { value: 'monthly', icon: 'i-heroicons-calendar',      labelKey: 'schedule.freq.monthly' },
  { value: 'custom',  icon: 'i-heroicons-command-line',  labelKey: 'schedule.freq.custom' },
]

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function toggleWeekday(idx: number) {
  const s = new Set(weekdays.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  weekdays.value = s
}

function pad2(n: number) { return n.toString().padStart(2, '0') }

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
})

const cronValid = computed(() => parseCron(cronExpression.value) != null)
const hasSchedule = computed(() => cronValid.value || oneOffDates.value.length > 0)

function mergeRuns(cron: Date[], oneOffs: Date[], direction: 'asc' | 'desc', limit: number): Date[] {
  const cmp = (x: Date, y: Date) => direction === 'asc' ? x.getTime() - y.getTime() : y.getTime() - x.getTime()
  const seen = new Set<number>()
  const unique: Date[] = []
  for (const d of [...cron, ...oneOffs]) {
    const k = Math.floor(d.getTime() / 60000)
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(d)
  }
  unique.sort(cmp)
  return unique.slice(0, limit)
}

const sortedOneOffDates = computed(() =>
  [...oneOffDates.value].sort((a, b) => a.getTime() - b.getTime()),
)

const nextRuns = computed(() => {
  const nowMs = currentTime.value.getTime()
  const cronRuns = cronValid.value
    ? computeNextRuns(cronExpression.value, timezone.value, 12)
    : []
  const extras = oneOffDates.value.filter(d => d.getTime() > nowMs)
  return mergeRuns(cronRuns, extras, 'asc', 12)
})

const pastRuns = computed(() => {
  const nowMs = currentTime.value.getTime()
  const cronPast = cronValid.value
    ? computePastRuns(cronExpression.value, timezone.value, 12)
    : []
  const extras = oneOffDates.value.filter(d => d.getTime() <= nowMs)
  return mergeRuns(cronPast, extras, 'desc', 12)
})

function nextMinuteHHMM(base: Date = new Date()) {
  const next = new Date(base.getTime() + 60000)
  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
}

const pickerOpen = ref(false)
const pickerRef = ref<HTMLElement | null>(null)
const pickerDate = ref<DateValue | null>(today(getLocalTimeZone()))
const pickerTime = ref(nextMinuteHHMM())

onClickOutside(pickerRef, () => { pickerOpen.value = false })

const minCalendarDate = computed(() => today(getLocalTimeZone()))

const isPickerDateToday = computed(() => {
  const d = pickerDate.value
  if (!d) return false
  const t = minCalendarDate.value
  return d.year === t.year && d.month === t.month && d.day === t.day
})

const minPickerTime = computed(() => {
  if (!isPickerDateToday.value) return undefined
  return nextMinuteHHMM()
})

function bumpTimeIfPast() {
  if (!isPickerDateToday.value) return
  const [hh = '0', mm = '0'] = pickerTime.value.split(':')
  const now = new Date()
  const pickMin = (Number(hh) || 0) * 60 + (Number(mm) || 0)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (pickMin > nowMin) return
  const next = new Date(now.getTime() + 60000)
  pickerTime.value = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  if (next.getDate() !== now.getDate()) {
    pickerDate.value = minCalendarDate.value.add({ days: 1 })
  }
}

function openPicker() {
  if (!pickerDate.value) {
    pickerDate.value = today(getLocalTimeZone())
  }
  bumpTimeIfPast()
  pickerOpen.value = !pickerOpen.value
}

watch(pickerDate, (newVal) => {
  if (pickerOpen.value && newVal) pickerOpen.value = false
  bumpTimeIfPast()
}, { immediate: true })

watch(currentTime, () => bumpTimeIfPast())

const pickerDateDisplay = computed(() => {
  const d = pickerDate.value
  if (!d) return ''
  const js = new Date(d.year, d.month - 1, d.day)
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(js)
})

const pickerDateTime = computed(() => {
  const cd = pickerDate.value
  if (!cd) return null
  const [hhStr = '09', mmStr = '00'] = pickerTime.value.split(':')
  return new Date(cd.year, cd.month - 1, cd.day, Number(hhStr) || 0, Number(mmStr) || 0)
})

const canAddOneOffDate = computed(() => {
  const d = pickerDateTime.value
  return !!d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now()
})

function addOneOffDate() {
  if (!canAddOneOffDate.value) return
  const d = pickerDateTime.value!
  const key = Math.floor(d.getTime() / 60000)
  if (oneOffDates.value.some(x => Math.floor(x.getTime() / 60000) === key)) {
    pickerDate.value = today(getLocalTimeZone())
    return
  }
  oneOffDates.value = [...oneOffDates.value, d]
  pickerDate.value = today(getLocalTimeZone())
  scrollTimelineTo(d.getTime())
}

function removeOneOffDate(ms: number) {
  oneOffDates.value = oneOffDates.value.filter(d => d.getTime() !== ms)
}

type TimelineItem =
  | { kind: 'past' | 'future'; date: Date; key: string; removable: boolean }
  | { kind: 'next'; date: Date; key: string; removable: boolean }
  | { kind: 'now'; key: string }

const oneOffKeySet = computed(() => new Set(oneOffDates.value.map(d => d.getTime())))

const timelineItems = computed<TimelineItem[]>(() => {
  const past = [...pastRuns.value].reverse()
  const future = nextRuns.value
  const items: TimelineItem[] = []
  for (const d of past) {
    items.push({
      kind: 'past', date: d, key: `p-${d.getTime()}`,
      removable: oneOffKeySet.value.has(d.getTime()),
    })
  }
  items.push({ kind: 'now', key: 'now' })
  for (let i = 0; i < future.length; i++) {
    const d = future[i]!
    items.push({
      kind: i === 0 ? 'next' : 'future', date: d, key: `f-${d.getTime()}`,
      removable: oneOffKeySet.value.has(d.getTime()),
    })
  }
  return items
})

const centerAnchorKey = computed(() => {
  const next = nextRuns.value[0]
  if (next) return `f-${next.getTime()}`
  return 'now'
})

function formatRunDate(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone.value,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

function formatOneOffChip(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone.value,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

function formatRelative(d: Date) {
  const diff = d.getTime() - currentTime.value.getTime()
  const past = diff < 0
  const absMins = Math.max(Math.round(Math.abs(diff) / 60000), 1)
  if (absMins < 60) {
    return t(past ? 'schedule.relative.minutesAgo' : 'schedule.relative.inMinutes', { n: absMins })
  }
  const hrs = Math.round(absMins / 60)
  if (hrs < 24) {
    return t(past ? 'schedule.relative.hoursAgo' : 'schedule.relative.inHours', { n: hrs })
  }
  const days = Math.round(hrs / 24)
  return t(past ? 'schedule.relative.daysAgo' : 'schedule.relative.inDays', { n: days })
}

function tryActivate() {
  if (!hasSavedVersion.value) {
    toast.show(t('schedule.activeNeedsVersion'), 'warning', 4000)
    return
  }
  active.value = true
}

async function onSave() {
  if (!hasSchedule.value) {
    toast.show(t('schedule.invalidCron'), 'error', 3000)
    return
  }
  if (!currentWorkspaceId.value) {
    toast.show(t('schedule.invalidCron'), 'error', 3000)
    return
  }
  if (active.value && !hasSavedVersion.value) {
    toast.show(t('schedule.activeNeedsVersion'), 'error', 4000)
    return
  }
  const saved = await upsertSchedule(workflowId.value, {
    active: active.value,
    frequency: frequency.value,
    cron_expression: cronExpression.value,
    weekdays: [...weekdays.value].sort((a, b) => a - b),
    timezone: timezone.value,
    one_off_ms: oneOffDates.value.map(d => d.getTime()),
  })
  if (saved) toast.show(t('schedule.saved'), 'info', 3000)
  else toast.show(t('schedule.invalidCron'), 'error', 3000)
}

// Hydrate the editor from the persisted config (if any) so reopening the
// Schedule tab shows the last-saved state instead of defaults. Runs when
// route/workspace change AND when the composable finishes its initial
// fetch — the schedule row may not exist yet at first render.
function hydrateFromStore() {
  const cfg = getScheduledConfig(workflowId.value)
  if (!cfg) return
  frequency.value = cfg.frequency
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
}

watch([workflowId, currentWorkspaceId, scheduleLoaded], async ([wfId, wsId, loaded]) => {
  if (!wfId || !wsId || !loaded) return
  hydrateFromStore()
  // Resolve hasSavedVersion AFTER hydration so the title/toggle reflect the
  // final coerced state in a single tick — otherwise hydrateFromStore could
  // re-set active=true after we flipped it.
  const wf = await getWorkflow(wsId, wfId)
  const versionPresent = !!wf?.latest_version?.id
  hasSavedVersion.value = versionPresent
  if (!versionPresent && active.value) active.value = false
}, { immediate: true })

const tzTriggerLabel = computed(() => {
  if (timezone.value === localTz) return t('schedule.tzLocal', { tz: tzCity(localTz) })
  return tzCity(timezone.value)
})

const tzTriggerOffset = computed(() => tzOffset(timezone.value))
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <template #title>
      <div
        class="truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl"
        :class="active ? 'text-neutral-900' : 'text-neutral-400'"
      >
        <template v-if="!active">
          {{ t('schedule.activeOff') }}
        </template>
        <template v-else-if="nextRuns.length === 0">
          {{ t('schedule.noRunsShort') }}
        </template>
        <template v-else>
          {{ formatRunDate(nextRuns[0]!) }}
          <span class="font-medium text-neutral-500">· {{ formatRelative(nextRuns[0]!) }}</span>
        </template>
      </div>
    </template>
    <template #actions>
      <div class="flex shrink-0 items-center gap-2">
        <!-- Timezone: applies to both interval and specific-date schedules -->
        <div class="relative">
          <button
            ref="tzTriggerRef"
            type="button"
            class="inline-flex h-6 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-caption text-neutral-700 transition-colors hover:border-neutral-400"
            :class="tzOpen ? 'border-neutral-950' : ''"
            :title="t('schedule.timezone')"
            @click="tzOpen = !tzOpen"
          >
            <UIcon name="i-heroicons-globe-alt" class="size-3 shrink-0 text-neutral-500" />
            <span class="font-medium">{{ tzCity(timezone) }}</span>
            <span v-if="tzTriggerOffset" class="font-mono text-neutral-500 tabular-nums">
              {{ tzTriggerOffset }}
            </span>
            <UIcon
              name="i-heroicons-chevron-down-20-solid"
              class="size-3 text-neutral-400 transition-transform"
              :class="tzOpen ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="tzOpen"
            ref="tzPanelRef"
            class="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
          >
            <div class="flex items-center gap-2 border-b border-neutral-200/80 px-3 py-2">
              <UIcon name="i-heroicons-magnifying-glass" class="size-3.5 shrink-0 text-neutral-400" />
              <input
                v-model="tzQuery"
                name="tz-search"
                type="text"
                :placeholder="t('schedule.tzSearch')"
                class="min-w-0 flex-1 bg-transparent text-body-md text-neutral-900 outline-none placeholder:text-neutral-400"
              >
            </div>
            <div class="max-h-64 overflow-y-auto overscroll-contain">
              <div v-if="!tzQuery" class="py-1">
                <div class="px-3 pb-1 pt-1.5 text-caption font-medium uppercase tracking-wider text-neutral-400">
                  {{ t('schedule.tzPinned') }}
                </div>
                <button
                  v-for="tz in pinnedTimezones"
                  :key="tz"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-md transition-colors hover:bg-neutral-100"
                  :class="timezone === tz ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                  @click="pickTz(tz)"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <UIcon
                      v-if="timezone === tz"
                      name="i-heroicons-check-20-solid"
                      class="size-3.5 shrink-0 text-neutral-950"
                    />
                    <span v-else class="size-3.5 shrink-0" />
                    <span class="truncate">
                      {{ tz === localTz ? t('schedule.tzLocal', { tz: tzCity(tz) }) : tzCity(tz) }}
                    </span>
                  </span>
                  <span class="font-mono text-caption text-neutral-500 tabular-nums">
                    {{ tzOffset(tz) }}
                  </span>
                </button>
                <div class="my-1 h-px bg-neutral-200/80" />
              </div>
              <div v-if="filteredTimezones.length === 0 && tzQuery" class="px-3 py-6 text-center text-caption text-neutral-500">
                {{ t('schedule.noTzResults') }}
              </div>
              <button
                v-for="tz in filteredTimezones"
                :key="tz"
                type="button"
                class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-md transition-colors hover:bg-neutral-100"
                :class="timezone === tz ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                @click="pickTz(tz)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <UIcon
                    v-if="timezone === tz"
                    name="i-heroicons-check-20-solid"
                    class="size-3.5 shrink-0 text-neutral-950"
                  />
                  <span v-else class="size-3.5 shrink-0" />
                  <span class="truncate">{{ tzCity(tz) }}</span>
                </span>
                <span class="font-mono text-caption text-neutral-500 tabular-nums">
                  {{ tzOffset(tz) }}
                </span>
              </button>
            </div>
          </div>
        </div>
        <div class="inline-flex h-6 items-center gap-1 rounded-lg bg-neutral-100 p-1">
          <button
            type="button"
            class="inline-flex h-full items-center gap-1.5 rounded-md px-2 text-xs font-medium leading-none transition-all"
            :class="active
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'"
            :aria-label="t('schedule.activeOn')"
            @click="tryActivate"
          >
            <UIcon name="i-heroicons-play-20-solid" class="size-3" />
            <span class="hidden sm:inline">{{ t('schedule.activeOn') }}</span>
          </button>
          <button
            type="button"
            class="inline-flex h-full items-center gap-1.5 rounded-md px-2 text-xs font-medium leading-none transition-all"
            :class="!active
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'"
            :aria-label="t('schedule.activeOff')"
            @click="active = false"
          >
            <UIcon name="i-heroicons-pause-20-solid" class="size-3" />
            <span class="hidden sm:inline">{{ t('schedule.activeOff') }}</span>
          </button>
        </div>
        <button
          type="button"
          class="inline-flex h-6 items-center rounded-lg bg-neutral-950 px-3.5 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!hasSchedule"
          @click="onSave"
        >
          {{ t('schedule.save') }}
        </button>
      </div>
    </template>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-5">
        <div class="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-5 lg:grid-rows-1">
          <!-- Left: frequency + detail controls -->
          <div class="min-h-0 min-w-0 space-y-4 lg:col-span-3">
            <section class="min-w-0">
              <h3 class="mb-2 text-caption font-semibold uppercase tracking-wider text-neutral-500">
                {{ t('schedule.interval') }}
              </h3>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="opt in frequencyOptions"
                  :key="opt.value"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-body-md font-medium transition-colors"
                  :class="frequency === opt.value
                    ? 'border-neutral-950 bg-neutral-950 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50'"
                  @click="frequency = opt.value"
                >
                  <UIcon :name="opt.icon" class="size-3.5 shrink-0" />
                  {{ t(opt.labelKey) }}
                </button>
              </div>
            </section>

            <section v-if="frequency !== 'none'" class="min-w-0">
              <h3 class="mb-2 text-caption font-semibold uppercase tracking-wider text-neutral-500">
                {{ t('schedule.when') }}
              </h3>
              <div class="rounded-xl ghost-panel bg-white p-4">
              <!-- Hourly -->
              <div v-if="frequency === 'hourly'">
                <label class="mb-1.5 block text-caption font-medium text-neutral-600">
                  {{ t('schedule.atMinute') }}
                </label>
                <input
                  v-model.lazy="minuteText"
                  name="schedule-minute"
                  type="text"
                  inputmode="numeric"
                  maxlength="3"
                  class="h-11 w-20 rounded-lg border border-neutral-200 bg-white px-3.5 text-center font-mono text-lg font-semibold text-neutral-950 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
                >
              </div>

              <!-- Daily / Weekly / Monthly time picker -->
              <div v-else-if="frequency !== 'custom'" class="space-y-3.5">
                <div class="flex flex-wrap items-start gap-x-6 gap-y-3.5">
                  <div>
                    <label class="mb-1.5 block text-caption font-medium text-neutral-600">
                      {{ t('schedule.atTime') }}
                    </label>
                    <input
                      v-model="hourMinuteTime"
                      name="schedule-time"
                      type="time"
                      class="h-11 rounded-lg border border-neutral-200 bg-white px-3.5 font-mono text-lg font-semibold text-neutral-950 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    >
                  </div>

                  <!-- Weekly: day chips -->
                  <div v-if="frequency === 'weekly'" class="min-w-0 flex-1">
                    <label class="mb-1.5 block text-caption font-medium text-neutral-600">
                      {{ t('schedule.onDays') }}
                    </label>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="(key, i) in WEEKDAY_KEYS"
                        :key="key"
                        type="button"
                        class="flex size-11 items-center justify-center rounded-lg border text-body-md font-semibold transition-all"
                        :class="weekdays.has(i)
                          ? 'border-neutral-950 bg-neutral-950 text-white'
                          : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-900'"
                        @click="toggleWeekday(i)"
                      >
                        {{ t(`schedule.weekdayShort.${key}`) }}
                      </button>
                    </div>
                  </div>

                  <!-- Monthly: dom -->
                  <div v-if="frequency === 'monthly'">
                    <label class="mb-1.5 block text-caption font-medium text-neutral-600">
                      {{ t('schedule.onDayOfMonth') }}
                    </label>
                    <div class="inline-flex h-11 items-stretch overflow-hidden rounded-lg border border-neutral-200 bg-white">
                      <button
                        type="button"
                        class="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="dayOfMonth <= 1"
                        @click="dayOfMonth = Math.max(1, dayOfMonth - 1)"
                      >
                        <UIcon name="i-heroicons-minus" class="size-3.5" />
                      </button>
                      <div class="flex items-center border-x border-neutral-200 px-4">
                        <span class="font-mono text-lg font-semibold text-neutral-950 tabular-nums">
                          {{ pad2(dayOfMonth) }}
                        </span>
                      </div>
                      <button
                        type="button"
                        class="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                        :disabled="dayOfMonth >= 31"
                        @click="dayOfMonth = Math.min(31, dayOfMonth + 1)"
                      >
                        <UIcon name="i-heroicons-plus" class="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Custom -->
              <div v-else class="space-y-2">
                <label class="block text-caption font-medium text-neutral-600">
                  {{ t('schedule.cronExpr') }}
                </label>
                <input
                  v-model="customExpr"
                  name="custom-cron-expr"
                  type="text"
                  spellcheck="false"
                  class="w-full rounded-lg border bg-neutral-50 px-3 py-2.5 font-mono text-body-md tabular-nums outline-none transition-colors focus:bg-white"
                  :class="cronValid ? 'border-neutral-200 text-neutral-950 focus:border-neutral-950' : 'border-error/40 text-error focus:border-error'"
                  placeholder="0 9 * * 1-5"
                >
              </div>

            </div>
          </section>

          <section class="min-w-0">
            <h3 class="mb-2 text-caption font-semibold uppercase tracking-wider text-neutral-500">
              {{ t('schedule.specificDates') }}
            </h3>
            <div class="rounded-xl ghost-panel bg-white p-3">
              <form class="flex items-center gap-2" @submit.prevent="addOneOffDate">
                <div ref="pickerRef" class="relative min-w-0 flex-1">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-body-md text-neutral-900 tabular-nums outline-none transition-colors hover:border-neutral-400 focus:border-neutral-950"
                    @click="openPicker"
                  >
                    <UIcon name="i-heroicons-calendar" class="size-3.5 shrink-0 text-neutral-400" />
                    <span v-if="pickerDateDisplay" class="flex-1 truncate text-left">{{ pickerDateDisplay }}</span>
                    <span v-else class="flex-1 truncate text-left text-neutral-400">{{ t('schedule.pickDate') }}</span>
                  </button>
                  <Menu :open="pickerOpen" align="left" width="w-auto">
                    <div class="px-1.5 py-1.5">
                      <!-- v-model cast: CalendarDate is structurally identical
                           to UCalendar's expected DateValue (CalendarDate is
                           a member of that union) but TS can't reconcile the
                           expanded structural form coming from
                           @internationalized/date with reka-ui's re-export. -->
                      <UCalendar
                        :model-value="(pickerDate as unknown as DateValue | undefined)"
                        @update:model-value="(v: unknown) => pickerDate = (v ?? null) as DateValue | null"
                        size="xs"
                        :min-value="minCalendarDate"
                        :ui="{
                          cellTrigger: 'size-6 m-0 text-neutral-900 data-[outside-view]:text-neutral-300 data-disabled:bg-neutral-100 data-disabled:text-neutral-400 data-disabled:hover:bg-neutral-100',
                          body: 'pt-2',
                          header: 'gap-1',
                          heading: 'text-caption',
                        }"
                      />
                    </div>
                  </Menu>
                </div>
                <div class="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 transition-colors focus-within:border-neutral-950 hover:border-neutral-400">
                  <UIcon name="i-heroicons-clock" class="size-3.5 shrink-0 text-neutral-400" />
                  <input
                    v-model="pickerTime"
                    name="one-off-time"
                    type="time"
                    class="w-[72px] bg-transparent text-body-md text-neutral-900 tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    @blur="bumpTimeIfPast"
                  >
                </div>
                <button
                  type="submit"
                  class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-body-md font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!canAddOneOffDate"
                >
                  <UIcon name="i-heroicons-plus" class="size-3.5" />
                  {{ t('schedule.addDate') }}
                </button>
              </form>
              <ul v-if="sortedOneOffDates.length" class="mt-2 flex flex-wrap gap-1.5">
                <li
                  v-for="d in sortedOneOffDates"
                  :key="d.getTime()"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 py-1 pl-2.5 pr-1 text-body-md text-neutral-800 tabular-nums"
                >
                  <span>{{ formatOneOffChip(d) }}</span>
                  <button
                    type="button"
                    class="flex size-4 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                    :title="t('schedule.removeDate')"
                    @click="removeOneOffDate(d.getTime())"
                  >
                    <UIcon name="i-heroicons-x-mark" class="size-3" />
                  </button>
                </li>
              </ul>
              <div v-else class="mt-2 text-caption text-neutral-500">
                {{ t('schedule.noSpecificDates') }}
              </div>
            </div>
          </section>
          </div>

          <!-- Right: run timeline -->
          <section class="flex min-h-0 min-w-0 flex-col lg:col-span-2">
            <div class="mb-2 flex shrink-0 items-center justify-between pl-1 pr-3">
              <h3 class="text-caption font-semibold uppercase tracking-wider text-neutral-500">
                {{ t('schedule.timeline') }}
              </h3>
              <button
                v-if="timelineItems.length > 1"
                type="button"
                class="text-caption text-neutral-500 transition-colors hover:text-neutral-900"
                @click="centerTimeline(true)"
              >
                {{ t('schedule.recenter') }}
              </button>
            </div>
            <div class="ghost-panel mb-1.5 flex min-h-0 flex-1 flex-col rounded-xl bg-white">
              <div
                class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl transition-opacity"
                :class="active ? '' : 'opacity-50'"
              >
                <div
                  v-if="timelineItems.length <= 1"
                  class="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center"
                >
                  <UIcon name="i-heroicons-no-symbol" class="size-4 text-neutral-400" />
                  <div class="text-caption text-neutral-500">{{ t('schedule.noRuns') }}</div>
                </div>
                <div
                  v-else
                  ref="timelineScrollEl"
                  class="scrollbar-hide relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
                >
                <ol class="relative">
                  <li
                    v-for="(item, idx) in timelineItems"
                    :key="item.key"
                    :data-timeline-anchor="item.key === centerAnchorKey ? 'true' : undefined"
                    :data-timeline-ms="item.kind === 'now' ? undefined : item.date.getTime()"
                    class="group relative flex items-stretch gap-3 px-3.5"
                  >
                    <div class="flex w-3 shrink-0 flex-col items-center">
                      <span v-if="idx !== 0" class="w-[2px] flex-1 bg-neutral-300" />
                      <span v-else class="flex-1" />
                      <template v-if="item.kind === 'now'">
                        <span class="relative flex size-2.5 shrink-0 items-center justify-center">
                          <span class="absolute inline-flex size-3 animate-ping rounded-full bg-emerald-400/60" />
                          <span class="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                        </span>
                      </template>
                      <span
                        v-else
                        class="size-2.5 shrink-0 rounded-full"
                        :class="{
                          'bg-neutral-300': item.kind === 'past',
                          'bg-neutral-950': item.kind === 'next',
                          'bg-neutral-400': item.kind === 'future',
                        }"
                      />
                      <span v-if="idx !== timelineItems.length - 1" class="w-[2px] flex-1 bg-neutral-300" />
                      <span v-else class="flex-1" />
                    </div>
                    <template v-if="item.kind === 'now'">
                      <div class="flex min-w-0 flex-1 items-center py-2">
                        <div class="truncate text-body-md tabular-nums">
                          <span class="font-semibold uppercase tracking-wider text-emerald-600">
                            {{ t('schedule.now') }}
                          </span>
                          <span class="text-neutral-500">:</span>
                          <span class="ml-1 font-medium text-neutral-900">{{ liveNow }}</span>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="flex min-w-0 flex-1 items-center gap-3 py-2">
                        <div
                          class="min-w-0 flex-1 truncate text-body-md tabular-nums"
                          :class="{
                            'text-neutral-500': item.kind === 'past',
                            'font-semibold text-neutral-950': item.kind === 'next',
                            'font-medium text-neutral-900': item.kind === 'future',
                          }"
                        >
                          {{ formatRunDate(item.date) }}
                        </div>
                        <template v-if="item.removable">
                          <span
                            class="shrink-0 text-caption tabular-nums group-hover:hidden"
                            :class="item.kind === 'past' ? 'text-neutral-400' : 'text-neutral-500'"
                          >
                            {{ formatRelative(item.date) }}
                          </span>
                          <button
                            type="button"
                            class="hidden size-5 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 group-hover:inline-flex"
                            :title="t('schedule.removeDate')"
                            @click="removeOneOffDate(item.date.getTime())"
                          >
                            <UIcon name="i-heroicons-x-mark" class="size-3.5" />
                          </button>
                        </template>
                        <span
                          v-else
                          class="shrink-0 text-caption tabular-nums"
                          :class="item.kind === 'past' ? 'text-neutral-400' : 'text-neutral-500'"
                        >
                          {{ formatRelative(item.date) }}
                        </span>
                      </div>
                    </template>
                  </li>
                </ol>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </TabPanel>
</template>
