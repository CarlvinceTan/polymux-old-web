<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { CalendarDate, today, getLocalTimeZone, startOfWeek, startOfMonth, toZoned } from '@internationalized/date'
import { useSidebar } from '~/composables/ui/useSidebar'
import { useScheduleCalendar, dateKeyInTz, minutesOfDayInTz, type CalendarRun } from '~/composables/workflows/useScheduleCalendar'
import type { CalDay } from '~/components/schedule/ScheduleMonthView.vue'
import type { WeekDay } from '~/components/schedule/ScheduleWeekView.vue'
import type { ListGroup } from '~/components/schedule/ScheduleListView.vue'
import type { LegendItem } from '~/components/schedule/ScheduleUpcomingRail.vue'
import type { ScheduledWorkflowConfig } from '~/composables/workflows/useScheduledWorkflows'

// Calendar-first Automations: schedule triggers are placed on the calendar
// like events. The popover can also configure Integration and Webhook triggers.
const { t, locale } = useI18n()
const { isCollapsed: isSidebarCollapsed } = useSidebar()
const { fetchSessions } = useWorkflowList()
const { list, fetchList } = useScheduledWorkflows()
const { runsInRange, upcoming } = useScheduleCalendar()

onMounted(() => { fetchSessions(); fetchList() })

type ViewMode = 'month' | 'week' | 'list'
const view = ref<ViewMode>('month')
const displayTz = ref<string>(getLocalTimeZone())
const anchor = ref<CalendarDate>(today(getLocalTimeZone()))
const hidden = ref<Set<string>>(new Set())
const periodPickerOpen = ref(false)
const periodPickerRoot = ref<HTMLElement | null>(null)
const pickerCursor = ref<CalendarDate>(startOfMonth(anchor.value))

// Live clock — drives the "now" line and the next-run highlight.
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = new Date() }, 30000) })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })
onClickOutside(periodPickerRoot, () => { periodPickerOpen.value = false })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') periodPickerOpen.value = false
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

watch([view, anchor], () => {
  pickerCursor.value = startOfMonth(anchor.value as CalendarDate)
  if (view.value === 'list') periodPickerOpen.value = false
})

const todayCD = computed(() => today(displayTz.value))

// --- popover state ---
const popoverOpen = ref(false)
const popoverAutomationId = ref<string | null>(null)
const popoverPrefill = ref<string | null>(null)

function openAdd(dateKey?: string) {
  popoverAutomationId.value = null
  popoverPrefill.value = dateKey ?? null
  popoverOpen.value = true
}
function openEdit(automationId: string) {
  popoverAutomationId.value = automationId
  popoverPrefill.value = null
  popoverOpen.value = true
}
function onSaved() {
  popoverOpen.value = false
  fetchList(true)
}
function toggleHidden(id: string) {
  const s = new Set(hidden.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  hidden.value = s
}

// --- date helpers ---
// Reconstruct a fresh CalendarDate from the y/m/d — Vue's ref/computed
// unwrapping strips the class's private brand, so the reactive value no longer
// satisfies the library's class-typed signatures. Rebuilding restores it.
function cdStartMs(cd: { year: number; month: number; day: number }): number {
  return toZoned(new CalendarDate(cd.year, cd.month, cd.day), displayTz.value).toDate().getTime()
}
function keyToCD(key: string): CalendarDate {
  const [y, m, d] = key.split('-').map(Number)
  return new CalendarDate(y!, m!, d!)
}
function dayDiff(key: string): number {
  return Math.round((cdStartMs(keyToCD(key)) - cdStartMs(todayCD.value)) / 86400000)
}
function fmtDayLabel(key: string): string {
  const cd = keyToCD(key)
  return new Intl.DateTimeFormat(locale.value, { weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(cd.year, cd.month - 1, cd.day))
}
function relLabel(key: string): string {
  const d = dayDiff(key)
  if (d === 0) return t('schedule.today')
  if (d === 1) return t('schedule.tomorrow')
  if (d < 0) return ''
  return t('schedule.inDaysShort', { n: d })
}

function groupByDay(runs: CalendarRun[]): ListGroup[] {
  const map = new Map<string, CalendarRun[]>()
  for (const r of runs) {
    const key = dateKeyInTz(r.ms, displayTz.value)
    const arr = map.get(key)
    if (arr) arr.push(r)
    else map.set(key, [r])
  }
  return [...map.entries()].map(([key, rs]) => ({
    key, dayLabel: fmtDayLabel(key), relLabel: relLabel(key), runs: rs,
  }))
}

// --- next run highlight (soonest active, non-hidden, future run) ---
const nextMs = computed<number | null>(() => upcoming(now.value.getTime(), 1, hidden.value)[0]?.ms ?? null)

// --- month view data ---
const monthWeeks = computed<CalDay[][]>(() => {
  const first = startOfMonth(anchor.value as CalendarDate)
  const gridStart = startOfWeek(first, 'en-US')
  const cells = Array.from({ length: 42 }, (_, i) => gridStart.add({ days: i }))
  const runs = runsInRange(cdStartMs(gridStart), cdStartMs(gridStart.add({ days: 42 })), { hidden: hidden.value, includePaused: true })
  const byDay = new Map<string, CalendarRun[]>()
  for (const r of runs) {
    const k = dateKeyInTz(r.ms, displayTz.value)
    const arr = byDay.get(k)
    if (arr) arr.push(r)
    else byDay.set(k, [r])
  }
  const days: CalDay[] = cells.map(cd => ({
    key: cd.toString(),
    day: cd.day,
    inMonth: cd.month === anchor.value.month && cd.year === anchor.value.year,
    isToday: cd.compare(todayCD.value) === 0,
    runs: byDay.get(cd.toString()) ?? [],
  }))
  const weeks: CalDay[][] = []
  for (let i = 0; i < 6; i++) weeks.push(days.slice(i * 7, i * 7 + 7))
  return weeks
})

// --- week view data ---
const weekStart = computed(() => startOfWeek(anchor.value as CalendarDate, 'en-US'))
const weekDays = computed<WeekDay[]>(() => {
  const start = weekStart.value
  const cells = Array.from({ length: 7 }, (_, i) => start.add({ days: i }))
  const runs = runsInRange(cdStartMs(start), cdStartMs(start.add({ days: 7 })), { hidden: hidden.value, includePaused: true })
  const byDay = new Map<string, CalendarRun[]>()
  for (const r of runs) {
    const k = dateKeyInTz(r.ms, displayTz.value)
    const arr = byDay.get(k)
    if (arr) arr.push(r)
    else byDay.set(k, [r])
  }
  const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
  return cells.map(cd => ({
    key: cd.toString(),
    dow: t(`schedule.weekdayLong.${dow[new Date(cd.year, cd.month - 1, cd.day).getDay()]!}`).slice(0, 3),
    dayNum: cd.day,
    isToday: cd.compare(todayCD.value) === 0,
    runs: (byDay.get(cd.toString()) ?? []).map(r => ({ ...r, minutes: minutesOfDayInTz(r.ms, displayTz.value) })),
  }))
})
const weekShowsNow = computed(() => {
  const d = todayCD.value.compare(weekStart.value)
  return d >= 0 && d < 7
})
const nowMinutes = computed(() => minutesOfDayInTz(now.value.getTime(), displayTz.value))

// --- period picker ---
const weekPickerWeeks = computed<CalDay[][]>(() => {
  const first = startOfMonth(pickerCursor.value as CalendarDate)
  const gridStart = startOfWeek(first, 'en-US')
  const days: CalDay[] = Array.from({ length: 42 }, (_, i) => {
    const cd = gridStart.add({ days: i })
    return {
      key: cd.toString(),
      day: cd.day,
      inMonth: cd.month === pickerCursor.value.month && cd.year === pickerCursor.value.year,
      isToday: cd.compare(todayCD.value) === 0,
      runs: [],
    }
  })
  const weeks: CalDay[][] = []
  for (let i = 0; i < 6; i++) weeks.push(days.slice(i * 7, i * 7 + 7))
  return weeks
})
const pickerYearMonths = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    return {
      key: `${pickerCursor.value.year}-${month}`,
      label: new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(pickerCursor.value.year, i, 1)),
      month,
    }
  }),
)
const pickerMonthLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' })
    .format(new Date(pickerCursor.value.year, pickerCursor.value.month - 1, 1)),
)
const pickerYearLabel = computed(() => String(pickerCursor.value.year))

function togglePeriodPicker() {
  if (view.value === 'list') return
  pickerCursor.value = startOfMonth(anchor.value as CalendarDate)
  periodPickerOpen.value = !periodPickerOpen.value
}
function movePicker(offset: number) {
  pickerCursor.value = pickerCursor.value.add(view.value === 'week' ? { months: offset } : { years: offset })
}
function pickMonth(month: number) {
  anchor.value = new CalendarDate(pickerCursor.value.year, month, 1)
  periodPickerOpen.value = false
}
function pickWeek(week: CalDay[]) {
  anchor.value = keyToCD(week[0]?.key ?? pickerCursor.value.toString())
  periodPickerOpen.value = false
}
function isSelectedMonth(month: number): boolean {
  return view.value === 'month' && anchor.value.year === pickerCursor.value.year && anchor.value.month === month
}
function isSelectedWeek(week: CalDay[]): boolean {
  if (view.value !== 'week') return false
  return week[0]?.key === weekStart.value.toString()
}

// --- list view data ---
const listGroups = computed<ListGroup[]>(() =>
  groupByDay(upcoming(now.value.getTime(), 200, hidden.value, 60, true)),
)

// --- rail data ---
const railGroups = computed<ListGroup[]>(() =>
  groupByDay(upcoming(now.value.getTime(), 24, hidden.value, 60)),
)
function summaryFor(cfg: ScheduledWorkflowConfig): string {
  if (!cfg.active) return t('schedule.activeOff')
  if (cfg.trigger_type === 'integration') {
    const provider = String(cfg.integration_config.provider ?? 'Integration')
    const event = String(cfg.integration_config.event_type ?? 'event')
    return `${provider} · ${event}`
  }
  if (cfg.trigger_type === 'webhook') return 'Webhook'
  const time = `${String(cfg.cron_expression.split(/\s+/)[1] ?? 0).padStart(2, '0')}:${String(cfg.cron_expression.split(/\s+/)[0] ?? 0).padStart(2, '0')}`
  switch (cfg.frequency) {
    case 'hourly': return `:${String(cfg.cron_expression.split(/\s+/)[0] ?? 0).padStart(2, '0')}`
    case 'daily': return time
    case 'weekly': {
      const wd = [...cfg.weekdays].sort((a, b) => a - b)
      const isWkdy = wd.length === 5 && wd.every((v, i) => v === i + 1)
      return `${isWkdy ? t('schedule.weekdaysShort') : `${wd.length}${t('schedule.daysShort')}`} ${time}`
    }
    case 'monthly': return `d${cfg.cron_expression.split(/\s+/)[2] ?? '1'} ${time}`
    case 'custom': return t('schedule.freq.custom')
    case 'none': return t('schedule.oneOff')
  }
  return ''
}
const { sessions } = useWorkflowList()
function workflowName(id: string): string {
  return sessions.value.find(s => s.id === id)?.title || `Flow ${id.slice(0, 8)}`
}
const legend = computed<LegendItem[]>(() =>
  list.value.map(cfg => ({
    automationId: cfg.automation_id,
    workflowId: cfg.flow_id,
    name: cfg.name || workflowName(cfg.flow_id),
    summary: summaryFor(cfg),
    active: cfg.active,
    hidden: hidden.value.has(cfg.automation_id),
  })),
)

// --- toolbar ---
const periodLabel = computed(() => {
  if (view.value === 'list') return t('schedule.upcomingLabel')
  if (view.value === 'week') {
    const s = weekStart.value
    const e = s.add({ days: 6 })
    const sFmt = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' })
    const eFmt = new Intl.DateTimeFormat(locale.value, {
      month: s.month === e.month ? undefined : 'short', day: 'numeric',
    })
    return `${sFmt.format(new Date(s.year, s.month - 1, s.day))} – ${eFmt.format(new Date(e.year, e.month - 1, e.day))}`
  }
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' })
    .format(new Date(anchor.value.year, anchor.value.month - 1, 1))
})
function goPrev() { anchor.value = anchor.value.add(view.value === 'week' ? { days: -7 } : { months: -1 }) }
function goNext() { anchor.value = anchor.value.add(view.value === 'week' ? { days: 7 } : { months: 1 }) }
function goToday() { anchor.value = today(displayTz.value) }
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header
      class="flex shrink-0 items-baseline gap-3 pb-2 pt-1"
      :class="{ 'lg:pl-8': isSidebarCollapsed }"
    >
      <h1 class="text-lg font-semibold text-neutral-950">{{ t('schedule.title') }}</h1>
      <p class="-translate-y-px text-meta text-neutral-500">{{ t('schedule.calendarSubtitle') }}</p>
    </header>

    <!-- toolbar -->
    <div class="flex shrink-0 items-center gap-3 pb-3">
      <div v-if="view !== 'list'" class="inline-flex h-[28px] overflow-hidden rounded-md border border-neutral-200 bg-white">
        <button type="button" class="flex size-[26px] items-center justify-center text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900" @click="goPrev">
          <UIcon name="i-heroicons-chevron-left-20-solid" class="size-3.5" />
        </button>
        <button type="button" class="flex size-[26px] items-center justify-center border-l border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900" @click="goNext">
          <UIcon name="i-heroicons-chevron-right-20-solid" class="size-3.5" />
        </button>
      </div>
      <button v-if="view !== 'list'" type="button" class="h-[28px] rounded-md border border-neutral-200 px-2.5 text-caption font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-900" @click="goToday">
        {{ t('schedule.todayBtn') }}
      </button>
      <div ref="periodPickerRoot" class="relative min-w-[130px]">
        <button
          type="button"
          class="inline-flex h-[30px] max-w-[220px] items-center gap-1.5 rounded-md px-1.5 text-panel-title font-semibold tracking-tight text-neutral-950 transition-colors hover:bg-neutral-100"
          :class="periodPickerOpen ? 'bg-neutral-100' : ''"
          :disabled="view === 'list'"
          @click="togglePeriodPicker"
        >
          <span class="truncate">{{ periodLabel }}</span>
          <UIcon
            v-if="view !== 'list'"
            name="i-heroicons-chevron-down-20-solid"
            class="size-3.5 shrink-0 text-neutral-400 transition-transform"
            :class="periodPickerOpen ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="periodPickerOpen && view !== 'list'"
          class="absolute left-0 top-full z-40 mt-1 w-[272px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div class="mb-1 flex items-center justify-between gap-2 px-1">
            <button type="button" class="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900" @click="movePicker(-1)">
              <UIcon name="i-heroicons-chevron-left-20-solid" class="size-4" />
            </button>
            <div class="min-w-0 text-caption font-semibold text-neutral-900">
              {{ view === 'week' ? pickerMonthLabel : pickerYearLabel }}
            </div>
            <button type="button" class="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900" @click="movePicker(1)">
              <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4" />
            </button>
          </div>

          <div v-if="view === 'month'" class="grid grid-cols-3 gap-1">
            <button
              v-for="m in pickerYearMonths"
              :key="m.key"
              type="button"
              class="h-9 rounded-md text-body-md font-medium transition-colors"
              :class="isSelectedMonth(m.month) ? 'bg-neutral-950 text-white' : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950'"
              @click="pickMonth(m.month)"
            >
              {{ m.label }}
            </button>
          </div>

          <div v-else>
            <div class="grid grid-cols-7 px-1 pb-1 text-center text-caption font-medium text-neutral-400">
              <div v-for="d in weekDays" :key="d.key">{{ d.dow.slice(0, 1) }}</div>
            </div>
            <button
              v-for="week in weekPickerWeeks"
              :key="week[0]?.key"
              type="button"
              class="grid w-full grid-cols-7 rounded-md p-0.5 text-center transition-colors hover:bg-neutral-100"
              :class="isSelectedWeek(week) ? 'bg-neutral-950 hover:bg-neutral-950' : ''"
              @click="pickWeek(week)"
            >
              <span
                v-for="day in week"
                :key="day.key"
                class="flex size-8 items-center justify-center rounded text-caption font-medium tabular-nums"
                :class="[
                  isSelectedWeek(week) ? 'text-white' : day.inMonth ? 'text-neutral-800' : 'text-neutral-300',
                  day.isToday && !isSelectedWeek(week) ? 'bg-neutral-100 text-neutral-950' : '',
                ]"
              >
                {{ day.day }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1" />

      <div class="inline-flex h-[28px] items-center gap-0.5 rounded-md bg-neutral-100 p-0.5">
        <button
          v-for="v in (['month','week','list'] as ViewMode[])"
          :key="v"
          type="button"
          class="h-[24px] rounded px-2.5 text-caption font-medium transition-all"
          :class="view === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
          @click="view = v"
        >
          {{ t(`schedule.view.${v}`) }}
        </button>
      </div>
      <ScheduleTimezonePicker v-model="displayTz" />
      <div class="relative">
        <button
          type="button"
          class="inline-flex h-[28px] items-center gap-1.5 rounded-md bg-neutral-950 px-3 text-caption font-medium text-white transition-colors hover:bg-neutral-800"
          @click="openAdd()"
        >
          <UIcon name="i-heroicons-plus" class="size-3.5" />
          {{ t('schedule.scheduleWorkflow') }}
        </button>
        <ScheduleWorkflowPopover
          :open="popoverOpen"
          :automation-id="popoverAutomationId"
          :prefill-date="popoverPrefill"
          @close="popoverOpen = false"
          @saved="onSaved"
        />
      </div>
    </div>

    <!-- calendar + rail -->
    <div class="-mx-4 -mb-4 flex min-h-0 min-w-0 flex-1 overflow-hidden px-4 pb-4">
      <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScheduleMonthView v-if="view === 'month'" :weeks="monthWeeks" :display-tz="displayTz" :next-ms="nextMs" @add-on="openAdd" @edit="openEdit" />
        <ScheduleWeekView v-else-if="view === 'week'" :days="weekDays" :display-tz="displayTz" :show-now="weekShowsNow" :now-minutes="nowMinutes" :next-ms="nextMs" @edit="openEdit" @add-on="openAdd" />
        <ScheduleListView v-else :groups="listGroups" :display-tz="displayTz" :next-ms="nextMs" @edit="openEdit" />
        </div>
        <ScheduleUpcomingRail v-if="view !== 'list'" :legend="legend" :groups="railGroups" :display-tz="displayTz" :next-ms="nextMs" @toggle="toggleHidden" @edit="openEdit" />
      </div>
    </div>

  </div>
</template>
