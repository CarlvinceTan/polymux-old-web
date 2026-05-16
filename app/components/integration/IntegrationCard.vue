<script setup lang="ts">
import { useI18n } from '#imports'
import type { ItemCategory } from '~/composables/integrations/useMarketplace'

const props = defineProps<{
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
  tags?: string[]
  popularity?: number
}>()

const emit = defineEmits<{
  open: []
  'filter-tag': [tag: string]
}>()

const { t } = useI18n()

/** Matches IntegrationPublishModal / integrations/publish/new icons */
const typeIcon = computed(() =>
  props.category === 'workflow'
    ? 'i-heroicons-bolt-20-solid'
    : props.category === 'plugin'
      ? 'i-heroicons-cube-transparent-20-solid'
      : 'i-heroicons-link-20-solid',
)

const typeLabel = computed(() => ({
  integration: t('integrations.categoryConnection'),
  workflow: t('integrations.categoryWorkflow'),
  plugin: t('integrations.categoryPlugin'),
}[props.category]))

function onTagClick(tag: string, event: MouseEvent) {
  event.stopPropagation()
  emit('filter-tag', tag)
}

const downloadsLabel = computed(() => {
  const n = props.popularity ?? 0
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
})
</script>

<template>
  <button
    type="button"
    class="ghost-panel group flex flex-col gap-3 rounded-xl bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
    @click="$emit('open')"
  >
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2 text-base leading-tight">
          <p class="min-w-0 truncate font-semibold text-neutral-950">
            {{ name }}
          </p>
          <span
            class="group/type-tip relative inline-flex size-[1em] shrink-0 items-center justify-center text-neutral-600"
            :aria-label="typeLabel"
          >
            <UIcon :name="typeIcon" class="size-[1em] shrink-0" aria-hidden="true" />
            <span
              class="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/type-tip:opacity-100"
              role="tooltip"
            >
              {{ typeLabel }}
            </span>
          </span>
        </div>
        <p class="mt-0.5 truncate text-label-md text-neutral-500">
          {{ author }}
        </p>
      </div>
      <div
        class="flex shrink-0 items-center gap-1 text-label-md font-medium text-neutral-500"
        :title="`${popularity ?? 0} connected`"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span class="tabular-nums">{{ downloadsLabel }}</span>
      </div>
    </div>

    <p class="line-clamp-3 min-h-[3.75rem] text-body-md leading-relaxed text-neutral-500">
      {{ description }}
    </p>

    <div v-if="tags?.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="tag in tags"
        :key="tag"
        type="button"
        class="rounded-md bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-950"
        @click="onTagClick(tag, $event)"
      >
        {{ tag }}
      </button>
    </div>
  </button>
</template>
