<script setup lang="ts">
const { t } = useI18n()

export interface PricingTierItem {
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
    selected: boolean
    items: PricingTierItem[]
    /** For programmatic focus / scroll when this panel is chosen. */
    panelId?: string
    /** When true the panel is greyed out and the CTA reads "Current Plan". */
    isCurrent?: boolean
    /** When true the panel is greyed out and click is a no-op (e.g. downgrades). */
    disabled?: boolean
  }>(),
  { compareAtPrice: undefined, isCurrent: false, disabled: false },
)

const emit = defineEmits<{
  select: []
}>()

function onClick() {
  if (props.isCurrent || props.disabled) return
  emit('select')
}

const sortedItems = computed(() =>
  [...props.items].sort((a, b) => {
    if (a.included === b.included) return 0
    return a.included ? -1 : 1
  }),
)

const outerClass = computed(() => {
  if (props.isCurrent || props.disabled) {
    return [
      'border p-5 transition-shadow opacity-60',
      'border-neutral-200 bg-neutral-50 cursor-default',
    ]
  }
  return [
    'border p-5 transition-shadow',
    props.selected
      ? 'border-neutral-950 shadow-lg ring-2 ring-neutral-950'
      : 'border-neutral-200 hover:shadow-md',
  ]
})
</script>

<template>
  <button
    :id="panelId"
    type="button"
    class="group relative flex h-full w-full flex-col rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
    :class="outerClass"
    :aria-pressed="selected"
    :aria-disabled="disabled || isCurrent"
    @click="onClick"
  >
    <div class="mb-4 min-h-[4rem]">
      <h3 class="text-2xl font-bold tracking-tight text-neutral-950 sm:text-[1.65rem]">
        {{ name }}
      </h3>
      <span
        v-if="highlighted"
        class="mt-1 inline-block rounded-full bg-neutral-950 px-2.5 py-0.5 text-xs font-medium text-white"
      >
        {{ t('pricing.mostPopular') }}
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
          isCurrent || disabled
            ? 'border border-neutral-200 bg-neutral-100 text-neutral-400 cursor-default'
            : selected
              ? 'bg-neutral-950 text-white hover:opacity-90'
              : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
        "
      >
        {{ isCurrent ? t('pricing.currentPlan') : cta }}
      </span>
    </div>
  </button>
</template>
