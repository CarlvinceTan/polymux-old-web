<script setup lang="ts">
import type { SupportedCurrency } from '~/composables/useCurrency'

const { realSessions: sessions, fetchSessions } = useWorkflowList()
const {
  wallet,
  budgets,
  fetchWallet,
  fetchTransactions,
  fetchBudgets,
} = useWallet()

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()

const currency = computed(() => (wallet.value?.currency ?? 'usd') as SupportedCurrency)
const hasWallet = computed(() => !!wallet.value)

async function loadAll() {
  await Promise.all([
    fetchSessions(),
    fetchWallet(),
    fetchTransactions(),
    fetchBudgets(),
  ])
}

onMounted(loadAll)
useOnReconnect(loadAll)
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
            <!-- Welcome hero -->
            <DashboardWelcome />

            <!-- Hero grid: Wallet card + Quick actions -->
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div class="lg:col-span-2">
                <DashboardWalletCard
                  :currency="currency"
                  :has-wallet="hasWallet"
                />
              </div>
              <div class="lg:col-span-3">
                <DashboardQuickActions />
              </div>
            </div>

            <!-- Two-column: Recent sessions (wide) + Active budgets (narrow) -->
            <div class="grid gap-4 lg:grid-cols-3">
              <div class="lg:col-span-2">
                <DashboardRecentSessions :sessions="sessions" />
              </div>
              <div class="lg:col-span-1">
                <DashboardSpending
                  :budgets="budgets"
                  :currency="currency"
                  :has-wallet="hasWallet"
                />
              </div>
            </div>

            <!-- Templates -->
            <DashboardTemplates />

            <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>
