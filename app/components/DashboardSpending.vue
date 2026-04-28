<script setup lang="ts">
import type { SessionBudget } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const props = defineProps<{
  budgets: SessionBudget[]
  currency: SupportedCurrency
  hasWallet: boolean
}>()

const { t } = useI18n()
const { formatCents } = useWallet()

const activeBudgets = computed(() =>
  props.budgets.filter(b => b.status === 'active').slice(0, 5),
)

const STATUS_CONFIG: Record<SessionBudget['status'], { labelKey: string; dotClass: string }> = {
  active: { labelKey: 'dashboard.budgetStatusActive', dotClass: 'bg-green-500' },
  paused: { labelKey: 'dashboard.budgetStatusPaused', dotClass: 'bg-amber-500' },
  exhausted: { labelKey: 'dashboard.budgetStatusExhausted', dotClass: 'bg-red-500' },
  released: { labelKey: 'dashboard.budgetStatusReleased', dotClass: 'bg-neutral-300' },
}

function usagePercent(b: SessionBudget) {
  if (b.allocated_cents === 0) return 0
  return Math.min(100, Math.round((b.spent_cents / b.allocated_cents) * 100))
}
</script>

<template>
  <section
    v-if="hasWallet"
    class="flex h-full flex-col rounded-2xl border border-neutral-200/70 bg-white p-5 sm:p-6"
  >
    <header class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-neutral-950">
          {{ t('dashboard.activeBudgets') }}
        </h2>
        <p class="mt-0.5 text-xs text-neutral-500">
          {{ t('dashboard.activeBudgetsDesc') }}
        </p>
      </div>
      <span
        v-if="activeBudgets.length"
        class="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-700 ring-1 ring-green-200/60"
      >
        <span class="size-1.5 rounded-full bg-green-500" />
        {{ activeBudgets.length }} {{ t('dashboard.budgetsRunning') }}
      </span>
    </header>

    <div
      v-if="activeBudgets.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 py-10 text-center"
    >
      <UIcon name="i-heroicons-chart-pie-20-solid" class="size-7 text-neutral-400" />
      <p class="text-xs font-medium text-neutral-950">
        {{ t('dashboard.noBudgets') }}
      </p>
      <p class="max-w-[220px] px-2 text-[11px] text-neutral-400">
        {{ t('dashboard.noBudgetsHint') }}
      </p>
    </div>

    <ul v-else class="flex flex-col gap-4">
      <li
        v-for="budget in activeBudgets"
        :key="budget.id"
        class="flex flex-col gap-2"
      >
        <div class="flex items-baseline justify-between gap-2">
          <div class="flex min-w-0 items-baseline gap-1.5">
            <span class="font-mono text-sm font-semibold text-neutral-950">
              {{ formatCents(budget.spent_cents, currency) }}
            </span>
            <span class="text-[11px] text-neutral-400">
              / {{ formatCents(budget.allocated_cents, currency) }}
            </span>
          </div>
          <span class="font-mono text-[11px] font-semibold text-neutral-500">
            {{ usagePercent(budget) }}%
          </span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            class="h-full rounded-full transition-[width] duration-500 ease-out"
            :class="
              usagePercent(budget) >= 90
                ? 'bg-red-500'
                : usagePercent(budget) >= 70
                  ? 'bg-amber-500'
                  : 'bg-neutral-950'
            "
            :style="{ width: `${usagePercent(budget)}%` }"
          />
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="flex items-center gap-1.5 text-neutral-500">
            <span
              class="inline-block size-1.5 rounded-full"
              :class="STATUS_CONFIG[budget.status].dotClass"
            />
            {{ t(STATUS_CONFIG[budget.status].labelKey) }}
          </span>
          <span class="text-neutral-400">
            {{ formatCents(budget.allocated_cents - budget.spent_cents, currency) }}
            {{ t('dashboard.remaining') }}
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>
