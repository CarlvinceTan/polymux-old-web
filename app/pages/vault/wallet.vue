<script setup lang="ts">
import { useWallet, CREDIT_PACKS } from '~/composables/wallet/useWallet'
import { useIntersectionObserver, useLocalStorage } from '@vueuse/core'
import { useInfiniteList } from '~/composables/misc/useInfiniteList'

const { t } = useI18n()
const { headerTabs, customTabs } = useVaultNavTabs()

const { isEnabled: isFeatureEnabled, ready: flagsReady } = useMeFeatures()
const walletEnabled = computed(() => isFeatureEnabled('wallet'))

const {
  transactions,
  budgets,
  balanceDisplay,
  loading,
  fetchWallet,
  fetchTransactions,
  fetchBudgets,
  topUp,
  formatCents,
} = useWallet()

const route = useRoute()
const topUpSuccess = computed(() => route.query.top_up === 'success')
const topUpCancelled = computed(() => route.query.top_up === 'cancelled')

function refreshAll() {
  fetchWallet({ force: true })
  fetchTransactions({ force: true })
  fetchBudgets(undefined, { force: true })
}

// Reconnect: ignore the in-memory freshness window — the network was just
// down, so the cache may not reflect server state.
useOnReconnect(() => refreshAll())

watch(topUpSuccess, (v) => {
  if (v) refreshAll()
})

// ---- Inner tab navigation ----
type Section = 'overview' | 'activity' | 'workflows' | 'policies'
const section = ref<Section>('overview')
const sections = computed<{ id: Section, label: string, icon: string }[]>(() => [
  { id: 'overview', label: t('vault.wallet.sections.overview'), icon: 'i-heroicons-squares-2x2' },
  { id: 'activity', label: t('vault.wallet.sections.activity'), icon: 'i-heroicons-list-bullet' },
  { id: 'workflows', label: t('vault.wallet.sections.workflows'), icon: 'i-heroicons-rectangle-stack' },
  { id: 'policies', label: t('vault.wallet.sections.policies'), icon: 'i-heroicons-shield-check' },
])

// ---- Top-up modal ----
const topUpModalOpen = ref(false)
const topUpAmountInput = ref<number | null>(null)
const topUpError = ref<string | null>(null)
const isToppingUp = ref(false)
const packs = CREDIT_PACKS
const MIN_USD = 1
const MAX_USD = 1000

const minInput = computed(() => MIN_USD)
const maxInput = computed(() => MAX_USD)

function openTopUp() {
  topUpError.value = null
  topUpAmountInput.value = null
  topUpModalOpen.value = true
}

function selectPreset(cents: number) {
  topUpAmountInput.value = cents / 100
  topUpError.value = null
}

async function submitTopUp() {
  topUpError.value = null
  const v = topUpAmountInput.value
  if (!v || v < minInput.value || v > maxInput.value) {
    topUpError.value = t('vault.wallet.topUpModal.amountRangeError', {
      min: formatAmount(minInput.value),
      max: formatAmount(maxInput.value),
    })
    return
  }
  const cents = Math.round(v * 100)
  isToppingUp.value = true
  const res = await topUp(cents)
  if (!res) {
    isToppingUp.value = false
    topUpError.value = t('vault.wallet.topUpModal.checkoutError')
  }
}

function formatAmount(val: number) {
  return `$${val}`
}

// ---- Auto top-up modal ----
const autoTopUpModalOpen = ref(false)
const autoTopUpEnabled = useLocalStorage('wallet:auto_topup_enabled', false, { initOnMounted: true })
const autoTopUpThreshold = useLocalStorage('wallet:low_balance_threshold', 5, { initOnMounted: true })
const autoTopUpAmount = useLocalStorage('wallet:auto_topup_amount', 25, { initOnMounted: true })

// ---- Activity bar chart ----
type Range = 7 | 30 | 90
const chartRange = useLocalStorage<Range>('wallet:chart_range', 30, { initOnMounted: true })
const ranges = computed<{ value: Range, label: string }[]>(() => [
  { value: 7, label: t('vault.wallet.chartRanges.d7') },
  { value: 30, label: t('vault.wallet.chartRanges.d30') },
  { value: 90, label: t('vault.wallet.chartRanges.d90') },
])

function dayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const chartData = computed(() => {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  const days: { date: Date, key: string, spent: number, topped: number }[] = []
  const n = chartRange.value
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({ date: d, key: dayKey(d), spent: 0, topped: 0 })
  }
  const map = new Map(days.map(d => [d.key, d]))
  for (const tx of transactions.value) {
    const dk = dayKey(new Date(tx.created_at))
    const entry = map.get(dk)
    if (!entry) continue
    if (tx.type === 'deduction') entry.spent += Math.abs(tx.amount_cents)
    else if (tx.type === 'top_up') entry.topped += tx.amount_cents
  }
  return days
})

const totalSpent = computed(() => chartData.value.reduce((s, d) => s + d.spent, 0))
const totalTopped = computed(() => chartData.value.reduce((s, d) => s + d.topped, 0))
const averageDaily = computed(() => Math.round(totalSpent.value / Math.max(1, chartRange.value)))
const maxSpentDay = computed(() => Math.max(1, ...chartData.value.map(d => d.spent)))
const daysWithSpend = computed(() => chartData.value.filter(d => d.spent > 0).length)

const hoveredIdx = ref<number | null>(null)

function barHeight(cents: number) {
  if (cents <= 0) return 2
  return Math.max(3, Math.round((cents / maxSpentDay.value) * 100))
}

function axisLabel(d: Date) {
  if (chartRange.value <= 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---- Workflow breakdown ----
const sortKey = ref<'spent' | 'recent' | 'allocated'>('spent')
const sortOptions = computed<{ value: typeof sortKey.value, label: string }[]>(() => [
  { value: 'spent', label: t('vault.wallet.sortOptions.spent') },
  { value: 'allocated', label: t('vault.wallet.sortOptions.allocated') },
  { value: 'recent', label: t('vault.wallet.sortOptions.recent') },
])

const workflowBreakdown = computed(() => {
  const map = new Map<string, {
    sessionId: string
    spent: number
    topped: number
    allocated: number
    status: string
    lastActivity: string
    txCount: number
  }>()
  for (const b of budgets.value) {
    map.set(b.session_id, {
      sessionId: b.session_id,
      spent: b.spent_cents,
      topped: 0,
      allocated: b.allocated_cents,
      status: b.status,
      lastActivity: b.updated_at,
      txCount: 0,
    })
  }
  for (const tx of transactions.value) {
    if (!tx.session_id) continue
    let entry = map.get(tx.session_id)
    if (!entry) {
      entry = {
        sessionId: tx.session_id,
        spent: 0,
        topped: 0,
        allocated: 0,
        status: 'released',
        lastActivity: tx.created_at,
        txCount: 0,
      }
      map.set(tx.session_id, entry)
    }
    entry.txCount += 1
    if (!map.get(tx.session_id)?.lastActivity || tx.created_at > entry.lastActivity) {
      entry.lastActivity = tx.created_at
    }
    if (tx.type === 'deduction' && !budgets.value.find(b => b.session_id === tx.session_id)) {
      entry.spent += Math.abs(tx.amount_cents)
    }
  }
  const list = [...map.values()]
  list.sort((a, b) => {
    if (sortKey.value === 'spent') return b.spent - a.spent
    if (sortKey.value === 'allocated') return b.allocated - a.allocated
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  })
  return list
})

const maxWorkflowSpend = computed(
  () => Math.max(1, ...workflowBreakdown.value.map(w => w.spent)),
)

// ---- Transaction filters ----
const txTypeFilter = ref<string>('all')
const txWorkflowFilter = ref<string>('all')
const txSearch = ref('')
const txTypeOptions = computed(() => [
  { value: 'all', label: t('vault.wallet.txTypeFilter.all') },
  { value: 'top_up', label: t('vault.wallet.txTypeFilter.topUp') },
  { value: 'allocation', label: t('vault.wallet.txTypeFilter.allocation') },
  { value: 'deduction', label: t('vault.wallet.txTypeFilter.deduction') },
  { value: 'refund', label: t('vault.wallet.txTypeFilter.refund') },
  { value: 'adjustment', label: t('vault.wallet.txTypeFilter.adjustment') },
])

const filteredTransactions = computed(() => {
  const q = txSearch.value.trim().toLowerCase()
  return transactions.value.filter((t) => {
    if (txTypeFilter.value !== 'all' && t.type !== txTypeFilter.value) return false
    if (txWorkflowFilter.value === 'workspace' && t.session_id) return false
    if (
      txWorkflowFilter.value !== 'all'
      && txWorkflowFilter.value !== 'workspace'
      && t.session_id !== txWorkflowFilter.value
    ) return false
    if (q) {
      const desc = (t.description || '').toLowerCase()
      if (!desc.includes(q) && !t.type.includes(q)) return false
    }
    return true
  })
})

const walletTabPanelRef = ref<{ bodyScrollEl: HTMLElement | null } | null>(null)
const walletScrollRoot = computed(() => walletTabPanelRef.value?.bodyScrollEl ?? undefined)

const { visibleItems: visibleWorkflowRows, hasMore: workflowHasMore, loadMore: loadMoreWorkflow } = useInfiniteList(workflowBreakdown, 15)
const workflowScrollSentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(
  workflowScrollSentinel,
  ([e]) => {
    if (e?.isIntersecting && workflowHasMore.value) loadMoreWorkflow()
  },
  { root: walletScrollRoot, rootMargin: '100px' },
)

const { visibleItems: visibleFilteredTx, hasMore: txHasMore, loadMore: loadMoreTx } = useInfiniteList(filteredTransactions, 45)
const txScrollSentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(
  txScrollSentinel,
  ([e]) => {
    if (e?.isIntersecting && txHasMore.value) loadMoreTx()
  },
  { root: walletScrollRoot, rootMargin: '120px' },
)

// ---- Policies (remaining — auto top-up now promoted to a top-level button) ----
const defaultWorkflowBudget = useLocalStorage('wallet:default_session_budget', 5, { initOnMounted: true })
const defaultOperationMax = useLocalStorage('wallet:default_operation_max', 0.5, { initOnMounted: true })
const defaultLlmCap = useLocalStorage('wallet:max_llm_cost', 1.5, { initOnMounted: true })
const approvalThreshold = useLocalStorage('wallet:approval_threshold', 1, { initOnMounted: true })
const maxStepsPerSession = useLocalStorage('wallet:max_steps', 100, { initOnMounted: true })
const maxScreenshots = useLocalStorage('wallet:max_screenshots', 50, { initOnMounted: true })
const maxDurationMinutes = useLocalStorage('wallet:max_duration_minutes', 30, { initOnMounted: true })
const maxConcurrent = useLocalStorage('wallet:concurrency_limit', 3, { initOnMounted: true })
const dailyWorkspaceCap = useLocalStorage('wallet:daily_cap', 50, { initOnMounted: true })
const pauseOnExhaustion = useLocalStorage('wallet:pause_on_exhaust', true, { initOnMounted: true })
const notifyLowBalance = useLocalStorage('wallet:notify_low_balance', true, { initOnMounted: true })
const notifyOverrun = useLocalStorage('wallet:notify_overrun', true, { initOnMounted: true })
const requireApprovalExternal = useLocalStorage('wallet:require_approval_external', true, { initOnMounted: true })
const blockAfterHours = useLocalStorage('wallet:block_after_hours', false, { initOnMounted: true })
const domainPolicy = useLocalStorage<'any' | 'allowlist' | 'denylist'>('wallet:domain_policy', 'any', { initOnMounted: true })
const domainList = useLocalStorage('wallet:domain_list', '', { initOnMounted: true })
const domainPolicyOptions = ['any', 'allowlist', 'denylist'] as const
function domainPolicyLabel(opt: typeof domainPolicyOptions[number]) {
  if (opt === 'any') return t('vault.wallet.policies.domainAny')
  if (opt === 'allowlist') return t('vault.wallet.policies.domainAllowlist')
  return t('vault.wallet.policies.domainDenylist')
}

// ---- Workflow drill-down ----
const selectedWorkflowId = ref<string | null>(null)
const selectedWorkflow = computed(
  () => budgets.value.find(b => b.session_id === selectedWorkflowId.value) ?? null,
)
const selectedWorkflowTxs = computed(() => {
  if (!selectedWorkflowId.value) return []
  return transactions.value.filter(t => t.session_id === selectedWorkflowId.value)
})
watchEffect(() => {
  if (!selectedWorkflowId.value && budgets.value.length) {
    selectedWorkflowId.value = budgets.value[0]!.session_id
  }
})
function openWorkflow(id: string) {
  selectedWorkflowId.value = id
  section.value = 'workflows'
}

// ---- Shared UI helpers ----
const STATUS_CONFIG = computed<Record<string, { label: string, dot: string, chip: string }>>(() => ({
  active: { label: t('vault.wallet.status.active'), dot: 'bg-green-500', chip: 'bg-green-50 text-green-700 ring-green-100' },
  paused: { label: t('vault.wallet.status.paused'), dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
  exhausted: { label: t('vault.wallet.status.exhausted'), dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 ring-red-100' },
  released: { label: t('vault.wallet.status.released'), dot: 'bg-neutral-300', chip: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
}))

const TX_TYPE_CONFIG = computed<Record<string, { label: string, icon: string, ring: string, bg: string, text: string }>>(() => ({
  top_up: { label: t('vault.wallet.txType.topUp'), icon: '↓', ring: 'ring-green-100', bg: 'bg-green-50', text: 'text-green-600' },
  allocation: { label: t('vault.wallet.txType.allocation'), icon: '→', ring: 'ring-amber-100', bg: 'bg-amber-50', text: 'text-amber-600' },
  deduction: { label: t('vault.wallet.txType.deduction'), icon: '↑', ring: 'ring-red-100', bg: 'bg-red-50', text: 'text-red-600' },
  refund: { label: t('vault.wallet.txType.refund'), icon: '↩', ring: 'ring-blue-100', bg: 'bg-blue-50', text: 'text-blue-600' },
  adjustment: { label: t('vault.wallet.txType.adjustment'), icon: '⟳', ring: 'ring-neutral-200', bg: 'bg-neutral-100', text: 'text-neutral-600' },
}))

function formatDate(dateStr: string, detailed = false) {
  const d = new Date(dateStr)
  if (detailed) {
    return d.toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function sessionShort(id: string) {
  return id.split('-')[0] ?? id.slice(0, 8)
}

function usagePercent(b: { spent_cents: number, allocated_cents: number }) {
  if (!b.allocated_cents) return 0
  return Math.min(100, Math.round((b.spent_cents / b.allocated_cents) * 100))
}

function usageBarColor(p: number) {
  if (p >= 90) return 'bg-red-500'
  if (p >= 70) return 'bg-amber-500'
  return 'bg-neutral-900'
}

</script>

<template>
  <FeatureGate name="vault">
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" :custom-tabs="customTabs" raw-tab-labels />
    </header>

    <TabPanel ref="walletTabPanelRef" class="min-h-0 min-w-0 flex-1">
      <div v-if="!walletEnabled" class="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div class="flex size-14 items-center justify-center rounded-2xl border border-neutral-200/80 bg-white text-neutral-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <UIcon name="i-heroicons-wallet" class="size-6" />
        </div>
        <h2 class="mt-6 font-serif text-2xl tracking-tight text-neutral-950">
          {{ t('vault.wallet.comingSoon.title') }}
        </h2>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-neutral-600">
          {{ t('vault.wallet.comingSoon.description') }}
        </p>
      </div>
      <div v-else-if="walletEnabled" class="flex min-w-0 flex-col">
          <!-- Inner tabs -->
          <nav
            class="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-neutral-100 bg-white/95 px-4 backdrop-blur-sm sm:px-6"
          >
            <button
              v-for="s in sections"
              :key="s.id"
              class="relative flex items-center gap-2 px-3 py-3 text-sm font-medium outline-none transition-colors"
              :class="section === s.id ? 'text-neutral-950' : 'text-neutral-500 hover:text-neutral-800'"
              @click="section = s.id"
            >
              <UIcon :name="s.icon" class="size-4" />
              {{ s.label }}
              <div
                v-if="section === s.id"
                class="absolute -bottom-px left-0 right-0 h-0.5 rounded-t-full bg-neutral-950"
              />
            </button>
          </nav>

          <!-- Banners -->
          <div
            v-if="topUpSuccess || topUpCancelled"
            class="flex flex-col gap-2 px-4 pt-4 sm:px-6"
          >
            <div
              v-if="topUpSuccess"
              class="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50/70 px-4 py-2.5 text-sm text-green-700"
            >
              <UIcon name="i-heroicons-check-circle" class="size-4" />
              {{ t('vault.wallet.banner.topUpCompleted') }}
            </div>
            <div
              v-if="topUpCancelled"
              class="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-600"
            >
              <UIcon name="i-heroicons-information-circle" class="size-4 text-neutral-400" />
              {{ t('vault.wallet.banner.topUpCancelled') }}
            </div>
          </div>

          <div class="flex min-w-0 flex-1 flex-col">
            <!-- OVERVIEW -->
            <div v-if="section === 'overview'" class="flex flex-col gap-5 p-4 sm:p-6">
              <!-- Balance + currency row -->
              <div class="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                <div>
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.overview.availableBalance') }}</span>
                  <div class="mt-1 flex items-baseline gap-3">
                    <span class="font-mono text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl">
                      {{ balanceDisplay }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                    :class="autoTopUpEnabled
                      ? 'border-green-200 bg-green-50 text-green-700 hover:border-green-300'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'"
                    @click="autoTopUpModalOpen = true"
                  >
                    <UIcon name="i-heroicons-arrow-path" class="size-3.5" />
                    {{ t('vault.wallet.overview.autoTopUp') }}
                    <span
                      v-if="autoTopUpEnabled"
                      class="rounded-full bg-white px-1.5 py-px text-[10px] font-bold text-green-700 ring-1 ring-green-200"
                    >{{ t('vault.wallet.overview.autoTopUpOn') }}</span>
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    @click="openTopUp"
                  >
                    <UIcon name="i-heroicons-plus" class="size-3.5" />
                    {{ t('vault.wallet.overview.topUp') }}
                  </button>
                </div>
              </div>

              <!-- Activity bar chart -->
              <section class="rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.activity.title') }}</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">{{ t('vault.wallet.activity.subtitle') }}</p>
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
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.activity.spentN', { n: chartRange }) }}</span>
                    <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">{{ formatCents(totalSpent) }}</div>
                  </div>
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.activity.toppedN', { n: chartRange }) }}</span>
                    <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">{{ formatCents(totalTopped) }}</div>
                  </div>
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.activity.dailyAverage') }}</span>
                    <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">{{ formatCents(averageDaily) }}</div>
                  </div>
                  <div>
                    <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.activity.activeDays') }}</span>
                    <div class="mt-0.5 font-mono text-xl font-bold text-neutral-950">{{ daysWithSpend }} <span class="text-xs text-neutral-400">/ {{ chartRange }}</span></div>
                  </div>
                </div>

                <!-- Chart -->
                <div class="relative mt-5">
                  <div
                    class="pointer-events-none absolute inset-x-0 top-0 flex h-40 flex-col justify-between text-[10px] font-mono text-neutral-300"
                  >
                    <span>{{ formatCents(maxSpentDay) }}</span>
                    <span>{{ formatCents(Math.round(maxSpentDay / 2)) }}</span>
                    <span>0</span>
                  </div>
                  <div class="flex h-40 items-end gap-[2px] border-b border-l border-neutral-100 pl-1 pr-12">
                    <button
                      v-for="(d, idx) in chartData"
                      :key="d.key"
                      class="group relative flex h-full min-w-[3px] flex-1 items-end outline-none"
                      @mouseenter="hoveredIdx = idx"
                      @mouseleave="hoveredIdx = null"
                    >
                      <div
                        class="w-full rounded-t-sm transition-colors"
                        :class="d.spent > 0
                          ? hoveredIdx === idx ? 'bg-neutral-700' : 'bg-neutral-900'
                          : hoveredIdx === idx ? 'bg-neutral-200' : 'bg-neutral-100'"
                        :style="{ height: barHeight(d.spent) + '%' }"
                      />
                      <!-- Tooltip -->
                      <div
                        v-if="hoveredIdx === idx"
                        class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left shadow-lg"
                      >
                        <p class="text-[11px] font-semibold text-neutral-950">
                          {{ d.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) }}
                        </p>
                        <div class="mt-1 flex items-center justify-between text-[11px]">
                          <span class="text-neutral-500">{{ t('vault.wallet.activity.tooltipSpent') }}</span>
                          <span class="font-mono font-semibold text-neutral-950">{{ formatCents(d.spent) }}</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px]">
                          <span class="text-neutral-500">{{ t('vault.wallet.activity.tooltipTopped') }}</span>
                          <span class="font-mono font-semibold text-green-600">{{ formatCents(d.topped) }}</span>
                        </div>
                      </div>
                    </button>
                  </div>
                  <div class="mt-2 flex justify-between pr-12 pl-1 text-[10px] text-neutral-400">
                    <span>{{ axisLabel(chartData[0]!.date) }}</span>
                    <span>{{ axisLabel(chartData[Math.floor(chartData.length / 2)]!.date) }}</span>
                    <span>{{ axisLabel(chartData[chartData.length - 1]!.date) }}</span>
                  </div>
                </div>
              </section>

              <!-- Spending by workflow -->
              <section class="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white">
                <header class="flex items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-6">
                  <div>
                    <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.spendingByWorkflow.title') }}</h3>
                    <p class="mt-0.5 text-xs text-neutral-500">{{ t('vault.wallet.spendingByWorkflow.subtitle') }}</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-neutral-400">{{ t('vault.wallet.spendingByWorkflow.count', { n: workflowBreakdown.length }) }}</span>
                    <select
                      v-model="sortKey"
                      name="workflow-spend-sort"
                      class="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-700 outline-none focus:border-neutral-950"
                    >
                      <option v-for="o in sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </header>

                <div v-if="workflowBreakdown.length === 0" class="flex flex-col items-center justify-center gap-2 py-12 text-neutral-400">
                  <UIcon name="i-heroicons-chart-bar" class="size-6 text-neutral-300" />
                  <span class="text-sm">{{ t('vault.wallet.spendingByWorkflow.empty') }}</span>
                </div>
                <div v-else>
                  <button
                    v-for="w in visibleWorkflowRows"
                    :key="w.sessionId"
                    class="grid w-full grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-4 border-b border-neutral-50 px-5 py-3 text-left last:border-0 transition-colors hover:bg-neutral-50/70 sm:px-6"
                    @click="openWorkflow(w.sessionId)"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <span class="size-1.5 shrink-0 rounded-full" :class="STATUS_CONFIG[w.status]?.dot || 'bg-neutral-300'" />
                      <div class="min-w-0">
                        <p class="truncate font-mono text-xs font-semibold text-neutral-950">{{ sessionShort(w.sessionId) }}</p>
                        <p class="truncate text-[10px] text-neutral-400">
                          {{ STATUS_CONFIG[w.status]?.label || t('vault.wallet.status.released') }} · {{ formatDate(w.lastActivity) }}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          class="h-full transition-all"
                          :class="usageBarColor(w.allocated ? usagePercent({ spent_cents: w.spent, allocated_cents: w.allocated }) : 100)"
                          :style="{ width: Math.round((w.spent / maxWorkflowSpend) * 100) + '%' }"
                        />
                      </div>
                      <span v-if="w.allocated" class="shrink-0 font-mono text-[10px] text-neutral-400">
                        {{ usagePercent({ spent_cents: w.spent, allocated_cents: w.allocated }) }}%
                      </span>
                    </div>
                    <div class="flex shrink-0 items-baseline gap-1.5">
                      <span class="font-mono text-sm font-semibold text-neutral-950">{{ formatCents(w.spent) }}</span>
                      <span v-if="w.allocated" class="font-mono text-[11px] text-neutral-400">
                        / {{ formatCents(w.allocated) }}
                      </span>
                    </div>
                  </button>
                  <div
                    v-if="workflowHasMore"
                    ref="workflowScrollSentinel"
                    class="h-2 w-full shrink-0"
                    aria-hidden="true"
                  />
                </div>
              </section>
            </div>

            <!-- TRANSACTIONS -->
            <div v-else-if="section === 'activity'" class="flex flex-col gap-4 p-4 sm:p-6">
              <div class="flex flex-wrap items-center gap-2">
                <div class="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                  <UIcon name="i-heroicons-magnifying-glass" class="size-4 text-neutral-400" />
                  <input
                    v-model="txSearch"
                    name="tx-search"
                    class="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
                    :placeholder="t('vault.wallet.txTable.searchPlaceholder')"
                  >
                </div>
                <select
                  v-model="txTypeFilter"
                  name="tx-type-filter"
                  class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                >
                  <option v-for="o in txTypeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <select
                  v-model="txWorkflowFilter"
                  name="tx-workflow-filter"
                  class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
                >
                  <option value="all">{{ t('vault.wallet.txTable.allSources') }}</option>
                  <option value="workspace">{{ t('vault.wallet.txTable.workspaceOnly') }}</option>
                  <option v-for="b in budgets" :key="b.session_id" :value="b.session_id">
                    {{ t('vault.wallet.txTable.workflowOption', { id: sessionShort(b.session_id) }) }}
                  </option>
                </select>
                <span class="ml-auto text-xs text-neutral-500">
                  {{ t('vault.wallet.txTable.countSummary', { shown: visibleFilteredTx.length, total: filteredTransactions.length }) }}
                </span>
              </div>

              <div class="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white">
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[780px] border-collapse">
                    <thead>
                      <tr class="border-b border-neutral-100 bg-neutral-50/60 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        <th class="px-5 py-2.5">{{ t('vault.wallet.txTable.type') }}</th>
                        <th class="px-5 py-2.5">{{ t('vault.wallet.txTable.description') }}</th>
                        <th class="px-5 py-2.5">{{ t('vault.wallet.txTable.workflow') }}</th>
                        <th class="px-5 py-2.5">{{ t('vault.wallet.txTable.date') }}</th>
                        <th class="px-5 py-2.5 text-right">{{ t('vault.wallet.txTable.amount') }}</th>
                        <th class="px-5 py-2.5 text-right">{{ t('vault.wallet.txTable.balance') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="filteredTransactions.length === 0">
                        <td colspan="6" class="px-5 py-10 text-center text-sm text-neutral-400">
                          {{ t('vault.wallet.txTable.empty') }}
                        </td>
                      </tr>
                      <template v-else>
                        <tr
                          v-for="tx in visibleFilteredTx"
                          :key="tx.id"
                          class="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/60"
                        >
                          <td class="px-5 py-3 align-middle">
                            <span
                              class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1"
                              :class="[TX_TYPE_CONFIG[tx.type]?.bg, TX_TYPE_CONFIG[tx.type]?.text, TX_TYPE_CONFIG[tx.type]?.ring]"
                            >
                              <span>{{ TX_TYPE_CONFIG[tx.type]?.icon }}</span>
                              {{ TX_TYPE_CONFIG[tx.type]?.label }}
                            </span>
                          </td>
                          <td class="px-5 py-3 align-middle text-sm text-neutral-800">{{ tx.description || '—' }}</td>
                          <td class="px-5 py-3 align-middle text-sm">
                            <button
                              v-if="tx.session_id"
                              class="font-mono text-xs text-neutral-950 hover:underline"
                              @click="openWorkflow(tx.session_id!)"
                            >
                              {{ sessionShort(tx.session_id) }}
                            </button>
                            <span v-else class="text-xs text-neutral-400">{{ t('vault.wallet.txTable.workspaceTag') }}</span>
                          </td>
                          <td class="px-5 py-3 align-middle text-sm text-neutral-500">{{ formatDate(tx.created_at, true) }}</td>
                          <td
                            class="px-5 py-3 text-right align-middle font-mono text-sm font-semibold"
                            :class="tx.amount_cents >= 0 ? 'text-green-600' : 'text-neutral-900'"
                          >
                            {{ tx.amount_cents >= 0 ? '+' : '' }}{{ formatCents(Math.abs(tx.amount_cents)) }}
                          </td>
                          <td class="px-5 py-3 text-right align-middle font-mono text-xs text-neutral-500">
                            {{ formatCents(tx.balance_after_cents) }}
                          </td>
                        </tr>
                        <tr v-if="txHasMore" aria-hidden="true">
                          <td colspan="6" class="h-2 p-0">
                            <div ref="txScrollSentinel" class="h-1" />
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- WORKFLOWS -->
            <div v-else-if="section === 'workflows'" class="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row">
              <aside class="flex w-full shrink-0 flex-col gap-2 lg:w-72">
                <div class="flex items-center justify-between px-1">
                  <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.workflowsView.workflowsLabel') }}</span>
                  <span class="rounded-full bg-neutral-100 px-1.5 py-px text-[10px] font-semibold text-neutral-600">{{ budgets.length }}</span>
                </div>
                <div
                  v-if="budgets.length === 0"
                  class="rounded-2xl border border-dashed border-neutral-200 bg-white/50 p-5 text-center text-sm text-neutral-400"
                >
                  {{ t('vault.wallet.workflowsView.emptyAside') }}
                </div>
                <div v-else class="flex flex-col gap-2">
                  <button
                    v-for="b in budgets"
                    :key="b.id"
                    class="flex flex-col gap-2 rounded-xl border bg-white p-3 text-left transition-all hover:border-neutral-400 hover:shadow-sm"
                    :class="selectedWorkflowId === b.session_id
                      ? 'border-neutral-950 shadow-sm ring-1 ring-neutral-950/10'
                      : 'border-neutral-200/60'"
                    @click="selectedWorkflowId = b.session_id"
                  >
                    <div class="flex items-center justify-between">
                      <span class="flex items-center gap-1.5 text-sm">
                        <span class="size-1.5 rounded-full" :class="STATUS_CONFIG[b.status]?.dot" />
                        <span class="font-mono text-xs text-neutral-950">{{ sessionShort(b.session_id) }}</span>
                      </span>
                      <span class="text-[10px] uppercase tracking-widest text-neutral-400">{{ STATUS_CONFIG[b.status]?.label }}</span>
                    </div>
                    <div class="h-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        class="h-full transition-all"
                        :class="usageBarColor(usagePercent(b))"
                        :style="{ width: usagePercent(b) + '%' }"
                      />
                    </div>
                    <div class="flex items-center justify-between font-mono text-[11px]">
                      <span class="text-neutral-500">{{ formatCents(b.spent_cents) }}</span>
                      <span class="text-neutral-900">{{ formatCents(b.allocated_cents) }}</span>
                    </div>
                  </button>
                </div>
              </aside>

              <section class="flex min-w-0 flex-1 flex-col gap-4">
                <div
                  v-if="!selectedWorkflow"
                  class="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white/40 text-neutral-400"
                >
                  <UIcon name="i-heroicons-rectangle-stack" class="size-8 text-neutral-300" />
                  <span class="text-sm">{{ t('vault.wallet.workflowsView.emptyDetail') }}</span>
                </div>
                <template v-else>
                  <div class="flex flex-col gap-5 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                    <div class="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.workflowsView.workflow') }}</span>
                        <div class="mt-1 flex flex-wrap items-center gap-2">
                          <span class="font-mono text-lg font-bold text-neutral-950">{{ sessionShort(selectedWorkflow.session_id) }}</span>
                          <span
                            class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1"
                            :class="STATUS_CONFIG[selectedWorkflow.status]?.chip"
                          >
                            <span class="size-1 rounded-full" :class="STATUS_CONFIG[selectedWorkflow.status]?.dot" />
                            {{ STATUS_CONFIG[selectedWorkflow.status]?.label }}
                          </span>
                        </div>
                        <p class="mt-1 text-[11px] text-neutral-400">{{ t('vault.wallet.workflowsView.createdAt', { date: formatDate(selectedWorkflow.created_at, true) }) }}</p>
                      </div>
                      <div class="flex gap-6">
                        <div>
                          <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.workflowsView.spent') }}</span>
                          <span class="mt-0.5 block font-mono text-sm font-bold text-neutral-950">{{ formatCents(selectedWorkflow.spent_cents) }}</span>
                        </div>
                        <div>
                          <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.workflowsView.remaining') }}</span>
                          <span class="mt-0.5 block font-mono text-sm font-bold text-neutral-950">{{ formatCents(Math.max(0, selectedWorkflow.allocated_cents - selectedWorkflow.spent_cents)) }}</span>
                        </div>
                        <div>
                          <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{{ t('vault.wallet.workflowsView.allocated') }}</span>
                          <span class="mt-0.5 block font-mono text-sm font-bold text-neutral-950">{{ formatCents(selectedWorkflow.allocated_cents) }}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div class="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        <span>{{ t('vault.wallet.workflowsView.consumption') }}</span><span>{{ usagePercent(selectedWorkflow) }}%</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          class="h-full transition-all"
                          :class="usageBarColor(usagePercent(selectedWorkflow))"
                          :style="{ width: usagePercent(selectedWorkflow) + '%' }"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col overflow-hidden rounded-2xl border border-neutral-200/60 bg-white">
                    <header class="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
                      <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.workflowsView.activity') }}</h3>
                      <span class="text-xs text-neutral-500">{{ t('vault.wallet.workflowsView.entries', { n: selectedWorkflowTxs.length }) }}</span>
                    </header>
                    <div v-if="selectedWorkflowTxs.length === 0" class="flex items-center justify-center py-10 text-sm text-neutral-400">
                      {{ t('vault.wallet.workflowsView.noActivity') }}
                    </div>
                    <ul v-else class="divide-y divide-neutral-100">
                      <li
                        v-for="tx in selectedWorkflowTxs"
                        :key="tx.id"
                        class="flex items-center gap-3 px-5 py-3"
                      >
                        <span
                          class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1"
                          :class="[TX_TYPE_CONFIG[tx.type]?.bg, TX_TYPE_CONFIG[tx.type]?.text, TX_TYPE_CONFIG[tx.type]?.ring]"
                        >{{ TX_TYPE_CONFIG[tx.type]?.icon }}</span>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm text-neutral-900">{{ tx.description || TX_TYPE_CONFIG[tx.type]?.label }}</p>
                          <p class="text-[11px] text-neutral-400">{{ formatDate(tx.created_at, true) }}</p>
                        </div>
                        <span
                          class="shrink-0 font-mono text-sm font-semibold"
                          :class="tx.amount_cents >= 0 ? 'text-green-600' : 'text-neutral-900'"
                        >{{ tx.amount_cents >= 0 ? '+' : '' }}{{ formatCents(Math.abs(tx.amount_cents)) }}</span>
                      </li>
                    </ul>
                  </div>
                </template>
              </section>
            </div>

            <!-- POLICIES -->
            <div v-else-if="section === 'policies'" class="flex flex-col gap-4 p-4 sm:p-6">
              <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <section class="flex flex-col gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                  <header class="flex items-start gap-3">
                    <span class="flex size-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <UIcon name="i-heroicons-banknotes" class="size-4" />
                    </span>
                    <div>
                      <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.policies.budgetCapsTitle') }}</h3>
                      <p class="text-xs text-neutral-500">{{ t('vault.wallet.policies.budgetCapsDesc') }}</p>
                    </div>
                  </header>
                  <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.workflowTotal') }}</label>
                      <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                        <span class="pl-3 text-sm text-neutral-400">$</span>
                        <input v-model.number="defaultWorkflowBudget" name="default-workflow-budget" type="number" min="0" step="0.5" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                      </div>
                      <span class="text-[10px] text-neutral-400">{{ t('vault.wallet.policies.workflowTotalHint') }}</span>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.perOpMax') }}</label>
                      <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                        <span class="pl-3 text-sm text-neutral-400">$</span>
                        <input v-model.number="defaultOperationMax" name="default-operation-max" type="number" min="0" step="0.1" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                      </div>
                      <span class="text-[10px] text-neutral-400">{{ t('vault.wallet.policies.perOpMaxHint') }}</span>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.llmCap') }}</label>
                      <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                        <span class="pl-3 text-sm text-neutral-400">$</span>
                        <input v-model.number="defaultLlmCap" name="default-llm-cap" type="number" min="0" step="0.05" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                      </div>
                      <span class="text-[10px] text-neutral-400">{{ t('vault.wallet.policies.llmCapHint') }}</span>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.approvalThreshold') }}</label>
                      <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                        <span class="pl-3 text-sm text-neutral-400">$</span>
                        <input v-model.number="approvalThreshold" name="approval-threshold" type="number" min="0" step="0.25" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                      </div>
                      <span class="text-[10px] text-neutral-400">{{ t('vault.wallet.policies.approvalThresholdHint') }}</span>
                    </div>
                  </div>
                </section>

                <section class="flex flex-col gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                  <header class="flex items-start gap-3">
                    <span class="flex size-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <UIcon name="i-heroicons-bolt" class="size-4" />
                    </span>
                    <div>
                      <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.policies.automationTitle') }}</h3>
                      <p class="text-xs text-neutral-500">{{ t('vault.wallet.policies.automationDesc') }}</p>
                    </div>
                  </header>
                  <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.maxSteps') }}</label>
                      <input v-model.number="maxStepsPerSession" name="max-steps-per-session" type="number" min="1" step="1" class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950">
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.maxScreenshots') }}</label>
                      <input v-model.number="maxScreenshots" name="max-screenshots" type="number" min="0" step="1" class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950">
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.maxDuration') }}</label>
                      <input v-model.number="maxDurationMinutes" name="max-duration-minutes" type="number" min="1" step="1" class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950">
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.concurrent') }}</label>
                      <input v-model.number="maxConcurrent" name="max-concurrent" type="number" min="1" step="1" class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950">
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.dailyCap') }}</label>
                    <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                      <span class="pl-3 text-sm text-neutral-400">$</span>
                      <input v-model.number="dailyWorkspaceCap" name="daily-workspace-cap" type="number" min="0" step="5" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                    </div>
                    <span class="text-[10px] text-neutral-400">{{ t('vault.wallet.policies.dailyCapHint') }}</span>
                  </div>
                  <div class="flex items-center justify-between border-t border-neutral-100 pt-4">
                    <div>
                      <span class="text-sm font-medium text-neutral-900">{{ t('vault.wallet.policies.blockAfterHours') }}</span>
                      <span class="block text-[11px] text-neutral-400">{{ t('vault.wallet.policies.blockAfterHoursDesc') }}</span>
                    </div>
                    <USwitch v-model="blockAfterHours" size="sm" color="neutral" />
                  </div>
                </section>

                <section class="flex flex-col gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6">
                  <header class="flex items-start gap-3">
                    <span class="flex size-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <UIcon name="i-heroicons-bell-alert" class="size-4" />
                    </span>
                    <div>
                      <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.policies.alertsTitle') }}</h3>
                      <p class="text-xs text-neutral-500">{{ t('vault.wallet.policies.alertsDesc') }}</p>
                    </div>
                  </header>
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="text-sm font-medium text-neutral-900">{{ t('vault.wallet.policies.pauseOnExhaustion') }}</span>
                      <span class="block text-[11px] text-neutral-400">{{ t('vault.wallet.policies.pauseOnExhaustionDesc') }}</span>
                    </div>
                    <USwitch v-model="pauseOnExhaustion" size="sm" color="neutral" />
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="text-sm font-medium text-neutral-900">{{ t('vault.wallet.policies.lowBalance') }}</span>
                      <span class="block text-[11px] text-neutral-400">{{ t('vault.wallet.policies.lowBalanceDesc') }}</span>
                    </div>
                    <USwitch v-model="notifyLowBalance" size="sm" color="neutral" />
                  </div>
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="text-sm font-medium text-neutral-900">{{ t('vault.wallet.policies.overrun') }}</span>
                      <span class="block text-[11px] text-neutral-400">{{ t('vault.wallet.policies.overrunDesc') }}</span>
                    </div>
                    <USwitch v-model="notifyOverrun" size="sm" color="neutral" />
                  </div>
                  <div class="flex items-center justify-between border-t border-neutral-100 pt-4">
                    <div>
                      <span class="text-sm font-medium text-neutral-900">{{ t('vault.wallet.policies.approveExternal') }}</span>
                      <span class="block text-[11px] text-neutral-400">{{ t('vault.wallet.policies.approveExternalDesc') }}</span>
                    </div>
                    <USwitch v-model="requireApprovalExternal" size="sm" color="neutral" />
                  </div>
                </section>

                <section class="flex flex-col gap-4 rounded-2xl border border-neutral-200/60 bg-white p-5 sm:p-6 xl:col-span-3">
                  <header class="flex items-start gap-3">
                    <span class="flex size-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <UIcon name="i-heroicons-globe-alt" class="size-4" />
                    </span>
                    <div>
                      <h3 class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.policies.domainTitle') }}</h3>
                      <p class="text-xs text-neutral-500">{{ t('vault.wallet.policies.domainDesc') }}</p>
                    </div>
                  </header>
                  <div class="grid gap-5 md:grid-cols-2">
                    <div class="flex flex-col gap-2">
                      <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.policies.policyLabel') }}</label>
                      <div class="grid grid-cols-3 gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                        <button
                          v-for="opt in domainPolicyOptions"
                          :key="opt"
                          class="rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors"
                          :class="domainPolicy === opt ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'"
                          @click="domainPolicy = opt"
                        >{{ domainPolicyLabel(opt) }}</button>
                      </div>
                      <textarea
                        v-model="domainList"
                        name="domain-list"
                        :placeholder="domainPolicy === 'any' ? t('vault.wallet.policies.domainPlaceholderAny') : t('vault.wallet.policies.domainPlaceholderList')"
                        :disabled="domainPolicy === 'any'"
                        rows="5"
                        class="resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 disabled:bg-neutral-50 disabled:text-neutral-400"
                      />
                    </div>
                    <div class="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 text-[11px] leading-relaxed text-neutral-500">
                      <p class="mb-2 font-semibold text-neutral-700">{{ t('vault.wallet.policies.howApplyTitle') }}</p>
                      <ul class="space-y-1">
                        <li>• {{ t('vault.wallet.policies.howApply1') }}</li>
                        <li>• {{ t('vault.wallet.policies.howApply2') }}</li>
                        <li>• {{ t('vault.wallet.policies.howApply3') }}</li>
                        <li>• {{ t('vault.wallet.policies.howApply4') }}</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
    </TabPanel>

    <!-- Top-up modal -->
    <Teleport to="body">
      <div
        v-if="topUpModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
        @click.self="topUpModalOpen = false"
      >
        <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header class="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <h2 class="text-base font-semibold text-neutral-950">{{ t('vault.wallet.topUpModal.title') }}</h2>
            <button
              type="button"
              class="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
              @click="topUpModalOpen = false"
            >
              <UIcon name="i-heroicons-x-mark" class="size-4" />
            </button>
          </header>
          <div class="flex flex-col gap-5 p-6">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.topUpModal.amount') }}</label>
              <div class="flex items-center overflow-hidden rounded-xl border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                <span class="pl-4 font-mono text-2xl text-neutral-300">$</span>
                <input
                  v-model.number="topUpAmountInput"
                  name="top-up-amount"
                  type="number"
                  :min="minInput"
                  :max="maxInput"
                  step="0.01"
                  placeholder="0.00"
                  class="w-full bg-transparent px-2 py-3 text-2xl font-bold tabular-nums text-neutral-950 outline-none placeholder:text-neutral-300"
                >
                <span class="pr-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">USD</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="p in packs"
                  :key="p.cents"
                  type="button"
                  class="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                  @click="selectPreset(p.cents)"
                >{{ p.label }}</button>
              </div>
            </div>

            <p v-if="topUpError" class="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-red-700">
              {{ topUpError }}
            </p>

            <p class="text-[11px] text-neutral-500">
              {{ t('vault.wallet.topUpModal.minMaxNote', { min: formatAmount(minInput), max: formatAmount(maxInput) }) }}
            </p>
          </div>
          <footer class="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
            <button
              type="button"
              class="rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:text-neutral-950"
              :disabled="isToppingUp"
              @click="topUpModalOpen = false"
            >{{ t('vault.wallet.topUpModal.cancel') }}</button>
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              :disabled="!topUpAmountInput || isToppingUp"
              @click="submitTopUp"
            >
              <span
                v-if="isToppingUp"
                class="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
              {{ isToppingUp ? t('vault.wallet.topUpModal.redirecting') : t('vault.wallet.topUpModal.continueToStripe') }}
              <UIcon v-if="!isToppingUp" name="i-heroicons-arrow-right" class="size-4" />
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- Auto top-up modal -->
    <Teleport to="body">
      <div
        v-if="autoTopUpModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
        @click.self="autoTopUpModalOpen = false"
      >
        <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header class="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <h2 class="text-base font-semibold text-neutral-950">{{ t('vault.wallet.autoTopUpModal.title') }}</h2>
            <button
              type="button"
              class="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
              @click="autoTopUpModalOpen = false"
            >
              <UIcon name="i-heroicons-x-mark" class="size-4" />
            </button>
          </header>
          <div class="flex flex-col gap-5 p-6">
            <div class="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
              <div>
                <span class="text-sm font-semibold text-neutral-950">{{ t('vault.wallet.autoTopUpModal.enable') }}</span>
                <p class="text-[11px] text-neutral-500">{{ t('vault.wallet.autoTopUpModal.enableDesc') }}</p>
              </div>
              <USwitch v-model="autoTopUpEnabled" size="sm" color="neutral" />
            </div>
            <div
              class="grid grid-cols-2 gap-3 transition-opacity"
              :class="!autoTopUpEnabled && 'pointer-events-none opacity-40'"
            >
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.autoTopUpModal.triggerBelow') }}</label>
                <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                  <span class="pl-3 text-sm text-neutral-400">$</span>
                  <input v-model.number="autoTopUpThreshold" name="auto-top-up-threshold" type="number" min="0" step="1" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-neutral-500">{{ t('vault.wallet.autoTopUpModal.addAmount') }}</label>
                <div class="flex items-center overflow-hidden rounded-lg border border-neutral-200 bg-white focus-within:border-neutral-950 focus-within:ring-1 focus-within:ring-neutral-950">
                  <span class="pl-3 text-sm text-neutral-400">$</span>
                  <input v-model.number="autoTopUpAmount" name="auto-top-up-amount" type="number" min="5" step="1" class="w-full bg-transparent px-2 py-2 text-sm outline-none">
                </div>
              </div>
            </div>
          </div>
          <footer class="flex items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
            <button
              type="button"
              class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              @click="autoTopUpModalOpen = false"
            >{{ t('vault.wallet.autoTopUpModal.done') }}</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
  </FeatureGate>
</template>
