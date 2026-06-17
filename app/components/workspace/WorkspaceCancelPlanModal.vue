<script setup lang="ts">
import {
  browserAgentCapFromPlan,
  maxFileUploadBytesFromPlan,
  maxMembersFromPlan,
  tokenBudgetWeeklyFromPlan,
  workflowRunsMonthlyCapFromPlan,
} from '~/utils/planLimits'

// Confirmation dialog for the two destructive plan changes that take effect at
// period end: cancelling to Free, or a paid→paid downgrade (Max→Pro). It is a
// pure presentation + confirm surface — the parent owns the async action,
// passing `busy`/`errorMessage` and listening for `confirm`.
const props = defineProps<{
  /** 'cancel' → reverts to Free; 'downgrade' → switches to a lower paid plan. */
  mode: 'cancel' | 'downgrade'
  /** Current plan key, lowercase (e.g. 'max'). */
  currentPlan: string
  /** Target plan key, lowercase ('free' for cancel, 'pro' for downgrade). */
  targetPlan: string
  /** ISO timestamp of the current period end, or null if unknown. */
  periodEnd: string | null
  busy?: boolean
  errorMessage?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()

const { t, locale } = useI18n()

function capitalize(plan: string): string {
  const p = (plan || 'free').toLowerCase()
  return p.charAt(0).toUpperCase() + p.slice(1)
}

const currentLabel = computed(() => capitalize(props.currentPlan))
const targetLabel = computed(() => capitalize(props.targetPlan))

const periodEndLabel = computed(() => {
  if (!props.periodEnd) return null
  const d = new Date(props.periodEnd)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(d)
  }
  catch {
    return d.toISOString().slice(0, 10)
  }
})

const title = computed(() =>
  props.mode === 'cancel'
    ? t('billing.cancelTitle', { plan: currentLabel.value })
    : t('billing.downgradeTitle', { plan: targetLabel.value }),
)

const lead = computed(() => {
  if (!periodEndLabel.value) {
    return props.mode === 'cancel'
      ? t('billing.cancelLeadNoDate', { plan: currentLabel.value })
      : t('billing.downgradeLeadNoDate', { current: currentLabel.value, target: targetLabel.value })
  }
  return props.mode === 'cancel'
    ? t('billing.cancelLead', { plan: currentLabel.value, date: periodEndLabel.value })
    : t('billing.downgradeLead', { current: currentLabel.value, target: targetLabel.value, date: periodEndLabel.value })
})

// Compact token budgets: 5_000_000 → "5M", 100_000 → "100K", 0 → unlimited.
function compact(n: number): string {
  if (n <= 0) return t('billing.unlimited')
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return n.toLocaleString()
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

function cap(n: number): string {
  return n <= 0 ? t('billing.unlimited') : n.toLocaleString()
}

// Only the limits that actually change between the two plans, so the user sees
// a focused "here's what you give up" list rather than the full plan table.
const changes = computed(() => {
  const c = props.currentPlan
  const tg = props.targetPlan
  const rows = [
    { label: t('billing.rowAgents'), from: cap(browserAgentCapFromPlan(c)), to: cap(browserAgentCapFromPlan(tg)) },
    { label: t('billing.rowTokens'), from: compact(tokenBudgetWeeklyFromPlan(c)), to: compact(tokenBudgetWeeklyFromPlan(tg)) },
    { label: t('billing.rowRuns'), from: cap(workflowRunsMonthlyCapFromPlan(c)), to: cap(workflowRunsMonthlyCapFromPlan(tg)) },
    { label: t('billing.rowMembers'), from: cap(maxMembersFromPlan(c)), to: cap(maxMembersFromPlan(tg)) },
    { label: t('billing.rowFileSize'), from: formatBytes(maxFileUploadBytesFromPlan(c)), to: formatBytes(maxFileUploadBytesFromPlan(tg)) },
  ]
  return rows.filter(r => r.from !== r.to)
})

function close() {
  if (props.busy) return
  open.value = false
}

function onConfirm() {
  if (props.busy) return
  emit('confirm')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (import.meta.client) {
    if (isOpen) document.addEventListener('keydown', handleKeydown)
    else document.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  if (import.meta.client) document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="close"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="open"
            class="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
              <h3 class="text-sm font-semibold text-neutral-950">{{ title }}</h3>
              <button
                type="button"
                class="-mr-1 -mt-0.5 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
                :aria-label="t('common.close')"
                :disabled="busy"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 space-y-4 overflow-y-auto px-5 pb-1">
              <p class="text-xs leading-relaxed text-neutral-600">{{ lead }}</p>

              <!-- Reassurance: nothing changes today -->
              <div class="flex items-start gap-2.5 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200/70">
                <svg class="mt-0.5 size-4 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                <p class="text-[11px] leading-relaxed text-neutral-600">
                  {{ t('billing.keepUntilPeriodEnd', { plan: currentLabel }) }}
                </p>
              </div>

              <!-- What changes at period end -->
              <div v-if="changes.length">
                <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  <template v-if="periodEndLabel">{{ t('billing.whatChangesOn', { date: periodEndLabel }) }}</template>
                  <template v-else>{{ t('billing.whatChanges') }}</template>
                </p>
                <ul class="divide-y divide-neutral-100 overflow-hidden rounded-lg ring-1 ring-neutral-200">
                  <li
                    v-for="row in changes"
                    :key="row.label"
                    class="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span class="min-w-0 truncate text-neutral-600">{{ row.label }}</span>
                    <span class="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
                      <span class="text-neutral-400 line-through">{{ row.from }}</span>
                      <svg class="size-3 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      <span class="font-semibold text-neutral-900">{{ row.to }}</span>
                    </span>
                  </li>
                </ul>
              </div>

              <p v-if="errorMessage" class="text-[11px] text-red-600">{{ errorMessage }}</p>
            </div>

            <!-- Footer -->
            <div class="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                :disabled="busy"
                @click="close"
              >
                {{ t('billing.keepCurrent') }}
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                :class="mode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-950 hover:bg-neutral-800'"
                :disabled="busy"
                @click="onConfirm"
              >
                <template v-if="busy">{{ t('billing.scheduling') }}</template>
                <template v-else-if="mode === 'cancel'">{{ t('billing.confirmCancel') }}</template>
                <template v-else>{{ t('billing.confirmDowngrade') }}</template>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
