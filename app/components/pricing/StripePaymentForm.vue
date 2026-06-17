<script setup lang="ts">
import { loadStripe, type Stripe, type StripeCheckoutElementsSdk, type StripeCheckoutSession, type StripeCurrencySelectorElement, type StripePaymentElement } from '@stripe/stripe-js'

// Compact custom payment form built on Stripe's Payment Element via the
// recommended "Elements with Checkout Sessions" SDK (initCheckoutElementsSdk,
// ui_mode 'elements'). /api/stripe/checkout creates a Checkout Session and
// returns its client secret; the Session owns the customer + subscription, and
// the checkout.session.completed webhook grants the plan. Card-only keeps it
// compact (no Stripe summary / Link-enrollment block), so it fits without
// scrolling. We confirm inline (3DS in-page via redirect: 'if_required') and
// emit `complete` so the host shows its success state.
const props = defineProps<{
  planKey: string
  billingPeriod: string
  workspaceId: string
  /** Button label, e.g. "Subscribe · $65/mo". */
  submitLabel: string
}>()

const emit = defineEmits<{
  complete: []
  /** The buyer's per-month price in their (adaptive) currency + the annual total. */
  summary: [{ perMonth: string, annualTotal: string | null }]
}>()

const { t } = useI18n()
const config = useRuntimeConfig()
const publishableKey = config.public.stripePublishableKey as string

const phase = ref<'loading' | 'ready' | 'error'>('loading')
const errorMsg = ref('')
const payError = ref('')
const submitting = ref(false)
const mountEl = ref<HTMLElement | null>(null)
const currencyEl = ref<HTMLElement | null>(null)
// Only reveal the currency dropdown when the session actually offers a choice
// (USD + the Adaptive-Pricing-detected local currency) — never an empty control.
const showCurrency = ref(false)

let stripe: Stripe | null = null
let checkout: StripeCheckoutElementsSdk | null = null
let paymentElement: StripePaymentElement | null = null
let currencySelector: StripeCurrencySelectorElement | null = null

async function init() {
  phase.value = 'loading'
  errorMsg.value = ''
  payError.value = ''
  if (!publishableKey) {
    errorMsg.value = t('checkout.notConfigured')
    phase.value = 'error'
    return
  }
  try {
    stripe = await loadStripe(publishableKey)
    if (!stripe) throw new Error(t('checkout.loadFailed'))

    const { clientSecret } = await $fetch<{ clientSecret: string }>('/api/stripe/checkout', {
      method: 'POST',
      body: {
        planKey: props.planKey,
        billingPeriod: props.billingPeriod,
        workspaceId: props.workspaceId,
      },
    })

    checkout = stripe.initCheckoutElementsSdk({
      clientSecret,
      // Adaptive Pricing: Stripe presents/charges the buyer's local currency
      // (detected by region), converting from the USD price. Requires Adaptive
      // Pricing to be enabled in the Stripe dashboard to take effect.
      adaptivePricing: { allowed: true },
      elementsOptions: {
        appearance: {
          // `flat` gives borderless, lightly-filled inputs that suit the open,
          // panel-less checkout (no boxes/rings around the fields).
          theme: 'flat',
          variables: {
            colorPrimary: '#0a0a0a',
            colorText: '#171717',
            colorTextSecondary: '#737373',
            colorBackground: '#f5f5f5',
            colorDanger: '#dc2626',
            borderRadius: '8px',
            fontSizeBase: '14px',
            spacingUnit: '4px',
          },
        },
      },
    })
    // Disable Link/wallets so the Element stays a compact card-only form — with
    // Link enabled on the account it would otherwise inject a tall "save your
    // info / email / phone" enrollment block and force the page to scroll.
    paymentElement = checkout.createPaymentElement({
      layout: 'tabs',
      wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
    })
    // USD / detected-currency dropdown. Renders the currencies available on the
    // session (USD + the Adaptive-Pricing-detected local one); picking one
    // updates the session, which fires `change` → the order summary re-derives.
    currencySelector = checkout.createCurrencySelectorElement()
    // Surface the (possibly currency-adapted) price to the host's order summary.
    checkout.on('change', emitSummary)
    phase.value = 'ready'
    await nextTick()
    if (mountEl.value) paymentElement.mount(mountEl.value)
    if (currencyEl.value) currencySelector.mount(currencyEl.value)
    const seed = await checkout.loadActions()
    if (seed.type === 'success') emitSummary(seed.actions.getSession())
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    errorMsg.value = err?.data?.statusMessage || err?.statusMessage || err?.message || t('checkout.failed')
    phase.value = 'error'
  }
}

async function submit() {
  if (!checkout || submitting.value) return
  submitting.value = true
  payError.value = ''

  // The confirm action lives on the Checkout Session's loaded actions.
  const actionsResult = await checkout.loadActions()
  if (actionsResult.type === 'error') {
    payError.value = actionsResult.error.message || t('checkout.paymentFailed')
    submitting.value = false
    return
  }

  // redirect: 'if_required' confirms inline for cards (3DS shown in-page) and
  // only redirects to returnUrl for redirect-based methods; the host page reads
  // ?redirect_status=succeeded on return.
  const result = await actionsResult.actions.confirm({
    returnUrl: window.location.href,
    redirect: 'if_required',
  })

  if (result.type === 'error') {
    payError.value = result.error.message || t('checkout.paymentFailed')
    submitting.value = false
    return
  }

  // type === 'success'
  emit('complete')
}

// Derive the buyer's per-month price (in the session's currency) for the order
// summary. `minorUnitsAmountDivisor` makes the minor→major conversion safe for
// zero-decimal currencies (JPY) and 3-decimal ones. Annual plans charge a yearly
// total, so we divide by 12 for the per-month figure (the host shows it as "≈").
function emitSummary(session: StripeCheckoutSession) {
  showCurrency.value = (session.currencyOptions?.length ?? 0) > 1
  try {
    const totalMinor = session.total?.total?.minorUnitsAmount
    if (typeof totalMinor !== 'number') return
    const divisor = session.minorUnitsAmountDivisor || 100
    const perMonthMajor = (props.billingPeriod === 'annual' ? totalMinor / 12 : totalMinor) / divisor
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: (session.currency || 'usd').toUpperCase() })
    emit('summary', {
      perMonth: fmt.format(perMonthMajor),
      annualTotal: props.billingPeriod === 'annual' ? (session.total?.total?.amount ?? null) : null,
    })
  }
  catch { /* leave the host on its USD fallback */ }
}

function teardown() {
  try { paymentElement?.unmount() }
  catch { /* already unmounted */ }
  try { currencySelector?.unmount() }
  catch { /* already unmounted */ }
  paymentElement = null
  currencySelector = null
  checkout = null
}

onMounted(init)
onUnmounted(teardown)
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="phase === 'loading'" class="flex flex-col items-center justify-center gap-3 py-12 text-neutral-400">
      <svg class="size-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-opacity="0.3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
      </svg>
      <p class="text-xs">{{ t('checkout.loading') }}</p>
    </div>

    <!-- Fatal init error -->
    <div v-else-if="phase === 'error'" class="space-y-3 py-4">
      <div class="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 ring-1 ring-red-200/60">
        <svg class="mt-0.5 size-4 shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
        <p class="text-xs leading-relaxed text-red-900">{{ errorMsg }}</p>
      </div>
      <button
        type="button"
        class="w-full rounded-lg bg-neutral-950 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
        @click="init"
      >
        {{ t('checkout.retry') }}
      </button>
    </div>

    <!-- Payment Element + submit -->
    <form v-show="phase === 'ready'" @submit.prevent="submit">
      <!-- USD / detected-currency dropdown — shown only when there's a choice -->
      <div v-show="showCurrency" class="mb-4">
        <label class="mb-1.5 block text-xs font-medium text-neutral-600">{{ t('checkout.currency') }}</label>
        <div ref="currencyEl" />
      </div>

      <div ref="mountEl" />

      <p v-if="payError" class="mt-3 text-xs text-red-600">{{ payError }}</p>

      <button
        type="submit"
        class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="submitting"
      >
        <svg v-if="submitting" class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke-opacity="0.3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
        </svg>
        {{ submitting ? t('checkout.processing') : submitLabel }}
      </button>
    </form>
  </div>
</template>
