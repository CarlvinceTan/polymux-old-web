<script setup lang="ts">
const { t } = useI18n()
const toast = useAppToast()

const chatTitle = inject<Ref<string>>('chat-title')!

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

const frequency = ref<Frequency>('daily')
const minute = ref(0)
const hour = ref(9)
const weekdays = ref<Set<number>>(new Set([1, 2, 3, 4, 5]))
const dayOfMonth = ref(1)
const customExpr = ref('0 9 * * *')
const active = ref(true)

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezone = ref<string>(localTz)

const tzOptions = computed(() => [
  { value: localTz, label: t('schedule.tzLocal', { tz: localTz }) },
  { value: 'UTC', label: 'UTC' },
])

const frequencyOptions: { value: Frequency; icon: string; labelKey: string; hintKey: string }[] = [
  { value: 'hourly',  icon: 'i-heroicons-clock',          labelKey: 'schedule.freq.hourly',  hintKey: 'schedule.freq.hourlyHint' },
  { value: 'daily',   icon: 'i-heroicons-sun',            labelKey: 'schedule.freq.daily',   hintKey: 'schedule.freq.dailyHint' },
  { value: 'weekly',  icon: 'i-heroicons-calendar-days', labelKey: 'schedule.freq.weekly',  hintKey: 'schedule.freq.weeklyHint' },
  { value: 'monthly', icon: 'i-heroicons-calendar',      labelKey: 'schedule.freq.monthly', hintKey: 'schedule.freq.monthlyHint' },
  { value: 'custom',  icon: 'i-heroicons-command-line',   labelKey: 'schedule.freq.custom',  hintKey: 'schedule.freq.customHint' },
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
    case 'hourly':
      return `${minute.value} * * * *`
    case 'daily':
      return `${minute.value} ${hour.value} * * *`
    case 'weekly': {
      const days = weekdays.value.size
        ? [...weekdays.value].sort((a, b) => a - b).join(',')
        : '*'
      return `${minute.value} ${hour.value} * * ${days}`
    }
    case 'monthly':
      return `${minute.value} ${hour.value} ${dayOfMonth.value} * *`
    case 'custom':
      return customExpr.value.trim()
  }
})

const cronValid = computed(() => parseCron(cronExpression.value) != null)

interface CronSets {
  minutes: Set<number>
  hours: Set<number>
  doms: Set<number>
  months: Set<number>
  dows: Set<number>
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  const parts = field.split(',')
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) return null
    let range = p
    let step = 1
    if (p.includes('/')) {
      const [r, s] = p.split('/')
      if (!r || !s) return null
      range = r
      step = parseInt(s, 10)
      if (!Number.isFinite(step) || step <= 0) return null
    }
    let a = min, b = max
    if (range === '*') {
      // full
    } else if (range.includes('-')) {
      const [x, y] = range.split('-').map(n => parseInt(n, 10))
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      a = x!; b = y!
    } else {
      const v = parseInt(range, 10)
      if (!Number.isFinite(v)) return null
      a = v; b = v
    }
    if (a < min || b > max || a > b) return null
    for (let i = a; i <= b; i += step) out.add(i)
  }
  return out.size ? out : null
}

function parseCron(expr: string): CronSets | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = parseField(parts[0]!, 0, 59)
  const hours = parseField(parts[1]!, 0, 23)
  const doms = parseField(parts[2]!, 1, 31)
  const months = parseField(parts[3]!, 1, 12)
  const dows = parseField(parts[4]!, 0, 6)
  if (!minutes || !hours || !doms || !months || !dows) return null
  return { minutes, hours, doms, months, dows }
}

function computeNextRuns(expr: string, tz: string, count = 5): Date[] {
  const sets = parseCron(expr)
  if (!sets) return []
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  })
  const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  const results: Date[] = []
  const now = new Date()
  const start = new Date(Math.ceil(now.getTime() / 60000) * 60000)
  const maxMs = start.getTime() + 60 * 24 * 60 * 60 * 1000
  for (let t = start.getTime(); t < maxMs; t += 60000) {
    const d = new Date(t)
    const fields: Record<string, string> = {}
    for (const p of fmt.formatToParts(d)) fields[p.type] = p.value
    const mm = parseInt(fields.minute!, 10)
    const hh = parseInt(fields.hour!, 10)
    const day = parseInt(fields.day!, 10)
    const mon = parseInt(fields.month!, 10)
    const dow = WEEKDAY_MAP[fields.weekday!] ?? -1
    if (
      sets.minutes.has(mm) &&
      sets.hours.has(hh) &&
      sets.doms.has(day) &&
      sets.months.has(mon) &&
      sets.dows.has(dow)
    ) {
      results.push(d)
      if (results.length >= count) break
    }
  }
  return results
}

const nextRuns = computed(() => computeNextRuns(cronExpression.value, timezone.value, 5))

const humanSummary = computed(() => {
  if (!cronValid.value) return t('schedule.invalidCron')
  const tzLabel = timezone.value === 'UTC' ? 'UTC' : timezone.value
  const time = `${pad2(hour.value)}:${pad2(minute.value)}`
  switch (frequency.value) {
    case 'hourly':
      return t('schedule.human.hourly', { minute: minute.value })
    case 'daily':
      return t('schedule.human.daily', { time, tz: tzLabel })
    case 'weekly': {
      if (weekdays.value.size === 0) return t('schedule.weeklyNoDays')
      const names = [...weekdays.value]
        .sort((a, b) => a - b)
        .map(d => t(`schedule.weekdayLong.${WEEKDAY_KEYS[d]}`))
        .join(', ')
      return t('schedule.human.weekly', { days: names, time, tz: tzLabel })
    }
    case 'monthly':
      return t('schedule.human.monthly', { day: dayOfMonth.value, time, tz: tzLabel })
    case 'custom':
      return t('schedule.human.custom')
  }
})

function formatRunDate(d: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone.value,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

function formatRelative(d: Date) {
  const diff = d.getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return t('schedule.relative.inMinutes', { n: Math.max(mins, 1) })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('schedule.relative.inHours', { n: hrs })
  const days = Math.round(hrs / 24)
  return t('schedule.relative.inDays', { n: days })
}

function copyCron() {
  navigator.clipboard?.writeText(cronExpression.value)
  toast.show(t('schedule.copied'), 'info', 2000)
}

function onSave() {
  if (!cronValid.value) {
    toast.show(t('schedule.invalidCron'), 'error', 3000)
    return
  }
  toast.show(t('schedule.saved'), 'info', 3000)
}
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <template #title>
      <div class="flex min-w-0 items-center gap-2.5">
        <UIcon name="i-heroicons-clock" class="size-5 shrink-0 text-neutral-900" />
        <div class="min-w-0">
          <div class="truncate text-panel-title font-semibold tracking-tight text-neutral-950">
            {{ t('schedule.title') }}
          </div>
          <div class="truncate text-caption text-neutral-500">
            {{ t('schedule.subtitle', { workflow: chatTitle }) }}
          </div>
        </div>
      </div>
    </template>
    <template #actions>
      <div class="flex items-center gap-3">
        <div
          class="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-2.5 py-1"
          :title="active ? t('schedule.activeOn') : t('schedule.activeOff')"
        >
          <span
            class="size-2 rounded-full transition-colors"
            :class="active ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]' : 'bg-neutral-400'"
          />
          <span class="text-caption font-medium text-neutral-700">
            {{ active ? t('schedule.activeOn') : t('schedule.activeOff') }}
          </span>
          <SettingsToggle v-model="active" />
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="!cronValid"
          @click="onSave"
        >
          <UIcon name="i-heroicons-bolt" class="size-4" />
          {{ t('schedule.save') }}
        </button>
      </div>
    </template>

    <div class="flex min-h-0 min-w-0 flex-col gap-5 p-4 sm:p-5">
      <!-- Frequency picker -->
      <section class="min-w-0">
        <h3 class="mb-2.5 text-body-md font-semibold tracking-tight text-neutral-950">
          {{ t('schedule.howOften') }}
        </h3>
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <button
            v-for="opt in frequencyOptions"
            :key="opt.value"
            type="button"
            class="group relative flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-all"
            :class="frequency === opt.value
              ? 'border-neutral-950 bg-neutral-950 text-white shadow-soft'
              : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50'"
            @click="frequency = opt.value"
          >
            <div
              class="flex size-8 items-center justify-center rounded-lg transition-colors"
              :class="frequency === opt.value ? 'bg-white/15 text-white' : 'bg-neutral-100 text-neutral-700 group-hover:bg-neutral-200'"
            >
              <UIcon :name="opt.icon" class="size-4" />
            </div>
            <div class="text-body-md font-semibold tracking-tight">{{ t(opt.labelKey) }}</div>
            <div
              class="text-caption"
              :class="frequency === opt.value ? 'text-white/70' : 'text-neutral-500'"
            >
              {{ t(opt.hintKey) }}
            </div>
          </button>
        </div>
      </section>

      <div class="grid min-w-0 gap-5 lg:grid-cols-5">
        <!-- Left: detail controls -->
        <section class="min-w-0 lg:col-span-3">
          <h3 class="mb-2.5 text-body-md font-semibold tracking-tight text-neutral-950">
            {{ t('schedule.when') }}
          </h3>
          <div class="rounded-xl ghost-panel bg-white p-4 sm:p-5">
            <!-- Hourly -->
            <div v-if="frequency === 'hourly'" class="space-y-3">
              <label class="block text-caption font-medium uppercase tracking-wider text-neutral-500">
                {{ t('schedule.atMinute') }}
              </label>
              <div class="flex items-center gap-3">
                <input
                  v-model.number="minute"
                  type="range" min="0" max="59" step="1"
                  class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-950"
                >
                <div class="flex w-16 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2 py-1.5 font-mono text-body-md font-semibold text-neutral-900 tabular-nums">
                  :{{ pad2(minute) }}
                </div>
              </div>
            </div>

            <!-- Daily / Weekly / Monthly time picker -->
            <div v-else-if="frequency !== 'custom'" class="space-y-4">
              <div>
                <label class="mb-1.5 block text-caption font-medium uppercase tracking-wider text-neutral-500">
                  {{ t('schedule.atTime') }}
                </label>
                <div class="inline-flex items-center gap-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <select
                    v-model.number="hour"
                    class="appearance-none bg-transparent px-4 py-3 text-center font-mono text-xl font-semibold text-neutral-950 tabular-nums focus:outline-none"
                  >
                    <option v-for="h in 24" :key="h" :value="h - 1">{{ pad2(h - 1) }}</option>
                  </select>
                  <span class="font-mono text-xl font-semibold text-neutral-400">:</span>
                  <select
                    v-model.number="minute"
                    class="appearance-none bg-transparent px-4 py-3 text-center font-mono text-xl font-semibold text-neutral-950 tabular-nums focus:outline-none"
                  >
                    <option v-for="m in 60" :key="m" :value="m - 1">{{ pad2(m - 1) }}</option>
                  </select>
                </div>
              </div>

              <!-- Weekly: day chips -->
              <div v-if="frequency === 'weekly'">
                <label class="mb-1.5 block text-caption font-medium uppercase tracking-wider text-neutral-500">
                  {{ t('schedule.onDays') }}
                </label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="(key, i) in WEEKDAY_KEYS"
                    :key="key"
                    type="button"
                    class="flex size-10 items-center justify-center rounded-full border text-body-md font-semibold transition-all"
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
                <label class="mb-1.5 block text-caption font-medium uppercase tracking-wider text-neutral-500">
                  {{ t('schedule.onDayOfMonth') }}
                </label>
                <div class="grid grid-cols-8 gap-1 sm:grid-cols-10">
                  <button
                    v-for="d in 31"
                    :key="d"
                    type="button"
                    class="flex aspect-square items-center justify-center rounded-lg border text-caption font-medium transition-all"
                    :class="dayOfMonth === d
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'"
                    @click="dayOfMonth = d"
                  >
                    {{ d }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Custom -->
            <div v-else class="space-y-2">
              <label class="block text-caption font-medium uppercase tracking-wider text-neutral-500">
                {{ t('schedule.cronExpr') }}
              </label>
              <input
                v-model="customExpr"
                type="text"
                spellcheck="false"
                class="w-full rounded-lg border bg-neutral-50 px-3 py-2.5 font-mono text-body-md tabular-nums outline-none transition-colors focus:bg-white"
                :class="cronValid ? 'border-neutral-200 text-neutral-950 focus:border-neutral-950' : 'border-error/40 text-error focus:border-error'"
                placeholder="0 9 * * 1-5"
              >
              <div class="flex items-start gap-1.5 text-caption text-neutral-500">
                <UIcon name="i-heroicons-information-circle" class="mt-px size-3.5 shrink-0" />
                <span>{{ t('schedule.cronHelp') }}</span>
              </div>
            </div>

            <!-- Timezone -->
            <div class="mt-5 border-t border-neutral-200/80 pt-4">
              <label class="mb-1.5 block text-caption font-medium uppercase tracking-wider text-neutral-500">
                {{ t('schedule.timezone') }}
              </label>
              <div class="inline-flex rounded-lg bg-neutral-100 p-0.5">
                <button
                  v-for="o in tzOptions"
                  :key="o.value"
                  type="button"
                  class="rounded-md px-3 py-1.5 text-body-md font-medium transition-all"
                  :class="timezone === o.value
                    ? 'bg-white text-neutral-950 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'"
                  @click="timezone = o.value"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Right: preview + next runs -->
        <section class="min-w-0 space-y-3 lg:col-span-2">
          <h3 class="mb-2.5 text-body-md font-semibold tracking-tight text-neutral-950">
            {{ t('schedule.preview') }}
          </h3>

          <!-- Summary card -->
          <div class="rounded-xl ghost-panel bg-gradient-to-br from-neutral-950 to-neutral-800 p-4 text-white">
            <div class="flex items-start gap-2.5">
              <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <UIcon name="i-heroicons-sparkles" class="size-4" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-caption uppercase tracking-wider text-white/60">
                  {{ t('schedule.runs') }}
                </div>
                <div class="mt-0.5 text-body-lg font-medium leading-snug">
                  {{ humanSummary }}
                </div>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-2">
              <code class="flex-1 truncate font-mono text-body-md text-white/90 tabular-nums">
                {{ cronExpression || '—' }}
              </code>
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                :title="t('schedule.copyCron')"
                @click="copyCron"
              >
                <UIcon name="i-heroicons-clipboard-document" class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Next runs -->
          <div class="rounded-xl ghost-panel bg-white">
            <div class="flex items-center justify-between px-4 py-2.5">
              <div class="text-body-md font-semibold tracking-tight text-neutral-950">
                {{ t('schedule.nextRuns') }}
              </div>
              <div class="text-caption text-neutral-500">
                {{ t('schedule.nextRunsCount', { n: nextRuns.length }) }}
              </div>
            </div>
            <div class="h-px w-full bg-neutral-200/80" />
            <div v-if="nextRuns.length === 0" class="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
              <UIcon name="i-heroicons-no-symbol" class="size-5 text-neutral-400" />
              <div class="text-caption text-neutral-500">{{ t('schedule.noRuns') }}</div>
            </div>
            <ol v-else class="divide-y divide-neutral-200/80">
              <li
                v-for="(d, i) in nextRuns"
                :key="i"
                class="flex items-center gap-3 px-4 py-2.5"
              >
                <div
                  class="flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold tabular-nums"
                  :class="i === 0 ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500'"
                >
                  {{ i + 1 }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-body-md font-medium text-neutral-900 tabular-nums">
                    {{ formatRunDate(d) }}
                  </div>
                  <div class="text-caption text-neutral-500">
                    {{ formatRelative(d) }}
                  </div>
                </div>
                <UIcon
                  v-if="i === 0"
                  name="i-heroicons-arrow-right"
                  class="size-4 shrink-0 text-neutral-400"
                />
              </li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  </TabPanel>
</template>
