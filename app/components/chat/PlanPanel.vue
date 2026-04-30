<script setup lang="ts">
export interface PlanPanelItem {
  label: string
  included: boolean
}

const props = withDefaults(
  defineProps<{
    name: string
    price: string
    period: string
    /** Shown struck-through to the right (e.g. monthly rate when annual is selected). */
    compareAtPrice?: string
    cta: string
    highlighted: boolean
    /** Animated amber-gold border — currently disabled; kept for future use. */
    isSpecial?: boolean
    selected: boolean
    items: PlanPanelItem[]
    /** For programmatic focus / scroll when this panel is chosen. */
    panelId?: string
    /** When true the panel is greyed out and the CTA reads "Current Plan". */
    isCurrent?: boolean
  }>(),
  { isSpecial: false, compareAtPrice: undefined, isCurrent: false },
)

const sortedItems = computed(() =>
  [...props.items].sort((a, b) => {
    if (a.included === b.included) return 0
    return a.included ? -1 : 1
  }),
)

const emit = defineEmits<{
  select: []
}>()

const outerClass = computed(() => {
  if (props.isCurrent) {
    return [
      'border p-5 transition-shadow opacity-60',
      'border-neutral-200 bg-neutral-50 cursor-default',
    ]
  }

  /* ── Gold animation disabled — using black styling instead ──
  if (props.isSpecial) {
    const classes = [
      'plan-panel-special-outer',
      'overflow-hidden',
      'p-[2px]',
      '[--plan-frame:0.625rem]',
      'ring-offset-0',
      'focus-visible:!ring-offset-0',
    ]
    if (props.selected) {
      classes.push(
        'plan-panel-special--selected',
        'ring-2',
        'ring-neutral-950',
        'ring-offset-0',
      )
    }
    return classes
  }
  ── end disabled gold animation ── */

  return [
    'border p-5 transition-shadow',
    props.selected
      ? 'border-neutral-950 shadow-lg ring-2 ring-neutral-950'
      : 'border-neutral-200 hover:shadow-md',
  ]
})

const innerClass = computed(() =>
  /* Gold animation disabled — always use 'contents'
  props.isSpecial
    ? 'plan-panel-special-inner flex min-h-0 min-w-0 flex-1 flex-col rounded-[var(--plan-frame)] bg-white p-5'
    : 'contents',
  */
  'contents',
)
</script>

<template>
  <button
    :id="panelId"
    type="button"
    class="group relative flex h-full w-full flex-col rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
    :class="outerClass"
    :aria-pressed="selected"
    @click="emit('select')"
  >
    <div :class="innerClass">
      <div class="mb-4 min-h-[4rem]">
        <h3 class="text-2xl font-bold tracking-tight text-neutral-950 sm:text-[1.65rem]">
          {{ name }}
        </h3>
        <span
          v-if="highlighted"
          class="mt-1 inline-block rounded-full bg-neutral-950 px-2.5 py-0.5 text-xs font-medium text-white"
        >
          Most Popular
        </span>
      </div>

      <ul class="flex-1 space-y-2">
        <li
          v-for="item in sortedItems"
          :key="item.label"
          class="flex items-start gap-2 text-sm"
        >
          <svg
            v-if="item.included"
            class="mt-0.5 size-4 shrink-0 text-green-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg
            v-else
            class="mt-0.5 size-4 shrink-0 text-neutral-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          <span
            :class="item.included ? 'text-neutral-600' : 'text-neutral-300'"
          >
            {{ item.label }}
          </span>
        </li>
      </ul>

      <div class="mt-5 flex h-[8.5rem] flex-col justify-between border-t border-neutral-100 pt-5 pb-1">
        <div class="flex flex-col">
          <div class="flex items-baseline gap-x-1">
            <span class="text-3xl font-bold tracking-tight text-neutral-950">
              {{ price }}
            </span>
            <span v-if="period" class="text-sm text-neutral-500">
              {{ period }}
            </span>
          </div>
          <span
            v-if="compareAtPrice"
            class="text-sm font-medium tracking-tight text-neutral-400 line-through decoration-neutral-400 [text-decoration-thickness:1.5px]"
          >
            {{ compareAtPrice }}
          </span>
        </div>
        <span
          class="block w-full rounded-md px-4 py-2 text-center text-sm font-medium transition-opacity"
          :class="
            isCurrent
              ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 cursor-default'
              : selected
                ? 'bg-neutral-950 text-white hover:opacity-90'
                : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
          "
        >
          {{ isCurrent ? 'Current Plan' : cta }}
        </span>
      </div>
    </div>
  </button>
</template>

<style scoped>
/* ══ ARCHIVED — Gold animation styles (disabled, kept for future use) ══

@keyframes plan-border-gold-sweep {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 200% 50%;
  }
}

.plan-panel-special-outer {
  background-image: linear-gradient(
    90deg,
    #ea580c 0%,
    #f97316 12%,
    #f59e0b 24%,
    #fbbf24 36%,
    #fcd34d 44%,
    #fef08a 50%,
    #fcd34d 56%,
    #fbbf24 64%,
    #f59e0b 76%,
    #f97316 88%,
    #ea580c 100%
  );
  background-size: 100% 100%;
  background-position: 50% 50%;
  animation: none;
  box-shadow:
    0 0 0 1px rgba(254, 243, 199, 0.28),
    0 0 14px rgba(251, 191, 36, 0.18),
    0 0 28px rgba(245, 158, 11, 0.1),
    0 6px 22px rgba(234, 88, 12, 0.05);
}

.plan-panel-special-outer.plan-panel-special--selected {
  background-image: linear-gradient(
    90deg,
    #ea580c 0%,
    #f97316 12%,
    #f59e0b 24%,
    #fbbf24 36%,
    #fcd34d 44%,
    #fef08a 50%,
    #fcd34d 56%,
    #fbbf24 64%,
    #f59e0b 76%,
    #f97316 88%,
    #ea580c 100%
  );
  background-size: 200% 100%;
  animation: plan-border-gold-sweep 2.8s linear infinite;
  box-shadow:
    0 0 0 1px rgba(254, 252, 232, 0.85),
    0 0 24px rgba(253, 224, 171, 0.45),
    0 0 48px rgba(251, 191, 36, 0.32),
    0 0 72px rgba(245, 158, 11, 0.18),
    0 10px 36px rgba(245, 158, 11, 0.12);
}

.plan-panel-special-inner {
  min-height: 0;
}

══ END ARCHIVED ══ */
</style>
