<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()

const supabase = useSupabaseClient()
const { currentWorkspace, currentWorkspaceId, members, fetchMembers } = useWorkspaces()
const { sessions, fetchSessions } = useChatSessions()
const { wallet, transactions, fetchWallet, fetchTransactions, formatCents } = useWallet()

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

interface PlanLimits {
  seats: number | null
  sessionsWeekly: number | null
  storageBytes: number | null
  fileSizeBytes: number | null
  browserAgents: number | null
}

const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free:       { seats: 3,   sessionsWeekly: 25,    storageBytes: 100 * 1024 * 1024,         fileSizeBytes: 25 * 1024 * 1024,         browserAgents: 2 },
  pro:        { seats: 10,  sessionsWeekly: 250,   storageBytes: 5 * 1024 * 1024 * 1024,    fileSizeBytes: 250 * 1024 * 1024,        browserAgents: 8 },
  max:        { seats: 50,  sessionsWeekly: 2_500, storageBytes: 50 * 1024 * 1024 * 1024,   fileSizeBytes: 1024 * 1024 * 1024,       browserAgents: 20 },
  enterprise: { seats: null, sessionsWeekly: null, storageBytes: null,                      fileSizeBytes: null,                     browserAgents: null },
}

const planKey = computed<PlanKey>(() => {
  const raw = (currentWorkspace.value?.plan as string | undefined)?.toLowerCase().trim() ?? ''
  if (raw === 'pro' || raw === 'max' || raw === 'enterprise' || raw === 'free') return raw
  return 'free'
})
const planLimits = computed(() => PLAN_LIMITS[planKey.value])
const planLabel = computed(() => planKey.value.charAt(0).toUpperCase() + planKey.value.slice(1))

const upgradeQuery = computed(() => {
  const q: Record<string, string> = { current: planKey.value }
  if (currentWorkspaceId.value) q.workspaceId = currentWorkspaceId.value
  return q
})

// ---- Storage ----
const storageBytes = ref(0)
const storageLoading = ref(false)
const BUCKET = 'workspace-files'

async function computeStorageBytes(workspaceId: string): Promise<number> {
  let total = 0
  const queue: string[] = [`${workspaceId}/main`, `${workspaceId}/shared`]
  const MAX_FOLDERS = 500
  let visited = 0
  while (queue.length > 0 && visited < MAX_FOLDERS) {
    const prefix = queue.shift()!
    visited += 1
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
    if (error || !data) continue
    for (const item of data) {
      if (item.name === '.keep') continue
      if (item.id === null) {
        queue.push(`${prefix}/${item.name}`)
      }
      else {
        const size = (item.metadata as { size?: number } | null | undefined)?.size
        if (typeof size === 'number') total += size
      }
    }
  }
  return total
}

async function refreshUsage(workspaceId: string) {
  storageLoading.value = true
  try {
    storageBytes.value = await computeStorageBytes(workspaceId)
  }
  finally {
    storageLoading.value = false
  }
}

watch(currentWorkspaceId, (wsId) => {
  if (!wsId) return
  fetchMembers(wsId)
  fetchSessions()
  fetchWallet()
  fetchTransactions()
  refreshUsage(wsId)
}, { immediate: true })

// ---- Live clock (drives countdowns & projections) ----
const now = ref(new Date())
let nowTicker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  nowTicker = setInterval(() => { now.value = new Date() }, 60_000)
})
onUnmounted(() => {
  if (nowTicker) clearInterval(nowTicker)
})

// ---- ISO-week helpers (Monday is the first day) ----
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d
}

const weekStart = computed(() => startOfWeek(now.value))
const weekEnd = computed(() => {
  const e = new Date(weekStart.value)
  e.setDate(e.getDate() + 7)
  return e
})
const weekStartISO = computed(() => weekStart.value.toISOString())
const weekEndISO = computed(() => weekEnd.value.toISOString())

// ---- Weekly rate limit ----
const sessionsThisWeek = computed(() =>
  sessions.value.filter(s => s.created_at >= weekStartISO.value && s.created_at < weekEndISO.value).length,
)
const weeklyLimit = computed(() => planLimits.value.sessionsWeekly)
const weeklyPercent = computed<number | null>(() => {
  if (weeklyLimit.value == null) return null
  if (weeklyLimit.value <= 0) return 0
  return Math.min(100, Math.round((sessionsThisWeek.value / weeklyLimit.value) * 100))
})
const weeklyRemaining = computed<number | null>(() => {
  if (weeklyLimit.value == null) return null
  return Math.max(0, weeklyLimit.value - sessionsThisWeek.value)
})

const resetCountdown = computed(() => {
  const ms = Math.max(0, weekEnd.value.getTime() - now.value.getTime())
  const totalMins = Math.floor(ms / 60_000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
})
const resetAt = computed(() =>
  weekEnd.value.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }),
)

const daysElapsedInWeek = computed(() => {
  const ms = now.value.getTime() - weekStart.value.getTime()
  return Math.max(1 / 24, ms / 86_400_000) // min ~1h so Monday morning projections don't explode
})
const dailyPace = computed(() => sessionsThisWeek.value / daysElapsedInWeek.value)
const projectedWeeklyTotal = computed(() => Math.round(dailyPace.value * 7))
const projectedPercent = computed<number | null>(() => {
  if (weeklyLimit.value == null) return null
  return Math.min(999, Math.round((projectedWeeklyTotal.value / weeklyLimit.value) * 100))
})
type PaceStatus = 'under' | 'on' | 'over'
const paceStatus = computed<PaceStatus>(() => {
  const p = projectedPercent.value
  if (p == null) return 'under'
  if (p > 110) return 'over'
  if (p >= 90) return 'on'
  return 'under'
})
const paceLabel: Record<PaceStatus, string> = {
  under: 'Under pace',
  on: 'On pace',
  over: 'Over pace',
}

// ---- History chart ----
type Range = '4w' | '12w' | '12m'
const chartRange = useLocalStorage<Range>('usage:chart_range', '12w')
const ranges: { value: Range, label: string }[] = [
  { value: '4w', label: '4W' },
  { value: '12w', label: '12W' },
  { value: '12m', label: '12M' },
]

interface Bucket {
  key: string
  start: Date
  end: Date
  label: string
  sessions: number
}

function weekBuckets(count: number): Bucket[] {
  const out: Bucket[] = []
  const thisWeekStart = startOfWeek(now.value)
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart)
    start.setDate(thisWeekStart.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    out.push({
      key: `W-${start.toISOString().slice(0, 10)}`,
      start,
      end,
      label: start.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      sessions: 0,
    })
  }
  return out
}

function monthBuckets(count: number): Bucket[] {
  const out: Bucket[] = []
  const y = now.value.getFullYear()
  const m = now.value.getMonth()
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(y, m - i, 1)
    const end = new Date(y, m - i + 1, 1)
    out.push({
      key: `M-${start.getFullYear()}-${start.getMonth()}`,
      start,
      end,
      label: start.toLocaleDateString([], { month: 'short' }),
      sessions: 0,
    })
  }
  return out
}

const chartBuckets = computed<Bucket[]>(() => {
  const buckets = chartRange.value === '4w'
    ? weekBuckets(4)
    : chartRange.value === '12w'
      ? weekBuckets(12)
      : monthBuckets(12)
  for (const s of sessions.value) {
    const t = new Date(s.created_at).getTime()
    for (const b of buckets) {
      if (t >= b.start.getTime() && t < b.end.getTime()) {
        b.sessions += 1
        break
      }
    }
  }
  return buckets
})

const chartMax = computed(() => Math.max(1, ...chartBuckets.value.map(b => b.sessions)))
const chartTotal = computed(() => chartBuckets.value.reduce((s, b) => s + b.sessions, 0))
const chartAverage = computed(() =>
  Math.round(chartTotal.value / Math.max(1, chartBuckets.value.length)),
)
const chartPeak = computed<Bucket>(() => {
  const list = chartBuckets.value
  if (!list.length) {
    return { key: '', start: new Date(), end: new Date(), label: '—', sessions: 0 }
  }
  return list.reduce((best, b) => (b.sessions > best.sessions ? b : best), list[0]!)
})
const chartActive = computed(() => chartBuckets.value.filter(b => b.sessions > 0).length)

function barHeight(n: number): number {
  if (n <= 0) return 2
  return Math.max(3, Math.round((n / chartMax.value) * 100))
}

const hoveredIdx = ref<number | null>(null)

// ---- Secondary KPIs ----
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}
function percent(used: number, total: number | null): number | null {
  if (total == null || total <= 0) return null
  return Math.min(100, Math.round((used / total) * 100))
}
function barColor(pct: number | null): string {
  if (pct == null) return 'bg-neutral-300'
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-neutral-900'
}

const startOfMonthISO = computed(() => {
  const d = now.value
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
})
const spendThisMonthCents = computed(() =>
  transactions.value
    .filter(tx => tx.type === 'deduction' && tx.created_at >= startOfMonthISO.value)
    .reduce((sum, tx) => sum + Math.abs(tx.amount_cents), 0),
)

const tokensThisMonth = computed(() =>
  transactions.value
    .filter(tx => tx.type === 'deduction' && tx.created_at >= startOfMonthISO.value)
    .reduce((sum, tx) => sum + (Number((tx.metadata as any)?.tokens_used) || Number((tx.metadata as any)?.tokens) || 0), 0)
)

const walletCurrency = computed(() => (wallet.value?.currency ?? 'usd') as any)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader
        :tabs="headerTabs"
        :separator-before-path="dashboardNavSeparatorBeforePath"
        raw-tab-labels
      />
    </header>

    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto">
          <div class="flex flex-col gap-5 p-4 sm:p-6">
            <!-- Page header -->
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 class="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
                  Usage
                </h1>
                <p class="mt-1 text-xs text-neutral-500">
                  <span v-if="currentWorkspace" class="font-medium text-neutral-700">{{ currentWorkspace.name }}</span>
                  <span v-else>Workspace</span>
                  · {{ planLabel }} plan
                </p>
              </div>
              <NuxtLink
                v-if="planKey !== 'enterprise'"
                :to="{ path: '/pricing', query: upgradeQuery }"
                class="self-start rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Upgrade plan
              </NuxtLink>
            </div>

            <!-- Weekly rate limit (hero) -->
            <section class="rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Weekly rate limit
                  </span>
                  <div class="mt-1 flex flex-wrap items-baseline gap-3">
                    <span class="font-mono text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl">
                      {{ sessionsThisWeek.toLocaleString() }}
                    </span>
                    <span class="font-mono text-lg text-neutral-400">
                      / {{ weeklyLimit == null ? '∞' : weeklyLimit.toLocaleString() }}
                    </span>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      sessions
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-neutral-500">
                    Week of
                    <span class="font-medium text-neutral-700">
                      {{ weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' }) }}
                    </span>
                    · resets <span class="font-medium text-neutral-700">{{ resetAt }}</span>
                  </p>
                </div>

                <div v-if="weeklyLimit != null" class="flex flex-col items-end gap-1">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1"
                    :class="paceStatus === 'over'
                      ? 'bg-red-50 text-red-700 ring-red-100'
                      : paceStatus === 'on'
                        ? 'bg-amber-50 text-amber-700 ring-amber-100'
                        : 'bg-green-50 text-green-700 ring-green-100'"
                  >
                    <span
                      class="size-1.5 rounded-full"
                      :class="paceStatus === 'over'
                        ? 'bg-red-500'
                        : paceStatus === 'on'
                          ? 'bg-amber-500'
                          : 'bg-green-500'"
                    />
                    {{ paceLabel[paceStatus] }}
                  </span>
                  <span class="text-[10px] text-neutral-400">
                    Projected
                    <span class="font-mono font-semibold text-neutral-600">{{ projectedWeeklyTotal.toLocaleString() }}</span>
                    / wk
                  </span>
                </div>
                <div
                  v-else
                  class="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600"
                >
                  Unlimited
                </div>
              </div>

              <div class="mt-5">
                <div class="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  <span>Consumption</span>
                  <span>
                    <template v-if="weeklyPercent == null">Unlimited</template>
                    <template v-else>{{ weeklyPercent }}%</template>
                  </span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    class="h-full rounded-full transition-[width] duration-500 ease-out"
                    :class="barColor(weeklyPercent)"
                    :style="{ width: (weeklyPercent ?? 0) + '%' }"
                  />
                </div>
              </div>

              <div class="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-5 sm:grid-cols-4">
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Remaining
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    <template v-if="weeklyRemaining == null">∞</template>
                    <template v-else>{{ weeklyRemaining.toLocaleString() }}</template>
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Resets in
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ resetCountdown }}
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Daily pace
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ dailyPace.toFixed(1) }}<span class="text-xs text-neutral-400">/d</span>
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Projected
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ projectedWeeklyTotal.toLocaleString() }}
                    <span v-if="projectedPercent != null" class="text-xs font-normal text-neutral-400">
                      · {{ projectedPercent }}%
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <!-- History chart -->
            <section class="rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-neutral-950">Sessions over time</h3>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ chartRange === '12m' ? 'Monthly' : 'Weekly' }} totals for
                    {{ currentWorkspace?.name ?? 'this workspace' }}
                  </p>
                </div>
                <div class="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                  <button
                    v-for="r in ranges"
                    :key="r.value"
                    class="rounded-md px-3 py-1 text-xs font-semibold transition-colors"
                    :class="chartRange === r.value
                      ? 'bg-white text-neutral-950 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-800'"
                    @click="chartRange = r.value"
                  >
                    {{ r.label }}
                  </button>
                </div>
              </div>

              <div class="mt-5 grid grid-cols-2 gap-4 border-b border-neutral-100 pb-5 sm:grid-cols-4">
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Total sessions
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ chartTotal.toLocaleString() }}
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Average per {{ chartRange === '12m' ? 'month' : 'week' }}
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ chartAverage.toLocaleString() }}
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Peak
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ chartPeak.sessions.toLocaleString() }}
                    <span class="text-xs font-normal text-neutral-400">· {{ chartPeak.label }}</span>
                  </div>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Active {{ chartRange === '12m' ? 'months' : 'weeks' }}
                  </span>
                  <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">
                    {{ chartActive }}
                    <span class="text-xs text-neutral-400">/ {{ chartBuckets.length }}</span>
                  </div>
                </div>
              </div>

              <!-- Bar chart -->
              <div class="relative mt-5">
                <div
                  class="pointer-events-none absolute inset-x-0 top-0 flex h-40 flex-col justify-between text-[10px] font-mono text-neutral-300"
                >
                  <span>{{ chartMax.toLocaleString() }}</span>
                  <span>{{ Math.round(chartMax / 2).toLocaleString() }}</span>
                  <span>0</span>
                </div>
                <div class="flex h-40 items-end gap-[2px] border-b border-l border-neutral-100 pl-1 pr-12">
                  <button
                    v-for="(b, idx) in chartBuckets"
                    :key="b.key"
                    class="group relative flex h-full min-w-[3px] flex-1 items-end outline-none"
                    @mouseenter="hoveredIdx = idx"
                    @mouseleave="hoveredIdx = null"
                  >
                    <div
                      class="w-full rounded-t-sm transition-colors"
                      :class="b.sessions > 0
                        ? hoveredIdx === idx ? 'bg-neutral-700' : 'bg-neutral-900'
                        : hoveredIdx === idx ? 'bg-neutral-200' : 'bg-neutral-100'"
                      :style="{ height: barHeight(b.sessions) + '%' }"
                    />
                    <div
                      v-if="hoveredIdx === idx"
                      class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left shadow-lg"
                    >
                      <p class="text-[11px] font-semibold text-neutral-950">
                        <template v-if="chartRange === '12m'">
                          {{ b.start.toLocaleDateString([], { month: 'long', year: 'numeric' }) }}
                        </template>
                        <template v-else>
                          Week of {{ b.start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) }}
                        </template>
                      </p>
                      <div class="mt-1 flex items-center justify-between text-[11px]">
                        <span class="text-neutral-500">Sessions</span>
                        <span class="font-mono font-semibold text-neutral-950">{{ b.sessions.toLocaleString() }}</span>
                      </div>
                    </div>
                  </button>
                </div>
                <div class="mt-2 flex justify-between pr-12 pl-1 text-[10px] text-neutral-400">
                  <span>{{ chartBuckets[0]?.label }}</span>
                  <span v-if="chartBuckets.length > 2">
                    {{ chartBuckets[Math.floor(chartBuckets.length / 2)]?.label }}
                  </span>
                  <span>{{ chartBuckets[chartBuckets.length - 1]?.label }}</span>
                </div>
              </div>
            </section>

            <!-- Workspace allocations (secondary) -->
            <section class="rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">Workspace allocations</h3>
                <p class="mt-0.5 text-xs text-neutral-500">
                  Seats, storage and spend on the {{ planLabel }} plan
                </p>
              </div>

              <div class="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
                <!-- Seats -->
                <div class="min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Seats
                    </span>
                    <svg class="size-3.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <p class="mt-2 font-mono text-xl font-bold tabular-nums text-neutral-950">
                    {{ members.length }}
                    <span class="text-sm font-normal text-neutral-400">
                      / {{ planLimits.seats == null ? '∞' : planLimits.seats }}
                    </span>
                  </p>
                  <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      class="h-full rounded-full transition-[width] duration-300 ease-out"
                      :class="barColor(percent(members.length, planLimits.seats))"
                      :style="{ width: (percent(members.length, planLimits.seats) ?? 0) + '%' }"
                    />
                  </div>
                  <p class="mt-1.5 text-[11px] text-neutral-400">
                    <template v-if="percent(members.length, planLimits.seats) == null">Unlimited</template>
                    <template v-else>{{ percent(members.length, planLimits.seats) }}% used</template>
                  </p>
                </div>

                <!-- Storage -->
                <div class="min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Storage
                    </span>
                    <svg class="size-3.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                  <p class="mt-2 font-mono text-xl font-bold tabular-nums text-neutral-950">
                    <span v-if="storageLoading" class="text-neutral-400">…</span>
                    <template v-else>{{ formatBytes(storageBytes) }}</template>
                    <span class="text-sm font-normal text-neutral-400">
                      / {{ planLimits.storageBytes == null ? '∞' : formatBytes(planLimits.storageBytes) }}
                    </span>
                  </p>
                  <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      class="h-full rounded-full transition-[width] duration-300 ease-out"
                      :class="barColor(percent(storageBytes, planLimits.storageBytes))"
                      :style="{ width: (percent(storageBytes, planLimits.storageBytes) ?? 0) + '%' }"
                    />
                  </div>
                  <p class="mt-1.5 text-[11px] text-neutral-400">
                    <template v-if="percent(storageBytes, planLimits.storageBytes) == null">Unlimited</template>
                    <template v-else>{{ percent(storageBytes, planLimits.storageBytes) }}% used</template>
                  </p>
                </div>

                <!-- Max file size -->
                <div class="min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Max file size
                    </span>
                    <svg class="size-3.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <polyline points="9 15 12 12 15 15" />
                    </svg>
                  </div>
                  <p class="mt-2 font-mono text-xl font-bold tabular-nums text-neutral-950">
                    <template v-if="planLimits.fileSizeBytes == null">∞</template>
                    <template v-else>{{ formatBytes(planLimits.fileSizeBytes) }}</template>
                  </p>
                  <div class="mt-2.5 h-1.5 rounded-full bg-neutral-100" />
                  <p class="mt-1.5 text-[11px] text-neutral-400">
                    Per upload on {{ planLabel }} plan
                  </p>
                </div>

                <!-- Spend this month -->
                <div class="min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Spend this month
                    </span>
                    <svg class="size-3.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <p class="mt-2 font-mono text-xl font-bold tabular-nums text-neutral-950">
                    {{ formatCents(spendThisMonthCents, walletCurrency) }}
                  </p>
                  <div class="mt-2.5 h-1.5 rounded-full bg-neutral-100" />
                  <p class="mt-1.5 text-[11px] text-neutral-400">
                    Balance:
                    <span class="font-medium text-neutral-600">
                      {{ wallet ? formatCents(wallet.balance_cents, wallet.currency as any) : '—' }}
                    </span>
                  </p>
                </div>

                <!-- Tokens this month -->
                <div class="min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Tokens this month
                    </span>
                    <svg class="size-3.5 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <p class="mt-2 font-mono text-xl font-bold tabular-nums text-neutral-950">
                    {{ tokensThisMonth > 0 ? tokensThisMonth.toLocaleString() : '—' }}
                  </p>
                  <div class="mt-2.5 h-1.5 rounded-full bg-neutral-100" />
                  <p class="mt-1.5 text-[11px] text-neutral-400">
                    Total text processed
                  </p>
                </div>
              </div>
            </section>

            <div class="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 text-[11px] leading-relaxed text-neutral-500">
              Usage and limits apply to this workspace only. Each workspace in Polymux is billed separately — seats,
              storage and session quotas are scoped to
              <span class="font-medium text-neutral-700">{{ currentWorkspace?.name ?? 'this workspace' }}</span>.
            </div>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
