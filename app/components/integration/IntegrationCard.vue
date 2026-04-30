<script setup lang="ts">
import type { ItemCategory } from '~/composables/wallet/useMarketplace'

const props = defineProps<{
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
  tags?: string[]
  popularity?: number
}>()

defineEmits<{
  open: []
}>()

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
        <p class="truncate text-base font-semibold leading-tight text-neutral-950">
          {{ name }}
        </p>
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
      <span
        v-for="tag in tags"
        :key="tag"
        class="rounded-md bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600"
      >
        {{ tag }}
      </span>
    </div>
  </button>
</template>
