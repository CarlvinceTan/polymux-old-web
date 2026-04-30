<script setup lang="ts">
import type { SupportedCurrency } from '~/composables/wallet/useCurrency'

const props = defineProps<{
  currency: SupportedCurrency
  hasWallet: boolean
}>()

const { t } = useI18n()
const { wallet, balanceDisplay, topUp } = useWallet()

const showTopUpModal = ref(false)
const customAmount = ref('')
const topUpLoading = ref(false)

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
  await topUp(Math.round(dollars * 100), props.currency)
  topUpLoading.value = false
  showTopUpModal.value = false
}
</script>

<template>
  <section
    class="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-neutral-900/20 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black p-5 text-white sm:p-6"
  >
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute -right-24 -top-28 size-72 rounded-full bg-white/10 blur-3xl" />
      <div class="absolute -bottom-24 -left-20 size-60 rounded-full bg-white/5 blur-3xl" />
    </div>
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.06]"
      style="background-image: repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 14px);"
      aria-hidden="true"
    />

    <div class="relative flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          {{ t('dashboard.walletBalance') }}
        </p>
        <p class="mt-2 font-mono text-3xl font-bold tracking-tight sm:text-4xl">
          <template v-if="hasWallet">
            {{ balanceDisplay }}
          </template>
          <template v-else>
            —
          </template>
        </p>
        <p v-if="!hasWallet" class="mt-2 max-w-xs text-xs text-neutral-300">
          {{ t('dashboard.enableWalletDesc') }}
        </p>
      </div>
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
        <UIcon name="i-heroicons-wallet-20-solid" class="size-5 text-white" />
      </div>
    </div>

    <div class="relative mt-6 flex items-center gap-2">
      <button
        type="button"
        class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-100"
        @click="openTopUp"
      >
        <UIcon name="i-heroicons-arrow-up-tray-20-solid" class="size-4" />
        {{ hasWallet ? t('dashboard.topUp') : t('dashboard.enableWallet') }}
      </button>
      <NuxtLink
        to="/dashboard/usage"
        class="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/10"
      >
        {{ t('dashboard.viewUsage') }}
        <UIcon name="i-heroicons-arrow-right-20-solid" class="size-3.5" />
      </NuxtLink>
    </div>

    <Teleport to="body">
      <div
        v-if="showTopUpModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showTopUpModal = false"
      >
        <div class="ghost-panel w-full max-w-sm rounded-2xl bg-white p-6 text-neutral-950">
          <h3 class="mb-4 text-lg font-semibold tracking-tight">
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
                >
              </div>
            </div>
            <button
              type="button"
              class="w-full rounded-md bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              :disabled="amountError || topUpLoading"
              @click="handleTopUp"
            >
              {{ topUpLoading ? t('common.loading') : t('dashboard.topUpConfirm') }}
            </button>
            <button
              type="button"
              class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              @click="showTopUpModal = false"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
