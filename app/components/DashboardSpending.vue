<script setup lang="ts">
import type { Transaction, SessionBudget } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  transactions: Transaction[]
  budgets: SessionBudget[]
  currency: SupportedCurrency
  hasWallet: boolean
}>()

const { t } = useI18n()
const { formatCents, topUp } = useWallet()

const showTopUpModal = ref(false)
const customAmount = ref('')
const topUpLoading = ref(false)

const activeBudgets = computed(() =>
  props.budgets.filter(b => b.status === 'active'),
)

const showSection = computed(() => props.hasWallet)

const TX_TYPE_CONFIG: Record<Transaction['type'], { icon: string }> = {
  top_up: { icon: '↓' },
  allocation: { icon: '→' },
  deduction: { icon: '↑' },
  refund: { icon: '↩' },
  adjustment: { icon: '⟳' },
}

const STATUS_CONFIG: Record<SessionBudget['status'], { label: string; dotClass: string }> = {
  active: { label: 'Active', dotClass: 'bg-green-500' },
  paused: { label: 'Paused', dotClass: 'bg-amber-500' },
  exhausted: { label: 'Exhausted', dotClass: 'bg-red-500' },
  released: { label: 'Released', dotClass: 'bg-neutral-300' },
}

function usagePercent(b: SessionBudget) {
  if (b.allocated_cents === 0) return 0
  return Math.min(100, Math.round((b.spent_cents / b.allocated_cents) * 100))
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const amountError = computed(() => {
  const val = parseFloat(customAmount.value)
  if (!customAmount.value || isNaN(val) || val <= 0) return true
  if (val > 10000) return true
  return false
})

function openTopUp() {
  customAmount.value = ''
  showTopUpModal.value = true
}

async function handleTopUp() {
  const dollars = parseFloat(customAmount.value)
  if (isNaN(dollars) || dollars <= 0 || dollars > 10000) return
  topUpLoading.value = true
  await topUp(Math.round(dollars * 100), props.currency as SupportedCurrency)
  topUpLoading.value = false
  showTopUpModal.value = false
}
</script>

<template>
  <div v-if="showSection" class="rounded-lg ghost-panel bg-white p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-neutral-950">{{ t('dashboard.spendingOverview') }}</h2>
      <button
        class="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        @click="openTopUp"
      >
        {{ t('dashboard.topUp') }}
      </button>
    </div>

    <div v-if="transactions.length === 0 && activeBudgets.length === 0" class="py-6 text-center text-sm text-neutral-400">
      {{ t('dashboard.noTransactions') }}
    </div>

    <template v-else>
      <div v-if="transactions.length > 0" class="flex flex-col border-b border-neutral-100 pb-4">
        <div
          v-for="tx in transactions"
          :key="tx.id"
          class="flex items-center gap-3 py-2.5 first:pt-0"
        >
          <div
            class="flex size-7 items-center justify-center rounded-full text-xs font-bold"
            :class="[
              tx.type === 'top_up' || tx.type === 'refund'
                ? 'bg-green-50 text-green-600'
                : tx.type === 'allocation'
                  ? 'bg-amber-50 text-amber-600'
                  : tx.type === 'deduction'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-neutral-100 text-neutral-500',
            ]"
          >
            {{ TX_TYPE_CONFIG[tx.type].icon }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-neutral-950">
              {{ tx.description || tx.type.replace('_', ' ') }}
            </p>
            <p class="text-xs text-neutral-400">{{ formatDate(tx.created_at) }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p
              class="text-sm font-semibold"
              :class="tx.amount_cents >= 0 ? 'text-green-600' : 'text-neutral-950'"
            >
              {{ tx.amount_cents >= 0 ? '+' : '-' }}{{ formatCents(Math.abs(tx.amount_cents), currency) }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="activeBudgets.length > 0" class="pt-4">
        <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{{ t('dashboard.activeBudgets') }}</h3>
        <div class="flex flex-col gap-3">
          <div
            v-for="budget in activeBudgets"
            :key="budget.id"
            class="flex items-center gap-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-neutral-950">
                  {{ formatCents(budget.allocated_cents, currency) }}
                </span>
                <span class="text-xs text-neutral-400">allocated</span>
              </div>
              <div class="mt-1 flex items-center gap-1.5">
                <span
                  class="inline-block size-1.5 rounded-full"
                  :class="STATUS_CONFIG[budget.status].dotClass"
                />
                <span class="text-xs text-neutral-500">{{ STATUS_CONFIG[budget.status].label }}</span>
              </div>
              <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  class="h-full rounded-full transition-all"
                  :class="
                    usagePercent(budget) >= 90 ? 'bg-red-500'
                    : usagePercent(budget) >= 70 ? 'bg-amber-500'
                    : 'bg-neutral-950'
                  "
                  :style="{ width: `${usagePercent(budget)}%` }"
                />
              </div>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-sm font-medium text-neutral-950">
                {{ formatCents(budget.allocated_cents - budget.spent_cents, currency) }}
              </p>
              <p class="text-xs text-neutral-400">remaining</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="showTopUpModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showTopUpModal = false"
      >
        <div class="ghost-panel w-full max-w-sm rounded-2xl bg-white p-6">
          <h3 class="mb-4 text-lg font-semibold tracking-tight text-neutral-950">
            {{ t('dashboard.topUp') }}
          </h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-neutral-700">
                {{ t('dashboard.topUpAmountLabel') }}
              </label>
              <div class="relative">
                <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">$</span>
                <input
                  v-model="customAmount"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  class="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-7 pr-3 text-sm text-neutral-950 transition-colors focus:border-neutral-950 focus:outline-none"
                  :placeholder="t('dashboard.topUpPlaceholder')"
                  @keydown.enter="handleTopUp"
                />
              </div>
            </div>
            <button
              class="w-full rounded-md bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              :disabled="amountError || topUpLoading"
              @click="handleTopUp"
            >
              {{ topUpLoading ? t('common.loading') : t('dashboard.topUpConfirm') }}
            </button>
            <button
              class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              @click="showTopUpModal = false"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
