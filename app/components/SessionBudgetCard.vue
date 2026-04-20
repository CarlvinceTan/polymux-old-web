<script setup lang="ts">
import type { SessionBudget } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  budgets: SessionBudget[]
  currency: SupportedCurrency
}>()

const { formatCents } = useWallet()

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
</script>

<template>
  <div class="flex flex-col">
    <div v-if="budgets.length === 0" class="py-8 text-center text-sm text-neutral-400">
      No budgets allocated yet
    </div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="budget in budgets"
        :key="budget.id"
        class="ghost-panel rounded-xl p-4"
      >
        <div class="flex items-center justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-neutral-950">
                {{ formatCents(budget.allocated_cents, currency) }}
              </span>
              <span class="text-meta text-neutral-400">allocated</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5">
              <span
                class="inline-block size-1.5 rounded-full"
                :class="STATUS_CONFIG[budget.status].dotClass"
                aria-hidden="true"
              />
              <span class="text-meta text-neutral-500">{{ STATUS_CONFIG[budget.status].label }}</span>
            </div>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-sm font-medium text-neutral-950">
              {{ formatCents(budget.allocated_cents - budget.spent_cents, currency) }}
            </p>
            <p class="text-meta text-neutral-400">remaining</p>
          </div>
        </div>

        <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
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
    </div>
  </div>
</template>