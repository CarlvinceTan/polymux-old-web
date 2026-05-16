<script setup lang="ts">
import type { ProviderUsageCard } from '~/composables/storage/useStorageUsage'

const props = withDefaults(defineProps<{
  /** Optional list of providers to hide (e.g. ['local'] for shared view). */
  hideProviders?: string[]
}>(), { hideProviders: () => [] })

const { cards, refresh } = useStorageUsage()

onMounted(() => {
  const run = () => refresh().catch(() => {})
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2_000 })
  else setTimeout(run, 0)
})

const visibleCards = computed(() =>
  cards.value.filter(c => !props.hideProviders.includes(c.provider)),
)

const RING_R = 8
const RING_CIRC = 2 * Math.PI * RING_R

function ringDash(percent: number | null): string {
  if (percent == null) return `0 ${RING_CIRC}`
  const filled = (percent / 100) * RING_CIRC
  return `${filled} ${RING_CIRC - filled}`
}

function ringColor(card: ProviderUsageCard): string {
  if (card.state !== 'tracked' || card.percent == null) return 'text-neutral-300'
  if (card.percent >= 90) return 'text-red-500'
  if (card.percent >= 70) return 'text-amber-500'
  return 'text-neutral-900'
}

function tooltipText(card: ProviderUsageCard): string {
  if (card.loading) return '…'
  if (card.state === 'tracked' && card.percent != null) {
    return `${Math.round(card.percent)}%`
  }
  if (card.state === 'unlimited') return '∞'
  if (card.state === 'connected-untracked') return '—'
  return '—'
}
</script>

<template>
  <!-- Container: parent must be `relative`; this overlay sits on top, bottom-right. -->
  <div
    v-if="visibleCards.length"
    class="pointer-events-auto absolute bottom-3 right-3 z-30"
  >
    <!-- Provider chip row -->
    <div
      class="group/overlay flex items-center gap-1 rounded-full border border-neutral-200/70 bg-white p-1 shadow-sm"
    >
      <div
        v-for="card in visibleCards"
        :key="card.provider"
        class="group/chip relative flex items-center justify-center rounded-full p-1 opacity-55 transition-opacity duration-200 group-hover/overlay:opacity-100"
      >
        <!-- Ring with provider icon centered -->
        <div class="relative flex size-5 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 22 22"
            class="absolute inset-0 size-5 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="11" cy="11" :r="RING_R"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              class="text-neutral-200"
            />
            <circle
              v-if="card.state === 'tracked' && card.percent != null"
              cx="11" cy="11" :r="RING_R"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              :class="ringColor(card)"
              :stroke-dasharray="ringDash(card.percent)"
              class="transition-[stroke-dasharray] duration-500 ease-out"
            />
          </svg>
          <StorageProviderIcon :provider="card.provider" inline />
        </div>

        <!-- Per-chip tooltip: shows percent (or status) above the chip on hover -->
        <div
          class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/chip:opacity-100"
          role="tooltip"
        >
          {{ card.label }} · <span class="font-mono tabular-nums text-neutral-950">{{ tooltipText(card) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
