<script setup lang="ts">
import { useI18n } from '#imports'

definePageMeta({ layout: 'landing' })

useHead({
  title: 'Pricing',
})

const { t } = useI18n()

const router = useRouter()

function goBack() {
  if (!import.meta.client) return
  if (window.history.length > 1) {
    router.back()
    return
  }
  navigateTo('/')
}

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

interface PlanFeatureRow {
  name: string
  free: string | boolean
  pro: string | boolean
  max: string | boolean
  enterprise: string | boolean
}

// Storage rows are sourced from server/utils/planLimits.ts. When you bump the
// caps there, mirror the change here — there's no shared module because the
// landing page intentionally avoids importing server utils.
const planFeatures = computed<PlanFeatureRow[]>(() => [
  { name: 'AI Agents per workspace', free: '3', pro: '10', max: '50', enterprise: 'Custom' },
  { name: 'Monthly Tasks per workspace', free: '100', pro: '1,000', max: '10,000', enterprise: 'Unlimited' },
  { name: 'Browser Sessions per workspace', free: '2', pro: '8', max: '20', enterprise: 'Custom' },
  { name: t('pricing.storage.total'), free: '5 GB', pro: '100 GB', max: '1 TB', enterprise: '10 TB' },
  { name: t('pricing.storage.file'), free: '100 MB', pro: '5 GB', max: '20 GB', enterprise: '100 GB' },
  { name: t('pricing.storage.pullFolder'), free: '500 MB', pro: '10 GB', max: '100 GB', enterprise: '1 TB' },
  { name: t('pricing.storage.artifacts'), free: '2 GB', pro: '20 GB', max: '100 GB', enterprise: '1 TB' },
  { name: 'Workspace Members', free: '3', pro: '10', max: '50', enterprise: 'Custom' },
  { name: 'Custom Workflows', free: false, pro: true, max: true, enterprise: true },
  { name: 'Priority Support', free: false, pro: false, max: true, enterprise: true },
])

type BillingPeriod = 'annual' | 'monthly'

const billingPeriod = ref<BillingPeriod>('annual')

const { currency, prices, detect } = useCurrency()

onMounted(() => { detect() })

const planMeta: { key: PlanKey; name: string; cta: string; highlighted: boolean }[] = [
  { key: 'free', name: 'Free', cta: 'Get Started', highlighted: false },
  { key: 'pro', name: 'Pro', cta: 'Select Plan', highlighted: true },
  { key: 'max', name: 'Max', cta: 'Select Plan', highlighted: false },
  { key: 'enterprise', name: 'Enterprise', cta: 'Contact Sales', highlighted: false },
]

function planPriceDisplay(key: PlanKey): {
  price: string
  period: string
  compareAtPrice?: string
} {
  if (!prices.value) return { price: '—', period: '' }
  const p = prices.value[key]
  if (key === 'free' || key === 'enterprise') {
    return { price: p.monthly, period: key === 'free' ? '/mo' : '' }
  }
  if (billingPeriod.value === 'monthly') {
    return { price: p.monthly, period: '/mo' }
  }
  return {
    price: p.annualPerMonth,
    period: '/mo',
    compareAtPrice: `${p.monthly}/mo`,
  }
}

function planCellIncluded(row: PlanFeatureRow, key: PlanKey): boolean {
  const v = row[key]
  return typeof v === 'boolean' ? v : true
}

function planCellDetail(row: PlanFeatureRow, key: PlanKey): string | null {
  const v = row[key]
  return typeof v === 'string' ? v : null
}

function planItemsForKey(key: PlanKey) {
  return planFeatures.value.map((row) => {
    const included = planCellIncluded(row, key)
    const detail = planCellDetail(row, key)
    const label = detail ? `${row.name} (${detail})` : row.name
    return { label, included }
  })
}

const route = useRoute()

const planOrder: PlanKey[] = ['free', 'pro', 'max', 'enterprise']

const { workspaces, currentWorkspace, currentWorkspaceId, switchWorkspace, fetchWorkspaces } = useWorkspaces()

onMounted(async () => {
  if (workspaces.value.length === 0) await fetchWorkspaces()
  const qsWorkspace = (route.query.workspaceId as string | undefined)?.trim()
  if (qsWorkspace && workspaces.value.some(w => w.id === qsWorkspace)) {
    switchWorkspace(qsWorkspace)
  }
})

useOnReconnect(() => {
  if (workspaces.value.length === 0) return fetchWorkspaces()
})

const targetWorkspacePlan = computed<PlanKey>(() => {
  const raw = (currentWorkspace.value?.plan as string | undefined)?.toLowerCase().trim()
  if (raw && planOrder.includes(raw as PlanKey)) return raw as PlanKey
  return 'free'
})

const currentUserPlan = computed<PlanKey | null>(() => {
  const raw = (route.query.current as string | undefined)?.toLowerCase().trim()
  if (raw && planOrder.includes(raw as PlanKey)) return raw as PlanKey
  return currentWorkspace.value ? targetWorkspacePlan.value : null
})

function nextTierUp(key: PlanKey): PlanKey {
  const idx = planOrder.indexOf(key)
  if (idx < 0 || idx >= planOrder.length - 1) return key
  return planOrder[idx + 1] ?? key
}

const selectedPlanKey = ref<PlanKey>(
  currentUserPlan.value ? nextTierUp(currentUserPlan.value) : 'free',
)

function onWorkspaceChange(id: string) {
  switchWorkspace(id)
  const plan = targetWorkspacePlan.value
  selectedPlanKey.value = nextTierUp(plan)
}

watch(targetWorkspacePlan, (plan) => {
  selectedPlanKey.value = nextTierUp(plan)
})

function onTierSelect(key: PlanKey) {
  if (key === 'enterprise') {
    return navigateTo({ path: '/contact', query: { from: 'enterprise-plan' } })
  }
  if (currentUserPlan.value === key) return
  selectedPlanKey.value = key
  nextTick(() => {
    const el = document.getElementById(`plan-panel-${key}`)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  })
}

const purchaseLoading = ref(false)
const purchaseError = ref('')

async function onPurchaseNow() {
  const key = selectedPlanKey.value
  if (key === 'enterprise') {
    return navigateTo({ path: '/contact', query: { from: 'enterprise-plan' } })
  }
  if (key === 'free') return

  const workspaceId = currentWorkspaceId.value
  if (!workspaceId) {
    purchaseError.value = 'Select a workspace to upgrade first.'
    return
  }

  purchaseLoading.value = true
  purchaseError.value = ''

  try {
    const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
      method: 'POST',
      body: {
        planKey: key,
        billingPeriod: billingPeriod.value,
        currency: currency.value,
        workspaceId,
      },
    })
    window.location.href = url
  }
  catch (err: unknown) {
    purchaseError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    purchaseLoading.value = false
  }
}

</script>

<template>
  <div
    class="w-full bg-white pt-6 sm:pt-8 lg:pt-10"
    :class="
      selectedPlanKey !== 'free'
        ? 'pb-8 sm:pb-10 lg:pb-12'
        : 'pb-20 sm:pb-24 lg:pb-28'
    "
  >
    <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <header class="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            type="button"
            class="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            :aria-label="t('common.back')"
            @click="goBack"
          >
            <svg
              class="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 class="min-w-0 truncate text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            <template v-if="currentWorkspace">
              Upgrade <span class="text-neutral-700">{{ currentWorkspace.name }}</span>'s plan
            </template>
            <template v-else>
              Pricing
            </template>
          </h1>
        </div>
        <div v-if="workspaces.length > 1 && currentWorkspace" class="sm:ml-auto sm:shrink-0">
          <label for="pricing-workspace-select" class="sr-only">Switch workspace</label>
          <select
            id="pricing-workspace-select"
            :value="currentWorkspace.id"
            class="block w-full rounded-md border border-neutral-200 bg-white py-2 pl-3 pr-8 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 sm:w-56"
            @change="onWorkspaceChange(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
              {{ ws.name }} · {{ (ws.plan || 'free').charAt(0).toUpperCase() + (ws.plan || 'free').slice(1) }}
            </option>
          </select>
        </div>
      </header>

      <p class="mb-6 max-w-2xl text-lg text-neutral-500 sm:mb-8">
        Start free. Scale as you grow. No hidden fees. Every workspace is billed separately — upgrade only the ones you need.
      </p>

      <div class="mb-5 flex justify-center sm:mb-6 lg:justify-end lg:portrait:justify-center">
        <div
          class="inline-flex rounded-lg border border-neutral-200 bg-neutral-100/90 p-0.5"
          role="group"
          :aria-label="t('pricing.billingPeriod')"
        >
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              billingPeriod === 'annual'
                ? 'bg-white text-neutral-950 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            "
            :aria-pressed="billingPeriod === 'annual'"
            @click="billingPeriod = 'annual'"
          >
            Annual
          </button>
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              billingPeriod === 'monthly'
                ? 'bg-white text-neutral-950 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            "
            :aria-pressed="billingPeriod === 'monthly'"
            @click="billingPeriod = 'monthly'"
          >
            Monthly
          </button>
        </div>
      </div>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <PricingTierCard
          v-for="plan in planMeta"
          :key="plan.key"
          :name="plan.name"
          v-bind="planPriceDisplay(plan.key)"
          :cta="plan.cta"
          :highlighted="plan.highlighted"
          :selected="selectedPlanKey === plan.key"
          :is-current="currentUserPlan === plan.key"
          :items="planItemsForKey(plan.key)"
          :panel-id="`plan-panel-${plan.key}`"
          @select="onTierSelect(plan.key)"
        />
      </div>
      <div
        v-if="selectedPlanKey !== 'free'"
        class="mt-10 flex flex-col items-center gap-3 sm:mt-12"
      >
        <button
          type="button"
          :disabled="purchaseLoading"
          class="rounded-md bg-neutral-950 px-10 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          @click="onPurchaseNow"
        >
          {{ purchaseLoading ? 'Redirecting…' : 'Purchase now' }}
        </button>
        <p v-if="purchaseError" class="text-sm text-red-600">
          {{ purchaseError }}
        </p>
      </div>
    </div>
  </div>
</template>
