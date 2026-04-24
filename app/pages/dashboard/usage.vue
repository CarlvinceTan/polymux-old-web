<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()

const supabase = useSupabaseClient()
const { currentWorkspace, currentWorkspaceId, members, fetchMembers } = useWorkspaces()
const { sessions, fetchSessions } = useChatSessions()
const { wallet, transactions, fetchWallet, fetchTransactions, formatCents } = useWallet()
const { isInstalled } = useMarketplace()
const { probe: probeLocal } = useLocalFileStorage()
const { cards: storageUsageCards, refreshDrive } = useStorageUsage()
const { active: activeSchedules, runsPerMonth } = useScheduledWorkflows()

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

// ---- Cloud (Supabase) storage ----
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

// ---- Local (OPFS) storage ----
const localProbe = ref<{ supported: boolean, usage: number, quota: number, full: boolean }>({
  supported: false, usage: 0, quota: 0, full: false,
})
const localLoading = ref(false)

async function refreshLocalProbe() {
  localLoading.value = true
  try {
    const p = await probeLocal()
    localProbe.value = { supported: p.supported, usage: p.usage, quota: p.quota, full: p.full }
  }
  finally {
    localLoading.value = false
  }
}

// ---- Google Drive ----
const driveConnected = computed(() => isInstalled('google-drive'))
const driveUsageCard = computed(() =>
  storageUsageCards.value.find(c => c.provider === 'google-drive') ?? null,
)

watch(currentWorkspaceId, (wsId) => {
  if (!wsId) return
  fetchMembers(wsId)
  fetchSessions()
  fetchWallet()
  fetchTransactions()
  refreshUsage(wsId)
  refreshDrive().catch(() => {})
}, { immediate: true })

onMounted(() => { refreshLocalProbe() })

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

const lastWeekStart = computed(() => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() - 7)
  return d
})
const lastWeekStartISO = computed(() => lastWeekStart.value.toISOString())

// ---- Weekly rate limit ----
const sessionsThisWeek = computed(() =>
  sessions.value.filter(s => s.created_at >= weekStartISO.value && s.created_at < weekEndISO.value).length,
)
const sessionsLastWeek = computed(() =>
  sessions.value.filter(s => s.created_at >= lastWeekStartISO.value && s.created_at < weekStartISO.value).length,
)
const sessionsDelta = computed(() => sessionsThisWeek.value - sessionsLastWeek.value)
const sessionsDeltaPercent = computed<number | null>(() => {
  if (sessionsLastWeek.value === 0) {
    return sessionsThisWeek.value === 0 ? 0 : null
  }
  return Math.round((sessionsDelta.value / sessionsLastWeek.value) * 100)
})
const weeklyLimit = computed(() => planLimits.value.sessionsWeekly)
const weeklyPercent = computed<number | null>(() => {
  if (weeklyLimit.value == null) return null
  if (weeklyLimit.value <= 0) return 0
  return Math.min(100, Math.round((sessionsThisWeek.value / weeklyLimit.value) * 100))
})
const weeklyStatus = computed<'ok' | 'warn' | 'danger'>(() => {
  const p = weeklyPercent.value
  if (p == null) return 'ok'
  if (p >= 90) return 'danger'
  if (p >= 70) return 'warn'
  return 'ok'
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
const chartAveragePercent = computed(() => {
  if (chartMax.value <= 0) return 0
  return (chartAverage.value / chartMax.value) * 100
})
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

// ---- Formatting helpers ----
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

// ---- Billing KPIs ----
const startOfMonthISO = computed(() => {
  const d = now.value
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
})
const spendThisMonthCents = computed(() =>
  transactions.value
    .filter(tx => tx.type === 'deduction' && tx.created_at >= startOfMonthISO.value)
    .reduce((sum, tx) => sum + Math.abs(tx.amount_cents), 0),
)

const walletCurrency = computed(() => (wallet.value?.currency ?? 'usd') as any)

// ---- Cloud storage helpers ----
const cloudUsagePercent = computed(() => {
  const total = planLimits.value.storageBytes
  if (total == null || total <= 0) return null
  return Math.min(100, Math.round((storageBytes.value / total) * 100))
})

// ---- Storage providers (ring charts) ----
type ProviderState = 'tracked' | 'connected-untracked' | 'disconnected' | 'unsupported' | 'unlimited'

interface ProviderCard {
  provider: StorageProvider
  label: string
  sublabel: string
  used: number | null
  total: number | null
  state: ProviderState
  loading: boolean
  ringClass: string
  trackClass: string
}

const providerCards = computed<ProviderCard[]>(() => {
  const cloudTotal = planLimits.value.storageBytes
  const cloudState: ProviderState = cloudTotal == null ? 'unlimited' : 'tracked'

  const local = localProbe.value
  const localState: ProviderState = !local.supported
    ? 'unsupported'
    : local.quota > 0 ? 'tracked' : 'connected-untracked'

  const drive = driveUsageCard.value
  const driveState: ProviderState = driveConnected.value
    ? (drive?.state ?? 'connected-untracked')
    : 'disconnected'
  const driveSublabel = !driveConnected.value
    ? 'Not connected'
    : drive?.state === 'tracked'
      ? 'Google account storage'
      : drive?.state === 'unlimited'
        ? 'Unlimited storage'
        : 'Managed by Google'

  return [
    {
      provider: 'supabase',
      label: 'Cloud',
      sublabel: `${planLabel.value} plan storage`,
      used: storageBytes.value,
      total: cloudTotal,
      state: cloudState,
      loading: storageLoading.value,
      ringClass: 'text-neutral-900',
      trackClass: 'text-neutral-100',
    },
    {
      provider: 'google-drive',
      label: 'Google Drive',
      sublabel: driveSublabel,
      used: drive?.used ?? null,
      total: drive?.total ?? null,
      state: driveState,
      loading: drive?.loading ?? false,
      ringClass: 'text-google-drive',
      trackClass: 'text-google-drive-tint',
    },
    {
      provider: 'local',
      label: 'This device',
      sublabel: local.supported ? 'Browser quota' : 'Not supported',
      used: local.supported ? local.usage : null,
      total: local.supported ? local.quota : null,
      state: localState,
      loading: localLoading.value,
      ringClass: 'text-neutral-700',
      trackClass: 'text-neutral-100',
    },
  ]
})

const RING_R = 42
const RING_CIRC = 2 * Math.PI * RING_R

function providerPercent(c: ProviderCard): number {
  if (c.state !== 'tracked' || c.used == null || c.total == null || c.total <= 0) return 0
  return Math.min(100, (c.used / c.total) * 100)
}
function providerDash(c: ProviderCard): string {
  const pct = providerPercent(c)
  const filled = (pct / 100) * RING_CIRC
  return `${filled} ${RING_CIRC - filled}`
}
function providerUsageText(c: ProviderCard): string {
  if (c.state === 'tracked' && c.used != null && c.total != null) {
    return `${formatBytes(c.used)} / ${formatBytes(c.total)}`
  }
  if (c.state === 'unlimited') return 'Unlimited'
  if (c.state === 'connected-untracked') return 'Connected'
  if (c.state === 'disconnected') return 'Not connected'
  if (c.state === 'unsupported') return 'Unavailable'
  return '—'
}
function providerPercentLabel(c: ProviderCard): string {
  if (c.loading) return '…'
  if (c.state === 'tracked') return `${Math.round(providerPercent(c))}%`
  if (c.state === 'unlimited') return '∞'
  if (c.state === 'connected-untracked') return '✓'
  return '—'
}

// ---- Plan tier badge styling (subtle monochrome differentiation) ----
const planBadgeClass = computed(() => {
  switch (planKey.value) {
    case 'enterprise':
      return 'bg-gradient-to-br from-neutral-950 to-neutral-700 text-white'
    case 'max':
      return 'bg-neutral-950 text-white'
    case 'pro':
      return 'bg-neutral-200 text-neutral-900'
    default:
      return 'bg-white text-neutral-700 border border-neutral-200'
  }
})

// ---- 7-day daily sparkline (Sessions/wk KPI) ----
const SPARK_DAYS = 7
const dailyBuckets = computed(() => {
  const buckets: { date: Date; sessions: number }[] = []
  const today = new Date(now.value)
  today.setHours(0, 0, 0, 0)
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    buckets.push({ date: d, sessions: 0 })
  }
  for (const s of sessions.value) {
    const t = new Date(s.created_at)
    t.setHours(0, 0, 0, 0)
    const idx = buckets.findIndex(b => b.date.getTime() === t.getTime())
    if (idx >= 0) buckets[idx]!.sessions += 1
  }
  return buckets
})
const dailyMax = computed(() => Math.max(1, ...dailyBuckets.value.map(b => b.sessions)))

// ---- Weekly forecast: project end-of-week sessions at current pace ----
const weekHoursElapsed = computed(() => {
  const ms = now.value.getTime() - weekStart.value.getTime()
  return Math.max(1, ms / (1000 * 60 * 60))
})
const WEEK_HOURS_TOTAL = 7 * 24
const projectedSessions = computed(() => {
  if (weekHoursElapsed.value <= 0) return sessionsThisWeek.value
  return Math.round((sessionsThisWeek.value / weekHoursElapsed.value) * WEEK_HOURS_TOTAL)
})
const projectedPercent = computed<number | null>(() => {
  if (weeklyLimit.value == null || weeklyLimit.value <= 0) return null
  return Math.round((projectedSessions.value / weeklyLimit.value) * 100)
})
const projectedStatus = computed<'safe' | 'tight' | 'over'>(() => {
  const p = projectedPercent.value
  if (p == null) return 'safe'
  if (p > 100) return 'over'
  if (p >= 85) return 'tight'
  return 'safe'
})

// ---- Monthly spend helpers ----
const monthDaysElapsed = computed(() => {
  const startMs = new Date(startOfMonthISO.value).getTime()
  const ms = now.value.getTime() - startMs
  return Math.max(1, ms / (1000 * 60 * 60 * 24))
})
const dailyAvgSpendCents = computed(() =>
  Math.round(spendThisMonthCents.value / monthDaysElapsed.value),
)
const monthTopUpsCents = computed(() =>
  transactions.value
    .filter(tx => tx.type === 'top_up' && tx.created_at >= startOfMonthISO.value)
    .reduce((sum, tx) => sum + Math.abs(tx.amount_cents), 0),
)
const monthRefundsCents = computed(() =>
  transactions.value
    .filter(tx => tx.type === 'refund' && tx.created_at >= startOfMonthISO.value)
    .reduce((sum, tx) => sum + Math.abs(tx.amount_cents), 0),
)
const monthSpendPercentOfTopUp = computed(() => {
  if (monthTopUpsCents.value <= 0) return 0
  return Math.min(100, Math.round((spendThisMonthCents.value / monthTopUpsCents.value) * 100))
})

// ---- Recurring cost: active scheduled workflows ----
// No per-workflow cost model exists yet, so we estimate cost-per-run as the
// workspace's month-to-date average session cost. Until a workflow has run
// once or a user has spent anything, this falls back to 0 and the card shows
// each scheduled workflow with a run count but no dollar estimate.
const sessionsThisMonth = computed(() =>
  sessions.value.filter(s => s.created_at >= startOfMonthISO.value).length,
)
const avgCostPerRunCents = computed(() => {
  if (sessionsThisMonth.value <= 0 || spendThisMonthCents.value <= 0) return 0
  return Math.round(spendThisMonthCents.value / sessionsThisMonth.value)
})
interface RecurringRow {
  sessionId: string
  workflowName: string
  frequencyLabel: string
  runsPerMonth: number
  monthlyCostCents: number
}
function frequencyLabelFor(freq: string): string {
  switch (freq) {
    case 'hourly': return 'Every hour'
    case 'daily': return 'Daily'
    case 'weekly': return 'Weekly'
    case 'monthly': return 'Monthly'
    case 'custom': return 'Custom'
    case 'none': return 'No schedule'
    default: return freq
  }
}
const recurringRows = computed<RecurringRow[]>(() =>
  activeSchedules.value.map((cfg) => {
    const runs = Math.round(runsPerMonth(cfg))
    return {
      sessionId: cfg.session_id,
      workflowName: cfg.workflow_name,
      frequencyLabel: frequencyLabelFor(cfg.frequency),
      runsPerMonth: runs,
      monthlyCostCents: runs * avgCostPerRunCents.value,
    }
  }),
)
const recurringMonthlyCostCents = computed(() =>
  recurringRows.value.reduce((sum, r) => sum + r.monthlyCostCents, 0),
)
const recurringRunsPerMonth = computed(() =>
  recurringRows.value.reduce((sum, r) => sum + r.runsPerMonth, 0),
)

// ---- Sparkline path helper (smooth area chart) ----
function sparkPath(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return ''
  const stepX = values.length === 1 ? 0 : width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - (v / Math.max(1, max)) * height
    return [x, y] as const
  })
  let d = `M ${points[0]![0]} ${points[0]![1]}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]![0]} ${points[i]![1]}`
  }
  return d
}
function sparkAreaPath(values: number[], width: number, height: number, max: number): string {
  const line = sparkPath(values, width, height, max)
  if (!line) return ''
  return `${line} L ${width} ${height} L 0 ${height} Z`
}

const sparkValues = computed(() => dailyBuckets.value.map(b => b.sessions))
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
          <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
            <!-- ============ HERO ============ -->
            <section
              class="relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white via-white to-neutral-50 p-5 sm:p-7"
            >
              <div
                class="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(10,10,10,0.06),transparent_60%)]"
                aria-hidden="true"
              />
              <div
                class="pointer-events-none absolute right-0 top-0 h-full w-56 opacity-[0.035]"
                style="background-image: linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px); background-size: 22px 22px;"
                aria-hidden="true"
              />

              <div class="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                      :class="planBadgeClass"
                    >
                      {{ planLabel }} plan
                    </span>
                    <span class="text-[11px] text-neutral-400">·</span>
                    <span class="truncate text-xs font-medium text-neutral-600">
                      {{ currentWorkspace?.name ?? 'Workspace' }}
                    </span>
                  </div>
                  <h1 class="mt-2 text-2xl font-semibold tracking-tight leading-tight text-neutral-950 sm:text-3xl">
                    Usage &amp; limits
                  </h1>
                  <p class="mt-2 max-w-xl text-xs leading-relaxed text-neutral-500">
                    Track sessions, storage and spending for this workspace.
                    Quotas reset weekly and are scoped to
                    <span class="font-medium text-neutral-700">{{ currentWorkspace?.name ?? 'this workspace' }}</span>.
                  </p>
                </div>

                <div class="flex shrink-0 flex-wrap items-center gap-2">
                  <NuxtLink
                    to="/pricing"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Compare plans
                  </NuxtLink>
                  <NuxtLink
                    v-if="planKey !== 'enterprise'"
                    :to="{ path: '/pricing', query: upgradeQuery }"
                    class="inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <span class="inline-block size-1.5 rounded-full bg-white/70" />
                    Upgrade plan
                  </NuxtLink>
                </div>
              </div>
            </section>

            <!-- ============ KPI STRIP ============ -->
            <section class="grid grid-cols-2 gap-3 md:grid-cols-4">
              <!-- Sessions this week -->
              <div class="relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Sessions / wk
                  </span>
                  <span
                    v-if="sessionsDeltaPercent != null"
                    class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold"
                    :class="sessionsDelta > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : sessionsDelta < 0
                        ? 'bg-red-50 text-red-600'
                        : 'bg-neutral-100 text-neutral-500'"
                  >
                    <span aria-hidden="true">
                      {{ sessionsDelta > 0 ? '↗' : sessionsDelta < 0 ? '↘' : '→' }}
                    </span>
                    {{ Math.abs(sessionsDeltaPercent) }}%
                  </span>
                  <span
                    v-else
                    class="rounded-full bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-500"
                  >new</span>
                </div>
                <div class="mt-2 flex items-end justify-between gap-3">
                  <div class="min-w-0">
                    <div class="font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                      {{ sessionsThisWeek.toLocaleString() }}
                    </div>
                    <p class="mt-1 text-[11px] text-neutral-500">
                      vs {{ sessionsLastWeek.toLocaleString() }} last week
                    </p>
                  </div>
                  <!-- 7-day sparkline -->
                  <svg
                    viewBox="0 0 80 32"
                    preserveAspectRatio="none"
                    class="h-8 w-20 shrink-0 text-neutral-300"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="sparkSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="currentColor" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      :d="sparkAreaPath(sparkValues, 80, 32, dailyMax)"
                      fill="url(#sparkSessions)"
                    />
                    <path
                      :d="sparkPath(sparkValues, 80, 32, dailyMax)"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="text-neutral-900"
                    />
                  </svg>
                </div>
              </div>

              <!-- Cloud storage -->
              <div class="relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Cloud storage
                  </span>
                  <StorageProviderIcon provider="supabase" inline class="opacity-60" />
                </div>
                <div class="mt-2 flex items-baseline gap-1 font-mono">
                  <span class="text-2xl font-bold leading-none tracking-tight text-neutral-950">
                    {{ formatBytes(storageBytes) }}
                  </span>
                </div>
                <p class="mt-1 text-[11px] text-neutral-500">
                  <template v-if="planLimits.storageBytes != null">
                    of {{ formatBytes(planLimits.storageBytes) }}
                  </template>
                  <template v-else>Unlimited capacity</template>
                </p>
              </div>

              <!-- Balance -->
              <div class="relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Balance
                  </span>
                  <span class="inline-block size-1.5 rounded-full bg-emerald-500" />
                </div>
                <div class="mt-2 font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                  {{ wallet ? formatCents(wallet.balance_cents, wallet.currency as any) : '—' }}
                </div>
                <p class="mt-1 text-[11px] text-neutral-500">
                  Available credit
                </p>
              </div>

              <!-- Spend this month -->
              <div class="relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-4">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Spend / mo
                  </span>
                  <span class="font-mono text-[10px] text-neutral-400">
                    {{ new Date(startOfMonthISO).toLocaleDateString([], { month: 'short' }) }}
                  </span>
                </div>
                <div class="mt-2 font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                  {{ formatCents(spendThisMonthCents, walletCurrency) }}
                </div>
                <p class="mt-1 text-[11px] text-neutral-500">
                  <template v-if="spendThisMonthCents > 0">
                    ~{{ formatCents(dailyAvgSpendCents, walletCurrency) }}/day pace
                  </template>
                  <template v-else>
                    No spend yet this month
                  </template>
                </p>
              </div>
            </section>

            <!-- ============ ROW 1: Weekly limit + Storage rings ============ -->
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <!-- Weekly rate limit -->
              <section
                class="flex flex-col rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6 lg:col-span-2"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold text-neutral-950">This week's sessions</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">
                      Week of {{ weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' }) }}
                    </p>
                  </div>
                  <span
                    v-if="weeklyLimit == null"
                    class="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                  >
                    Unlimited
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    :class="weeklyStatus === 'danger'
                      ? 'bg-red-50 text-red-600'
                      : weeklyStatus === 'warn'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'"
                  >
                    <span
                      class="size-1.5 rounded-full"
                      :class="weeklyStatus === 'danger'
                        ? 'bg-red-500'
                        : weeklyStatus === 'warn'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'"
                    />
                    {{ weeklyStatus === 'danger' ? 'Near cap' : weeklyStatus === 'warn' ? 'Heavy use' : 'On track' }}
                  </span>
                </div>

                <div class="mt-3 flex flex-wrap items-baseline gap-2">
                  <span class="font-mono text-5xl font-bold tracking-tight text-neutral-950">
                    {{ sessionsThisWeek.toLocaleString() }}
                  </span>
                  <span class="font-mono text-lg text-neutral-300">
                    / {{ weeklyLimit == null ? '∞' : weeklyLimit.toLocaleString() }}
                  </span>
                </div>

                <div class="mt-4">
                  <div class="relative h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      class="h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out"
                      :class="weeklyStatus === 'danger'
                        ? 'from-red-500 to-red-600'
                        : weeklyStatus === 'warn'
                          ? 'from-amber-400 to-amber-500'
                          : 'from-neutral-700 to-neutral-900'"
                      :style="{ width: (weeklyPercent ?? 0) + '%' }"
                    />
                  </div>
                  <div class="mt-1.5 flex items-center justify-between text-[11px]">
                    <span class="text-neutral-500">
                      {{ weeklyPercent == null ? 'Unlimited' : weeklyPercent + '% used' }}
                    </span>
                    <span
                      v-if="weeklyRemaining != null"
                      class="font-mono text-neutral-500"
                    >
                      {{ weeklyRemaining.toLocaleString() }} left
                    </span>
                  </div>
                </div>

                <!-- Weekly forecast / projection -->
                <div
                  v-if="weeklyLimit != null && sessionsThisWeek > 0"
                  class="mt-4 flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 p-2.5"
                >
                  <span
                    class="flex size-6 shrink-0 items-center justify-center rounded-md text-xs"
                    :class="projectedStatus === 'over'
                      ? 'bg-red-50 text-red-600'
                      : projectedStatus === 'tight'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 17l6-6 4 4 8-8" stroke-linecap="round" stroke-linejoin="round" />
                      <path d="M14 7h7v7" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <p class="min-w-0 flex-1 text-[11px] leading-snug text-neutral-600">
                    At current pace,
                    <span class="font-mono font-semibold text-neutral-950">~{{ projectedSessions.toLocaleString() }}</span>
                    sessions by week-end
                    <span
                      v-if="projectedPercent != null"
                      class="font-mono"
                      :class="projectedStatus === 'over'
                        ? 'text-red-600'
                        : projectedStatus === 'tight'
                          ? 'text-amber-700'
                          : 'text-emerald-700'"
                    >
                      ({{ projectedPercent }}% of cap)
                    </span>
                  </p>
                </div>

                <div class="mt-auto flex items-center justify-between gap-3 pt-5 text-[11px]">
                  <div class="flex items-center gap-1.5 text-neutral-500">
                    <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" stroke-linecap="round" />
                    </svg>
                    Resets in
                    <span class="font-mono font-semibold text-neutral-950">{{ resetCountdown }}</span>
                  </div>
                  <span class="font-mono text-neutral-400">{{ resetAt }}</span>
                </div>
              </section>

              <!-- Storage by provider (ring charts) -->
              <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6 lg:col-span-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-sm font-semibold text-neutral-950">Storage by provider</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">
                      Used vs. available capacity across connected backends
                    </p>
                  </div>
                  <NuxtLink
                    to="/storage/settings"
                    class="shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Manage
                  </NuxtLink>
                </div>

                <ul class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <li
                    v-for="c in providerCards"
                    :key="c.provider"
                    class="group flex flex-col items-center gap-3 rounded-xl border border-neutral-100 bg-gradient-to-b from-neutral-50/80 to-white p-4 text-center transition-colors hover:border-neutral-200"
                  >
                    <div class="relative size-24">
                      <svg viewBox="0 0 100 100" class="size-full -rotate-90">
                        <circle
                          cx="50"
                          cy="50"
                          :r="RING_R"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="9"
                          :class="c.trackClass"
                        />
                        <circle
                          v-if="c.state === 'tracked'"
                          cx="50"
                          cy="50"
                          :r="RING_R"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="9"
                          stroke-linecap="round"
                          :class="c.ringClass"
                          :stroke-dasharray="providerDash(c)"
                          class="transition-[stroke-dasharray] duration-700 ease-out"
                        />
                      </svg>
                      <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="font-mono text-lg font-bold leading-none text-neutral-950">
                          {{ providerPercentLabel(c) }}
                        </span>
                        <span
                          v-if="c.state === 'tracked'"
                          class="mt-1 text-[9px] font-semibold uppercase tracking-widest text-neutral-400"
                        >
                          used
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5">
                      <StorageProviderIcon :provider="c.provider" inline />
                      <span class="truncate text-[13px] font-semibold text-neutral-950">
                        {{ c.label }}
                      </span>
                    </div>

                    <div class="min-h-[32px]">
                      <p class="font-mono text-[11px] text-neutral-700">
                        {{ providerUsageText(c) }}
                      </p>
                      <p class="mt-0.5 text-[10px] text-neutral-400">
                        {{ c.sublabel }}
                      </p>
                    </div>
                  </li>
                </ul>
              </section>
            </div>

            <!-- ============ ROW 2: Sessions over time ============ -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-neutral-950">Sessions over time</h3>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    {{ chartRange === '12m' ? 'Monthly' : 'Weekly' }} activity · hover a bar for details
                  </p>
                </div>
                <div class="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                  <button
                    v-for="r in ranges"
                    :key="r.value"
                    class="rounded-md px-3 py-1 text-xs font-semibold transition-all"
                    :class="chartRange === r.value
                      ? 'bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/60'
                      : 'text-neutral-500 hover:text-neutral-800'"
                    @click="chartRange = r.value"
                  >
                    {{ r.label }}
                  </button>
                </div>
              </div>

              <div class="mt-5 grid grid-cols-2 gap-4 border-b border-neutral-100 pb-5 sm:grid-cols-4">
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Total</span>
                  <div class="mt-1 font-mono text-lg font-bold tracking-tight text-neutral-950">
                    {{ chartTotal.toLocaleString() }}
                  </div>
                  <p class="mt-0.5 text-[10px] text-neutral-400">sessions</p>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Avg / {{ chartRange === '12m' ? 'mo' : 'wk' }}
                  </span>
                  <div class="mt-1 font-mono text-lg font-bold tracking-tight text-neutral-950">
                    {{ chartAverage.toLocaleString() }}
                  </div>
                  <p class="mt-0.5 text-[10px] text-neutral-400">across range</p>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Peak</span>
                  <div class="mt-1 font-mono text-lg font-bold tracking-tight text-neutral-950">
                    {{ chartPeak.sessions.toLocaleString() }}
                  </div>
                  <p class="mt-0.5 text-[10px] text-neutral-400">· {{ chartPeak.label }}</p>
                </div>
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    Active {{ chartRange === '12m' ? 'months' : 'weeks' }}
                  </span>
                  <div class="mt-1 font-mono text-lg font-bold tracking-tight text-neutral-950">
                    {{ chartActive }}
                    <span class="text-[11px] font-normal text-neutral-400">/ {{ chartBuckets.length }}</span>
                  </div>
                  <p class="mt-0.5 text-[10px] text-neutral-400">with activity</p>
                </div>
              </div>

              <div class="relative mt-5 pl-10 pr-1">
                <!-- Y-axis labels on the left -->
                <div class="pointer-events-none absolute bottom-6 left-0 top-0 flex w-8 flex-col justify-between pr-1 text-right font-mono text-[10px] text-neutral-300">
                  <span>{{ chartMax.toLocaleString() }}</span>
                  <span>{{ Math.round(chartMax / 2).toLocaleString() }}</span>
                  <span>0</span>
                </div>

                <!-- Chart plot area -->
                <div class="relative">
                  <!-- Horizontal gridlines -->
                  <div class="pointer-events-none absolute inset-x-0 top-0 h-44 flex flex-col justify-between">
                    <div class="h-px bg-neutral-100" />
                    <div class="h-px bg-neutral-100/70" />
                    <div class="h-px bg-neutral-200" />
                  </div>

                  <!-- Average line -->
                  <div
                    v-if="chartAverage > 0"
                    class="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    :style="{ bottom: chartAveragePercent * 0.44 + 'rem' }"
                  >
                    <div class="flex-1 border-t border-dashed border-neutral-400/60" />
                    <span class="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-neutral-600">
                      avg {{ chartAverage }}
                    </span>
                  </div>

                  <!-- Bars -->
                  <div class="relative flex h-44 items-end gap-1 border-l border-neutral-200">
                    <button
                      v-for="(b, idx) in chartBuckets"
                      :key="b.key"
                      class="group relative flex h-full min-w-[4px] flex-1 items-end outline-none"
                      @mouseenter="hoveredIdx = idx"
                      @mouseleave="hoveredIdx = null"
                    >
                      <div
                        class="relative w-full rounded-t-sm transition-all duration-200"
                        :class="b.sessions > 0
                          ? hoveredIdx === idx
                            ? 'bg-gradient-to-t from-neutral-700 to-neutral-500'
                            : 'bg-gradient-to-t from-neutral-900 to-neutral-700'
                          : hoveredIdx === idx ? 'bg-neutral-200' : 'bg-neutral-100'"
                        :style="{ height: barHeight(b.sessions) + '%' }"
                      >
                        <!-- Current bucket marker -->
                        <span
                          v-if="idx === chartBuckets.length - 1"
                          class="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-neutral-950 ring-2 ring-white"
                          aria-hidden="true"
                        />
                      </div>
                      <!-- Tooltip -->
                      <div
                        v-if="hoveredIdx === idx"
                        class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 w-56 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left shadow-lg"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <p class="text-[11px] font-semibold text-neutral-950">
                            <template v-if="chartRange === '12m'">
                              {{ b.start.toLocaleDateString([], { month: 'long', year: 'numeric' }) }}
                            </template>
                            <template v-else>
                              Week of {{ b.start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) }}
                            </template>
                          </p>
                          <span
                            v-if="idx === chartBuckets.length - 1"
                            class="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                          >Current</span>
                        </div>
                        <div class="mt-1.5 flex items-center justify-between text-[11px]">
                          <span class="flex items-center gap-1.5 text-neutral-500">
                            <span class="inline-block size-2 rounded-sm bg-gradient-to-t from-neutral-900 to-neutral-700" />
                            Sessions
                          </span>
                          <span class="font-mono font-semibold text-neutral-950">
                            {{ b.sessions.toLocaleString() }}
                          </span>
                        </div>
                        <div v-if="chartAverage > 0" class="mt-1 flex items-center justify-between text-[10px]">
                          <span class="text-neutral-400">vs avg</span>
                          <span
                            class="font-mono font-semibold"
                            :class="b.sessions >= chartAverage ? 'text-emerald-600' : 'text-neutral-500'"
                          >
                            {{ b.sessions >= chartAverage ? '+' : '' }}{{ b.sessions - chartAverage }}
                          </span>
                        </div>
                        <!-- arrow -->
                        <div class="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-neutral-200 bg-white" />
                      </div>
                    </button>
                  </div>

                  <!-- X-axis labels -->
                  <div class="mt-2 flex justify-between text-[10px] text-neutral-400">
                    <span>{{ chartBuckets[0]?.label }}</span>
                    <span v-if="chartBuckets.length > 2">
                      {{ chartBuckets[Math.floor(chartBuckets.length / 2)]?.label }}
                    </span>
                    <span>{{ chartBuckets[chartBuckets.length - 1]?.label }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- ============ Cost insights ============ -->
            <section
              v-if="wallet"
              class="grid grid-cols-1 gap-4 lg:grid-cols-3"
            >
              <!-- Recurring cost: active scheduled workflows -->
              <div class="relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6 lg:col-span-2">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold text-neutral-950">Recurring cost</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">
                      Projected monthly spend from active scheduled workflows
                    </p>
                  </div>
                  <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                    <span class="size-1.5 rounded-full bg-neutral-900" />
                    {{ recurringRows.length }} active
                  </span>
                </div>

                <div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Per month
                    </span>
                    <div class="mt-1 font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                      {{ formatCents(recurringMonthlyCostCents, walletCurrency) }}
                    </div>
                    <p class="mt-1 text-[11px] text-neutral-500">
                      across {{ recurringRunsPerMonth }} run{{ recurringRunsPerMonth === 1 ? '' : 's' }}
                    </p>
                  </div>
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Cost / run
                    </span>
                    <div class="mt-1 font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                      {{ formatCents(avgCostPerRunCents, walletCurrency) }}
                    </div>
                    <p class="mt-1 text-[11px] text-neutral-500">
                      workspace avg this month
                    </p>
                  </div>
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Per day
                    </span>
                    <div class="mt-1 font-mono text-2xl font-bold leading-none tracking-tight text-neutral-950">
                      {{ formatCents(Math.round(recurringMonthlyCostCents / 30), walletCurrency) }}
                    </div>
                    <p class="mt-1 text-[11px] text-neutral-500">
                      averaged over 30d
                    </p>
                  </div>
                </div>

                <!-- Per-workflow breakdown -->
                <ul v-if="recurringRows.length" class="mt-6 divide-y divide-neutral-100 border-t border-neutral-100">
                  <li
                    v-for="row in recurringRows"
                    :key="row.sessionId"
                    class="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <span class="flex size-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                        <UIcon name="i-heroicons-clock" class="size-3.5" />
                      </span>
                      <div class="min-w-0">
                        <NuxtLink
                          :to="`/workflow/${row.sessionId}/schedule`"
                          class="block truncate text-[13px] font-medium text-neutral-950 hover:underline"
                        >
                          {{ row.workflowName }}
                        </NuxtLink>
                        <p class="text-[10px] text-neutral-400">
                          {{ row.frequencyLabel }} · {{ row.runsPerMonth }}/mo
                        </p>
                      </div>
                    </div>
                    <span class="shrink-0 font-mono text-sm font-semibold text-neutral-950 tabular-nums">
                      {{ formatCents(row.monthlyCostCents, walletCurrency) }}
                    </span>
                  </li>
                </ul>
                <div
                  v-else
                  class="mt-6 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-6 text-center"
                >
                  <UIcon name="i-heroicons-calendar-days" class="size-5 text-neutral-400" />
                  <p class="text-[12px] font-medium text-neutral-700">
                    No active scheduled workflows
                  </p>
                  <p class="text-[11px] text-neutral-500">
                    Open a workflow and configure its Schedule tab to start tracking recurring cost.
                  </p>
                </div>
              </div>

              <!-- Wallet activity card -->
              <div class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="text-sm font-semibold text-neutral-950">Wallet flow</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">
                      This month
                    </p>
                  </div>
                  <NuxtLink
                    to="/dashboard/home"
                    class="shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    Manage
                  </NuxtLink>
                </div>

                <ul class="mt-4 flex flex-col gap-3">
                  <li class="flex items-center justify-between gap-3">
                    <span class="flex items-center gap-2 text-xs text-neutral-600">
                      <span class="flex size-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                      </span>
                      Topped up
                    </span>
                    <span class="font-mono text-sm font-semibold text-neutral-950">
                      {{ formatCents(monthTopUpsCents, walletCurrency) }}
                    </span>
                  </li>
                  <li class="flex items-center justify-between gap-3">
                    <span class="flex items-center gap-2 text-xs text-neutral-600">
                      <span class="flex size-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                        <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      </span>
                      Spent
                    </span>
                    <span class="font-mono text-sm font-semibold text-neutral-950">
                      {{ formatCents(spendThisMonthCents, walletCurrency) }}
                    </span>
                  </li>
                  <li v-if="monthRefundsCents > 0" class="flex items-center justify-between gap-3">
                    <span class="flex items-center gap-2 text-xs text-neutral-600">
                      <span class="flex size-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                        <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                          <path d="M3 12a9 9 0 1 0 3-6.7" />
                          <path d="M3 4v5h5" />
                        </svg>
                      </span>
                      Refunded
                    </span>
                    <span class="font-mono text-sm font-semibold text-neutral-950">
                      {{ formatCents(monthRefundsCents, walletCurrency) }}
                    </span>
                  </li>
                </ul>

                <div
                  v-if="monthTopUpsCents > 0"
                  class="mt-4 border-t border-neutral-100 pt-3"
                >
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="text-neutral-500">Spent of topped-up</span>
                    <span class="font-mono font-semibold text-neutral-950">
                      {{ monthSpendPercentOfTopUp }}%
                    </span>
                  </div>
                  <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                      :style="{ width: monthSpendPercentOfTopUp + '%' }"
                    />
                  </div>
                </div>
              </div>
            </section>

            <!-- ============ ROW 3: Plan capabilities ============ -->
            <section class="rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-neutral-950">Your plan</h3>
                  <p class="mt-0.5 text-xs text-neutral-500">
                    Limits that apply to
                    <span class="font-medium text-neutral-700">{{ currentWorkspace?.name ?? 'this workspace' }}</span>
                  </p>
                </div>
                <NuxtLink
                  v-if="planKey !== 'enterprise'"
                  :to="{ path: '/pricing', query: upgradeQuery }"
                  class="shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  See limits
                </NuxtLink>
              </div>

              <dl class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <!-- Seats -->
                <div class="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4">
                  <div class="flex items-center justify-between">
                    <dt class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Seats
                    </dt>
                    <svg viewBox="0 0 24 24" class="size-3.5 text-neutral-300" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="8" r="3" />
                      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" stroke-linecap="round" />
                      <circle cx="17" cy="9" r="2" />
                      <path d="M15 20c0-2 1.5-3.5 4-3.5" stroke-linecap="round" />
                    </svg>
                  </div>
                  <dd class="mt-2 flex items-baseline gap-1 font-mono">
                    <span class="text-xl font-bold leading-none text-neutral-950">
                      {{ members.length }}
                    </span>
                    <span class="text-[11px] text-neutral-400">
                      / {{ planLimits.seats == null ? '∞' : planLimits.seats }}
                    </span>
                  </dd>
                  <div class="mt-3 h-1 overflow-hidden rounded-full bg-neutral-200/70">
                    <div
                      class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                      :style="{ width: (percent(members.length, planLimits.seats) ?? 100) + '%' }"
                    />
                  </div>
                  <p class="mt-2 text-[10px] text-neutral-500">
                    {{ members.length === 1 ? 'member' : 'members' }} active
                  </p>
                </div>

                <!-- Weekly sessions cap -->
                <div class="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4">
                  <div class="flex items-center justify-between">
                    <dt class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Weekly sessions
                    </dt>
                    <svg viewBox="0 0 24 24" class="size-3.5 text-neutral-300" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="5" width="18" height="15" rx="2" />
                      <path d="M8 3v4M16 3v4M3 10h18" stroke-linecap="round" />
                    </svg>
                  </div>
                  <dd class="mt-2 font-mono text-xl font-bold leading-none text-neutral-950">
                    <template v-if="planLimits.sessionsWeekly == null">∞</template>
                    <template v-else>{{ planLimits.sessionsWeekly.toLocaleString() }}</template>
                  </dd>
                  <div class="mt-3 h-1 overflow-hidden rounded-full bg-neutral-200/70">
                    <div
                      class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                      :style="{ width: (weeklyPercent ?? 0) + '%' }"
                    />
                  </div>
                  <p class="mt-2 text-[10px] text-neutral-500">
                    {{ weeklyPercent == null ? 'unlimited usage' : weeklyPercent + '% used this week' }}
                  </p>
                </div>

                <!-- Browser agents -->
                <div class="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4">
                  <div class="flex items-center justify-between">
                    <dt class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Browser agents
                    </dt>
                    <svg viewBox="0 0 24 24" class="size-3.5 text-neutral-300" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 9h18M7 7.5h.01M10 7.5h.01" stroke-linecap="round" />
                    </svg>
                  </div>
                  <dd class="mt-2 font-mono text-xl font-bold leading-none text-neutral-950">
                    <template v-if="planLimits.browserAgents == null">∞</template>
                    <template v-else>{{ planLimits.browserAgents.toLocaleString() }}</template>
                  </dd>
                  <div
                    v-if="planLimits.browserAgents != null"
                    class="mt-3 flex items-center gap-1"
                    aria-hidden="true"
                  >
                    <span
                      v-for="i in Math.min(planLimits.browserAgents, 8)"
                      :key="i"
                      class="h-1.5 flex-1 rounded-full bg-neutral-900/85"
                    />
                    <span
                      v-if="planLimits.browserAgents > 8"
                      class="ml-0.5 font-mono text-[9px] font-semibold text-neutral-500"
                    >+{{ planLimits.browserAgents - 8 }}</span>
                  </div>
                  <div v-else class="mt-3 flex items-center gap-1" aria-hidden="true">
                    <span v-for="i in 8" :key="i" class="h-1.5 flex-1 rounded-full bg-gradient-to-r from-neutral-900 to-neutral-400" />
                  </div>
                  <p class="mt-2 text-[10px] text-neutral-500">
                    concurrent agents available
                  </p>
                </div>

                <!-- Max file size -->
                <div class="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4">
                  <div class="flex items-center justify-between">
                    <dt class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      Max file size
                    </dt>
                    <svg viewBox="0 0 24 24" class="size-3.5 text-neutral-300" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke-linejoin="round" />
                      <path d="M14 3v5h5" stroke-linejoin="round" />
                    </svg>
                  </div>
                  <dd class="mt-2 font-mono text-xl font-bold leading-none text-neutral-950">
                    <template v-if="planLimits.fileSizeBytes == null">∞</template>
                    <template v-else>{{ formatBytes(planLimits.fileSizeBytes) }}</template>
                  </dd>
                  <div class="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600 ring-1 ring-neutral-200">
                    <span class="size-1 rounded-full bg-neutral-400" aria-hidden="true" />
                    per upload
                  </div>
                  <p class="mt-2 text-[10px] text-neutral-500">
                    Larger files require a higher tier
                  </p>
                </div>
              </dl>

              <div
                v-if="planKey !== 'enterprise'"
                class="mt-4 flex flex-col gap-2 rounded-xl bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800 p-4 text-white sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <p class="text-xs font-semibold">
                    {{ planKey === 'free' ? 'Scale beyond the free tier' : 'Need more room?' }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-white/60">
                    {{ planKey === 'free'
                      ? 'Upgrade to Pro for 10× the weekly session cap and 50× more storage.'
                      : 'Higher plans unlock more seats, storage and browser agents.' }}
                  </p>
                </div>
                <NuxtLink
                  :to="{ path: '/pricing', query: upgradeQuery }"
                  class="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-950 transition-transform hover:scale-[1.02]"
                >
                  Compare plans →
                </NuxtLink>
              </div>
            </section>

            <!-- ============ FOOTER NOTE ============ -->
            <p class="flex items-start gap-2 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 text-[11px] leading-relaxed text-neutral-500">
              <svg viewBox="0 0 24 24" class="mt-0.5 size-3.5 shrink-0 text-neutral-400" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" stroke-linecap="round" />
              </svg>
              <span>
                Each workspace in Polymux is billed separately — seats, storage and session quotas are scoped to
                <span class="font-medium text-neutral-700">{{ currentWorkspace?.name ?? 'this workspace' }}</span>.
                Switch workspaces to see another tenant's usage.
              </span>
            </p>

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
