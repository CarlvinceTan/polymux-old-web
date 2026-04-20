<script setup lang="ts">
import type { ItemCategory } from '~/composables/useMarketplace'

const props = defineProps<{
  id: string
  name: string
  description: string
  category: ItemCategory
  author: string
  installed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const categoryLabel: Record<ItemCategory, string> = {
  workflow: 'Workflow',
  plugin: 'Plugin',
  connection: 'Connection',
}

function actionLabel() {
  if (props.installed) return props.category === 'connection' ? 'Disconnect' : 'Uninstall'
  return props.category === 'connection' ? 'Connect' : 'Install'
}
</script>

<template>
  <div class="flex flex-col gap-3 rounded-xl bg-white ghost-panel p-4">
    <div class="flex items-start gap-3">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
        <svg
          v-if="category === 'workflow'"
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <svg
          v-else-if="category === 'plugin'"
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        <svg
          v-else
          class="size-4 text-neutral-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-semibold leading-tight text-neutral-950">{{ name }}</p>
          <span class="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-label-md font-medium text-neutral-600">
            {{ categoryLabel[category] }}
          </span>
        </div>
        <p class="mt-0.5 text-label-md text-neutral-400">{{ author }}</p>
      </div>
    </div>

    <p class="flex-1 text-body-md leading-relaxed text-neutral-500">{{ description }}</p>

    <button
      type="button"
      @click="emit('toggle')"
      class="w-full rounded-lg py-2 text-sm font-medium transition-colors"
      :class="installed
        ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
        : 'bg-neutral-950 text-white hover:bg-neutral-800'"
    >
      {{ actionLabel() }}
    </button>
  </div>
</template>