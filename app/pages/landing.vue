<script setup lang="ts">
/** Marketing home body: hero, features, pricing, reviews, CTA. Imported by `index.vue` for `/`; not a file-based route (see `nuxt.config` `pages:extend`). */

const { t } = useI18n()

useHead({
  title: () => t('landing.meta.title'),
  meta: [
    {
      name: 'description',
      content: () => t('landing.meta.description'),
    },
  ],
})

const route = useRoute()

function scrollToHash() {
  const id = route.hash?.replace(/^#/, '')
  if (!id) return
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

onMounted(scrollToHash)
watch(() => route.fullPath, scrollToHash)

const heroRotatingPhrases = computed(() => [
  t('landing.hero.rotatingPhrases.liveBrowser'),
  t('landing.hero.rotatingPhrases.multiAgent'),
  t('landing.hero.rotatingPhrases.vault'),
  t('landing.hero.rotatingPhrases.replayable'),
])

const features = computed(() => [
  {
    title: t('landing.features.items.orchestration.title'),
    description: t('landing.features.items.orchestration.description'),
  },
  {
    title: t('landing.features.items.browser.title'),
    description: t('landing.features.items.browser.description'),
  },
  {
    title: t('landing.features.items.vault.title'),
    description: t('landing.features.items.vault.description'),
  },
  {
    title: t('landing.features.items.marketplace.title'),
    description: t('landing.features.items.marketplace.description'),
  },
])

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

interface PlanFeatureRow {
  name: string
  free: string | boolean
  pro: string | boolean
  max: string | boolean
  enterprise: string | boolean
}

const planFeatures = computed<PlanFeatureRow[]>(() => [
  {
    name: t('landing.pricing.comparison.agentsPerWorkspace'),
    free: '3',
    pro: '10',
    max: '50',
    enterprise: t('landing.pricing.comparison.custom'),
  },
  {
    name: t('landing.pricing.comparison.monthlyTasks'),
    free: '100',
    pro: '1,000',
    max: '10,000',
    enterprise: t('landing.pricing.comparison.unlimited'),
  },
  {
    name: t('landing.pricing.comparison.browserSessions'),
    free: '2',
    pro: '8',
    max: '20',
    enterprise: t('landing.pricing.comparison.custom'),
  },
  {
    name: t('landing.pricing.comparison.workspaceStorage'),
    free: '100 MB',
    pro: '5 GB',
    max: '50 GB',
    enterprise: t('landing.pricing.comparison.unlimited'),
  },
  {
    name: t('landing.pricing.comparison.workspaceMembers'),
    free: '3',
    pro: '10',
    max: '50',
    enterprise: t('landing.pricing.comparison.custom'),
  },
  {
    name: t('landing.pricing.comparison.customWorkflows'),
    free: false,
    pro: true,
    max: true,
    enterprise: true,
  },
  {
    name: t('landing.pricing.comparison.prioritySupport'),
    free: false,
    pro: false,
    max: true,
    enterprise: true,
  },
])

type BillingPeriod = 'annual' | 'monthly'

const billingPeriod = ref<BillingPeriod>('annual')

interface PriceData {
  free: { monthly: string; annualPerMonth: string }
  pro: { monthly: string; annualPerMonth: string }
  max: { monthly: string; annualPerMonth: string }
  enterprise: { monthly: string; annualPerMonth: string }
}

const prices = useState<PriceData | null>('pricing-prices', () => null)

onMounted(async () => {
  try {
    prices.value = await $fetch<PriceData>('/api/prices')
  }
  catch {
    prices.value = null
  }
})

const planMeta = computed<{ key: PlanKey; name: string; cta: string; highlighted: boolean }[]>(() => [
  { key: 'free', name: t('landing.pricing.plans.free.name'), cta: t('landing.pricing.plans.free.cta'), highlighted: false },
  { key: 'pro', name: t('landing.pricing.plans.pro.name'), cta: t('landing.pricing.plans.pro.cta'), highlighted: true },
  { key: 'max', name: t('landing.pricing.plans.max.name'), cta: t('landing.pricing.plans.max.cta'), highlighted: false },
  { key: 'enterprise', name: t('landing.pricing.plans.enterprise.name'), cta: t('landing.pricing.plans.enterprise.cta'), highlighted: false },
])

const planOrder: PlanKey[] = ['free', 'pro', 'max', 'enterprise']
const user = useSupabaseUser()
const { currentWorkspace } = useWorkspaces()

const currentUserPlan = computed<PlanKey | null>(() => {
  if (!user.value) return null
  const raw = (currentWorkspace.value?.plan as string | undefined)?.toLowerCase().trim()
  if (raw && planOrder.includes(raw as PlanKey)) return raw as PlanKey
  return 'free'
})

function isPlanCurrent(key: PlanKey) {
  return currentUserPlan.value === key
}

function isPlanDowngrade(key: PlanKey) {
  const cur = currentUserPlan.value
  if (!cur) return false
  return planOrder.indexOf(key) < planOrder.indexOf(cur)
}

function nextTierUp(key: PlanKey): PlanKey {
  const idx = planOrder.indexOf(key)
  if (idx < 0 || idx >= planOrder.length - 1) return key
  return planOrder[idx + 1] ?? key
}

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

const selectedPlanKey = ref<PlanKey>(
  currentUserPlan.value ? nextTierUp(currentUserPlan.value) : 'free',
)

watch(currentUserPlan, (cur) => {
  if (cur) selectedPlanKey.value = nextTierUp(cur)
})

function onTierSelect(key: PlanKey) {
  if (key === 'enterprise') {
    return navigateTo({ path: '/contact', query: { from: 'enterprise-plan' } })
  }
  if (isPlanCurrent(key) || isPlanDowngrade(key)) return
  if (!user.value) {
    return navigateTo({ path: '/sign-up', query: { redirect: '/pricing' } })
  }
  selectedPlanKey.value = key
  nextTick(() => {
    const el = document.getElementById(`plan-panel-${key}`)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  })
}

function onPurchaseNow() {
  const key = selectedPlanKey.value
  if (key === 'enterprise') {
    return navigateTo({ path: '/contact', query: { from: 'enterprise-plan' } })
  }
  if (!user.value) {
    return navigateTo({ path: '/sign-up', query: { redirect: '/pricing' } })
  }
  return navigateTo('/pricing')
}

/** One entry forces ViewportDemo into single-slide mode (no carousel). */
const featureDemoSources: string[] = ['']
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-16 sm:py-20 lg:py-28">
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div class="flex flex-col gap-6">
            <h1 class="text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
              <span class="block">{{ t('landing.hero.title') }}</span>
              <RotatingBlockDisplay
                :phrases="heroRotatingPhrases"
                class="mt-1.5 block font-medium text-neutral-600"
              />
            </h1>
            <p class="max-w-lg text-lg leading-relaxed text-neutral-500">
              {{ t('landing.hero.subtitle') }}
            </p>
            <div class="flex items-center gap-3 pt-2">
              <NuxtLink
                to="/workflow/new"
                class="rounded-md bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
               >
                 {{ $t('landing.useNow') }}
               </NuxtLink>
               <NuxtLink
                 to="/community"
                class="rounded-md border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
            {{ t('landing.cta.joinCommunity') }}
              </NuxtLink>
            </div>
          </div>
          <div class="relative">
            <ViewportDemo />
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <div
      id="features"
      class="scroll-mt-16 bg-[#F9F9F9] pt-20 pb-10 sm:pt-24 sm:pb-12 lg:pt-32 lg:pb-16"
    >
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mb-16 text-center">
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('landing.features.title') }}
          </h2>
          <p class="mt-4 text-lg text-neutral-500">
            {{ t('landing.features.subtitle') }}
          </p>
        </div>
        <div class="relative">
          <div
            class="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-neutral-300/60 lg:block"
            aria-hidden="true"
          />
          <div class="flex flex-col gap-16 lg:gap-24">
            <div v-for="(feature, index) in features" :key="feature.title" class="relative">
              <div
                class="absolute left-1/2 top-1/2 z-10 hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950 ring-4 ring-[#F9F9F9] lg:block"
                aria-hidden="true"
              />
              <div class="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <div :class="index % 2 === 1 ? 'lg:order-2' : ''">
                  <ViewportDemo :sources="featureDemoSources" />
                </div>
                <div :class="index % 2 === 1 ? 'lg:order-1' : ''">
                  <div class="lg:max-w-md" :class="index % 2 === 0 ? 'lg:ml-auto lg:pr-8' : 'lg:pl-8'">
                    <span class="mb-3 inline-block rounded-full bg-neutral-200/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                      0{{ index + 1 }}
                    </span>
                    <h3 class="text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
                      {{ feature.title }}
                    </h3>
                    <p class="mt-3 leading-relaxed text-neutral-500">
                      {{ feature.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pricing -->
    <div
      id="pricing"
      class="scroll-mt-16 pt-6 sm:pt-8 lg:pt-10"
      :class="
        selectedPlanKey !== 'free'
          ? 'pb-6 sm:pb-8 lg:pb-10'
          : 'pb-20 sm:pb-24 lg:pb-32'
      "
    >
      <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div class="mb-4 flex flex-col items-center text-center">
          <span class="mb-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
            <svg class="size-3.5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            {{ t('landing.pricing.badge') }}
          </span>
          <h2 class="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {{ t('landing.pricing.title') }}
          </h2>
          <p class="mt-3 max-w-2xl text-lg text-neutral-500 sm:mt-4">
            {{ t('landing.pricing.subtitle') }}
          </p>
        </div>
        <div class="mb-5 flex justify-center sm:mb-6">
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
              {{ t('landing.pricing.annual') }}
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
              {{ t('landing.pricing.monthly') }}
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
            :is-current="isPlanCurrent(plan.key)"
            :disabled="isPlanDowngrade(plan.key)"
            :items="planItemsForKey(plan.key)"
            :panel-id="`plan-panel-${plan.key}`"
            @select="onTierSelect(plan.key)"
          />
        </div>
        <div
          v-if="selectedPlanKey !== 'free' && !isPlanCurrent(selectedPlanKey) && !isPlanDowngrade(selectedPlanKey)"
          class="mt-10 flex flex-col items-center gap-3 sm:mt-12"
        >
          <button
            type="button"
            class="rounded-md bg-neutral-950 px-10 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            @click="onPurchaseNow"
          >
            {{ t('landing.pricing.purchaseNow') }}
          </button>
        </div>
      </div>
    </div>

    <ReviewCarousel />

    <!-- Banner -->
    <div class="bg-neutral-950 py-16 sm:py-20">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-10 px-4 sm:px-6 lg:flex-row lg:px-8">
        <h2 class="text-center text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-left">
          {{ t('landing.cta.title') }}
        </h2>
        <div class="flex flex-col gap-3 sm:min-w-64">
          <NuxtLink
            to="/community"
            class="rounded-lg border border-neutral-600 px-8 py-3.5 text-center text-base font-medium text-white transition-colors hover:border-neutral-400 hover:bg-neutral-800"
          >
            {{ t('landing.cta.joinCommunity') }}
          </NuxtLink>
          <NuxtLink
            to="/workflow/new"
             class="rounded-lg bg-white px-8 py-3.5 text-center text-base font-medium text-neutral-950 transition-opacity hover:opacity-90"
           >
             {{ $t('landing.useNow') }}
           </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
