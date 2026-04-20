<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Pricing — Polymux',
})

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

const planFeatures: PlanFeatureRow[] = [
  { name: 'AI Agents', free: '3', pro: '10', max: 'Unlimited', enterprise: 'Custom' },
  { name: 'Monthly Tasks', free: '100', pro: '1,000', max: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Browser Sessions', free: '2', pro: '8', max: '20', enterprise: 'Custom' },
  { name: 'Vault Storage', free: '100 MB', pro: '5 GB', max: '50 GB', enterprise: 'Unlimited' },
  { name: 'Custom Workflows', free: false, pro: true, max: true, enterprise: true },
  { name: 'API Access', free: false, pro: false, max: true, enterprise: true },
  { name: 'Priority Support', free: false, pro: false, max: true, enterprise: true },
  { name: 'SSO / SAML', free: false, pro: false, max: false, enterprise: true },
  { name: 'Dedicated Account Manager', free: false, pro: false, max: false, enterprise: true },
]

type BillingPeriod = 'annual' | 'monthly'

const billingPeriod = ref<BillingPeriod>('annual')

const { currency, prices, detect } = useCurrency()

onMounted(() => { detect() })

const planMeta: { key: PlanKey; name: string; cta: string; highlighted: boolean; isSpecial: boolean }[] = [
  { key: 'free', name: 'Free', cta: 'Get Started', highlighted: false, isSpecial: false },
  { key: 'pro', name: 'Pro', cta: 'Select Plan', highlighted: true, isSpecial: true },
  { key: 'max', name: 'Max', cta: 'Select Plan', highlighted: false, isSpecial: false },
  { key: 'enterprise', name: 'Enterprise', cta: 'Contact Sales', highlighted: false, isSpecial: false },
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
  return planFeatures.map((row) => {
    const included = planCellIncluded(row, key)
    const detail = planCellDetail(row, key)
    const label = detail ? `${row.name} (${detail})` : row.name
    return { label, included }
  })
}

const route = useRoute()

const planOrder: PlanKey[] = ['free', 'pro', 'max', 'enterprise']

const currentUserPlan = computed<PlanKey | null>(() => {
  const raw = (route.query.current as string | undefined)?.toLowerCase().trim()
  if (raw && planOrder.includes(raw as PlanKey)) return raw as PlanKey
  return null
})

function nextTierUp(key: PlanKey): PlanKey {
  const idx = planOrder.indexOf(key)
  return idx >= 0 && idx < planOrder.length - 1 ? planOrder[idx + 1] : key
}

const selectedPlanKey = ref<PlanKey>(
  currentUserPlan.value ? nextTierUp(currentUserPlan.value) : 'free',
)

function onPlanPanelSelect(key: PlanKey) {
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

  purchaseLoading.value = true
  purchaseError.value = ''

  try {
    const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
      method: 'POST',
      body: { planKey: key, billingPeriod: billingPeriod.value, currency: currency.value },
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
      <header class="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
        <button
          type="button"
          class="flex size-9 shrink-0 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Go back"
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
        <h1 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          Pricing
        </h1>
      </header>

      <p class="mb-6 max-w-2xl text-lg text-neutral-500 sm:mb-8">
        Start free. Scale as you grow. No hidden fees.
      </p>

      <div class="mb-5 flex justify-center sm:mb-6 lg:justify-end lg:portrait:justify-center">
        <div
          class="inline-flex rounded-lg border border-neutral-200 bg-neutral-100/90 p-0.5"
          role="group"
          aria-label="Billing period"
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
        <PlanPanel
          v-for="plan in planMeta"
          :key="plan.key"
          :name="plan.name"
          v-bind="planPriceDisplay(plan.key)"
          :cta="plan.cta"
          :highlighted="plan.highlighted"
          :is-special="plan.isSpecial"
          :selected="selectedPlanKey === plan.key"
          :is-current="currentUserPlan === plan.key"
          :items="planItemsForKey(plan.key)"
          :panel-id="`plan-panel-${plan.key}`"
          @select="onPlanPanelSelect(plan.key)"
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
