<script setup lang="ts">
import { normalizePlanKey, type PlanUpgradePlanKey } from '~/composables/account/usePlanUpgradeNavigation'
import {
  browserAgentCapFromPlan,
  maxMembersFromPlan,
  tokenBudgetWeeklyFromPlan,
  workflowRunsMonthlyCapFromPlan,
} from '~/utils/planLimits'

// Polymux-styled checkout — replaces the redirect to checkout.stripe.com.
// Focused layout (no marketing header/footer) so the embedded Stripe form fits
// the viewport without page scroll: order summary + payment side by side,
// vertically centred. Reached from /pricing with plan/period/workspace in query.
definePageMeta({ layout: false })

const { t } = useI18n()
const route = useRoute()
const user = useSupabaseUser()
const { workspaces, currentWorkspace, fetchWorkspaces, switchWorkspace } = useWorkspaces()
const { $posthog } = useNuxtApp()

const planKey = computed<PlanUpgradePlanKey>(() => normalizePlanKey(route.query.plan as string | undefined))
const billingPeriod = computed<'monthly' | 'annual'>(() =>
  (route.query.period as string) === 'monthly' ? 'monthly' : 'annual',
)
const workspaceId = computed(() => ((route.query.workspaceId as string) || '').trim())
const isPaidPlan = computed(() => planKey.value === 'pro' || planKey.value === 'max')

useHead({ title: () => t('checkout.pageTitle') })

interface PriceData {
  pro: { monthly: string; annualPerMonth: string }
  max: { monthly: string; annualPerMonth: string }
}
const prices = ref<PriceData | null>(null)
async function fetchPrices() {
  try { prices.value = await $fetch<PriceData>('/api/prices') }
  catch { prices.value = null }
}

const planName = computed(() => planKey.value.charAt(0).toUpperCase() + planKey.value.slice(1))

const priceAmount = computed(() => {
  const p = prices.value?.[planKey.value as 'pro' | 'max']
  if (!p) return '—'
  return billingPeriod.value === 'annual' ? p.annualPerMonth : p.monthly
})
const cadenceLabel = computed(() =>
  billingPeriod.value === 'annual' ? t('checkout.billedAnnually') : t('checkout.billedMonthly'),
)

// Live, currency-adapted price from the Stripe session (set by StripePaymentForm
// once the Checkout Session loads). Falls back to the USD /api/prices value until
// then / if Adaptive Pricing is off.
const sessionSummary = ref<{ perMonth: string, annualTotal: string | null } | null>(null)

const displayPerMonth = computed(() => {
  if (!sessionSummary.value) return priceAmount.value
  // Annual per-month is the yearly total / 12 — mark it approximate.
  return billingPeriod.value === 'annual' ? `≈ ${sessionSummary.value.perMonth}` : sessionSummary.value.perMonth
})

const displayCadence = computed(() => {
  const annualTotal = sessionSummary.value?.annualTotal
  if (annualTotal) return t('checkout.billedAnnuallyTotal', { total: annualTotal })
  return cadenceLabel.value
})

const workspace = computed(() =>
  workspaces.value.find(w => w.id === workspaceId.value) ?? currentWorkspace.value ?? null,
)

// Compact token budgets: 2_000_000 → "2M", 5_000_000 → "5M".
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return n.toLocaleString()
}

const includes = computed(() => {
  const k = planKey.value
  return [
    t('checkout.featAgents', { n: browserAgentCapFromPlan(k) }),
    t('checkout.featTokens', { n: compact(tokenBudgetWeeklyFromPlan(k)) }),
    t('checkout.featRuns', { n: workflowRunsMonthlyCapFromPlan(k).toLocaleString() }),
    t('checkout.featMembers', { n: maxMembersFromPlan(k) }),
  ]
})

const submitLabel = computed(() =>
  displayPerMonth.value === '—'
    ? t('checkout.subscribe')
    : t('checkout.subscribeFor', { price: `${displayPerMonth.value}${t('checkout.perMonth')}` }),
)

const phase = ref<'pay' | 'success'>('pay')

onMounted(async () => {
  // /checkout is a public route, but the payment session needs a signed-in
  // workspace owner/admin and valid params.
  if (!user.value) {
    return navigateTo(`/sign-in?redirect=${encodeURIComponent(route.fullPath)}`)
  }
  // Returning from a redirect-based payment (SCA / bank auth): Stripe appends
  // ?redirect_status=succeeded. Show success without creating a new payment.
  if (route.query.redirect_status === 'succeeded') {
    phase.value = 'success'
    $posthog?.capture('plan_upgrade_completed', {
      plan_key: planKey.value,
      billing_period: billingPeriod.value,
      workspace_id: workspaceId.value,
    })
    await fetchWorkspaces()
    return
  }
  if (!isPaidPlan.value || !workspaceId.value) {
    return navigateTo('/pricing')
  }
  fetchPrices()
  if (!workspaces.value.length) await fetchWorkspaces()
  if (workspaceId.value) switchWorkspace(workspaceId.value)
})

async function onComplete() {
  phase.value = 'success'
  $posthog?.capture('plan_upgrade_completed', {
    plan_key: planKey.value,
    billing_period: billingPeriod.value,
    workspace_id: workspaceId.value,
  })
  await fetchWorkspaces()
}

function goBack() {
  navigateTo({
    path: '/pricing',
    query: { workspaceId: workspaceId.value, current: workspace.value?.plan ?? 'free' },
  })
}
function goToDashboard() {
  navigateTo('/workflow/new')
}
</script>

<template>
  <!-- Stripe-style split: tinted summary half + white payment half. Each half's
       content block is centred vertically + horizontally; the back-arrow + logo
       form the top of the left block (so there's no gap above the summary). -->
  <div v-if="phase === 'pay'" class="flex min-h-screen flex-col lg:flex-row">
    <!-- Left half — order summary, centred then lifted 20px above centre (lg only). -->
    <div class="flex items-center justify-center bg-neutral-100 px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16">
      <div class="w-full max-w-sm lg:-translate-y-5">
        <!-- ←  [logo] Polymux (top of the block) -->
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            class="-ml-1 inline-flex items-center justify-center rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900"
            :aria-label="t('checkout.backToPlans')"
            @click="goBack"
          >
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          </button>
          <NuxtLink to="/" aria-label="Polymux" class="flex items-center">
            <InlineLogo size="md" />
          </NuxtLink>
        </div>

        <h2 class="mt-10 text-2xl font-semibold tracking-tight text-neutral-950">
          {{ t('checkout.planHeading', { plan: planName }) }}
        </h2>
        <p v-if="workspace" class="mt-0.5 truncate text-sm text-neutral-500">
          {{ t('checkout.forWorkspace', { name: workspace.name }) }}
        </p>

        <div class="mt-5 flex items-baseline gap-1.5">
          <span data-testid="checkout-price" class="text-4xl font-bold tracking-tight text-neutral-950">{{ displayPerMonth }}</span>
          <span class="text-sm text-neutral-500">{{ t('checkout.perMonth') }}</span>
        </div>
        <p class="mt-1 text-xs text-neutral-500">{{ displayCadence }}</p>

        <ul class="mt-8 space-y-2.5">
          <li v-for="f in includes" :key="f" class="flex items-start gap-2.5 text-sm text-neutral-700">
            <svg class="mt-0.5 size-4 shrink-0 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {{ f }}
          </li>
        </ul>
      </div>
    </div>

    <!-- Right half — payment, centred in the half -->
    <div class="flex items-center justify-center bg-white px-6 py-12 sm:px-10 lg:w-1/2 lg:px-16">
      <div class="w-full max-w-sm">
        <StripePaymentForm
          :plan-key="planKey"
          :billing-period="billingPeriod"
          :workspace-id="workspaceId"
          :submit-label="submitLabel"
          @complete="onComplete"
          @summary="sessionSummary = $event"
        />
        <p class="mt-4 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {{ t('checkout.securedByStripe') }}
        </p>
      </div>
    </div>
  </div>

  <!-- Success — centred full page -->
  <div v-else class="flex min-h-screen items-center justify-center bg-white px-6">
    <div class="w-full max-w-sm text-center">
      <NuxtLink to="/" aria-label="Polymux" class="mb-8 inline-block">
        <InlineLogo size="md" />
      </NuxtLink>
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 text-green-600">
        <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <h2 class="mt-4 text-lg font-semibold text-neutral-950">{{ t('checkout.successTitle', { plan: planName }) }}</h2>
      <p class="mt-1.5 text-sm leading-relaxed text-neutral-500">{{ t('checkout.successBody') }}</p>
      <div class="mt-6 flex flex-col gap-2">
        <button
          type="button"
          class="rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          @click="goToDashboard"
        >
          {{ t('checkout.goToDashboard') }}
        </button>
        <button
          type="button"
          class="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
          @click="goBack"
        >
          {{ t('checkout.backToPlans') }}
        </button>
      </div>
    </div>
  </div>
</template>
