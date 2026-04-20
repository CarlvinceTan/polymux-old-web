<script setup lang="ts">
import { CREDIT_PACKS, useWallet } from '~/composables/useWallet'
import type { SupportedCurrency } from '~/composables/useCurrency'

const { wallet, balanceDisplay, loading, topUp } = useWallet()
const showTopUp = ref(false)

const packs = CREDIT_PACKS

function handleTopUp(cents: number) {
  topUp(cents, (wallet.value?.currency ?? 'usd') as SupportedCurrency)
  showTopUp.value = false
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="ghost-panel flex items-center justify-between rounded-xl p-5 sm:p-6">
      <div>
        <p class="text-meta text-neutral-500">
          Available Balance
        </p>
        <p class="mt-1 text-3xl font-bold tracking-tight text-neutral-950">
          {{ loading ? '...' : balanceDisplay }}
        </p>
      </div>
      <button
        class="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        @click="showTopUp = true"
      >
        Top Up
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="showTopUp"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="showTopUp = false"
      >
        <div class="ghost-panel w-full max-w-sm rounded-2xl bg-white p-6">
          <h3 class="mb-4 text-lg font-semibold tracking-tight text-neutral-950">
            Add Credits
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="pack in packs"
              :key="pack.cents"
              class="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-center transition-all hover:border-neutral-950 hover:shadow-sm"
              @click="handleTopUp(pack.cents)"
            >
              <span class="text-lg font-bold text-neutral-950">{{ pack.label }}</span>
            </button>
          </div>
          <button
            class="mt-4 w-full rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
            @click="showTopUp = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>