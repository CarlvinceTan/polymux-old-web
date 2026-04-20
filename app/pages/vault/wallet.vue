<script setup lang="ts">
import { useWallet } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const user = useSupabaseUser()

const headerTabs = {
  Passwords: '/vault/passwords',
  Wallet: '/vault/wallet',
} as const satisfies Record<string, string>

const {
  wallet,
  transactions,
  budgets,
  balanceDisplay,
  loading,
  fetchWallet,
  fetchTransactions,
  fetchBudgets,
} = useWallet()

const route = useRoute()

const topUpSuccess = computed(() => route.query.top_up === 'success')
const topUpCancelled = computed(() => route.query.top_up === 'cancelled')

onMounted(() => {
  fetchWallet()
  fetchTransactions()
  fetchBudgets()
})

const walletCurrency = computed<SupportedCurrency>(() =>
  (wallet.value?.currency ?? 'usd') as SupportedCurrency,
)

const totalAllocated = computed(() =>
  budgets.value.reduce((sum, b) => b.status === 'active' ? sum + b.allocated_cents : sum, 0),
)

const totalSpent = computed(() =>
  budgets.value.reduce((sum, b) => sum + b.spent_cents, 0),
)

watch(topUpSuccess, (val) => {
  if (val) {
    fetchWallet()
    fetchTransactions()
  }
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <GuestPlaceholder v-if="!user" />
        <div v-else class="p-4 sm:p-5">
          <div
            v-if="topUpSuccess"
            class="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700"
          >
            Top-up successful! Your balance has been updated.
          </div>
          <div
            v-if="topUpCancelled"
            class="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600"
          >
            Top-up was cancelled.
          </div>

          <div v-if="loading && !wallet" class="py-12 text-center text-sm text-neutral-400">
            Loading wallet...
          </div>

          <template v-else>
            <div class="flex flex-col gap-6">
              <WalletBalance />

              <template v-if="wallet && budgets.length > 0">
                <div class="flex flex-col gap-3">
                  <h2 class="text-body-md font-semibold tracking-tight text-neutral-950">
                    Budget Summary
                  </h2>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div class="ghost-panel rounded-lg p-3">
                      <p class="text-meta text-neutral-500">
                        Available
                      </p>
                      <p class="text-lg font-bold text-neutral-950">
                        {{ balanceDisplay }}
                      </p>
                    </div>
                    <div class="ghost-panel rounded-lg p-3">
                      <p class="text-meta text-neutral-500">
                        Allocated
                      </p>
                      <p class="text-lg font-bold text-amber-600">
                        {{ useWallet().formatCents(totalAllocated, walletCurrency) }}
                      </p>
                    </div>
                    <div class="ghost-panel rounded-lg p-3">
                      <p class="text-meta text-neutral-500">
                        Spent
                      </p>
                      <p class="text-lg font-bold text-neutral-950">
                        {{ useWallet().formatCents(totalSpent, walletCurrency) }}
                      </p>
                    </div>
                  </div>
                </div>
                <SessionBudgetCard
                  :budgets="budgets"
                  :currency="walletCurrency"
                />
              </template>

              <TransactionList
                v-if="transactions.length > 0"
                :transactions="transactions"
                :currency="walletCurrency"
              />
            </div>
          </template>
        </div>
      </TabPanel>
    </div>
  </div>
</template>