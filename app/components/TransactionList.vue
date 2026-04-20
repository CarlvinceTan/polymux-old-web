<script setup lang="ts">
import type { Transaction } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  transactions: Transaction[]
  currency: SupportedCurrency
}>()

const { formatCents } = useWallet()

const TX_TYPE_CONFIG: Record<Transaction['type'], { label: string; icon: string; color: string }> = {
  top_up: { label: 'Top Up', icon: '↓', color: 'text-green-600' },
  allocation: { label: 'Allocation', icon: '→', color: 'text-amber-600' },
  deduction: { label: 'Deduction', icon: '↑', color: 'text-red-600' },
  refund: { label: 'Refund', icon: '↩', color: 'text-blue-600' },
  adjustment: { label: 'Adjustment', icon: '⟳', color: 'text-neutral-500' },
}

const activeType = ref<Transaction['type'] | 'all'>('all')

const filteredTransactions = computed(() => {
  if (activeType.value === 'all') return props.transactions
  return props.transactions.filter(t => t.type === activeType.value)
})

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const typeOptions: { value: Transaction['type'] | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'top_up', label: 'Top Ups' },
  { value: 'allocation', label: 'Allocations' },
  { value: 'deduction', label: 'Deductions' },
  { value: 'refund', label: 'Refunds' },
]
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-3 flex items-center gap-2 overflow-x-auto">
      <button
        v-for="opt in typeOptions"
        :key="opt.value"
        class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="activeType === opt.value ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'"
        @click="activeType = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="filteredTransactions.length === 0" class="py-8 text-center text-sm text-neutral-400">
      No transactions yet
    </div>

    <div v-else class="flex flex-col">
      <div
        v-for="tx in filteredTransactions"
        :key="tx.id"
        class="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0"
      >
        <div
          class="flex size-8 items-center justify-center rounded-full text-sm font-bold"
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
            {{ tx.description || TX_TYPE_CONFIG[tx.type].label }}
          </p>
          <p class="text-meta text-neutral-400">
            {{ formatDate(tx.created_at) }}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p
            class="text-sm font-semibold"
            :class="tx.amount_cents >= 0 ? 'text-green-600' : 'text-neutral-950'"
          >
            {{ tx.amount_cents >= 0 ? '+' : '' }}{{ formatCents(Math.abs(tx.amount_cents), currency) }}
          </p>
          <p class="text-meta text-neutral-400">
            {{ formatCents(tx.balance_after_cents, currency) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>