<script setup lang="ts">
import type { SupportedCurrency } from '~/composables/useCurrency'

const { t } = useI18n()
const { currentWorkspace } = useWorkspaces()
const { sessions, fetchSessions } = useChatSessions()
const { wallet, transactions, budgets, balanceDisplay, formatCents, fetchWallet, fetchTransactions, fetchBudgets } = useWallet()

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()

const planLimits: Record<string, number> = { free: 2, pro: 8, max: 20, enterprise: 50 }

const plan = computed(() => currentWorkspace.value?.plan ?? 'free')
const agentCap = computed(() => planLimits[plan.value] ?? 2)

const oneWeekAgo = computed(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
const sessionsThisWeek = computed(() =>
  sessions.value.filter(s => s.created_at >= oneWeekAgo.value).length,
)

const activeBudgets = computed(() =>
  budgets.value.filter(b => b.status === 'active'),
)

onMounted(async () => {
  await Promise.all([
    fetchSessions(),
    fetchWallet(),
    fetchTransactions(),
    fetchBudgets(),
  ])
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" :separator-before-path="dashboardNavSeparatorBeforePath" raw-tab-labels />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div class="space-y-6 p-4 sm:p-5">
          <DashboardWelcome />

          <div class="grid gap-4 sm:grid-cols-2" :class="wallet ? 'lg:grid-cols-4' : 'lg:grid-cols-3'">
            <DashboardStatCard
              v-if="wallet"
              :label="t('dashboard.walletBalance')"
              :value="balanceDisplay"
            />
            <DashboardStatCard
              :label="t('dashboard.totalChats')"
              :value="String(sessions.length)"
              :trend="t('dashboard.sessionsThisWeek', { count: sessionsThisWeek })"
            />
            <DashboardStatCard
              :label="t('dashboard.browserAgents')"
              :value="t('dashboard.agentsAvailable', { plan: plan.charAt(0).toUpperCase() + plan.slice(1), cap: agentCap })"
            />
            <DashboardStatCard
              :label="t('dashboard.activeBudgets')"
              :value="String(activeBudgets.length)"
              :trend="activeBudgets.length ? t('dashboard.budgetsRunning') : undefined"
            />
          </div>

          <DashboardRecentSessions :sessions="sessions" />

          <DashboardSpending
            :transactions="transactions"
            :budgets="budgets"
            :currency="(wallet?.currency ?? 'usd') as SupportedCurrency"
            :has-wallet="!!wallet"
          />
        </div>
      </TabPanel>
    </div>
  </div>
</template>