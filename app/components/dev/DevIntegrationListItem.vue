<script setup lang="ts">
interface DevIntegration {
  id: string
  name: string
  type: 'webhook' | 'oauth' | 'tool'
  scopes: string[]
  webhookUrl?: string
  apiKey: string
  apiSecret: string
  createdAt: string
}

defineProps<{ integration: DevIntegration }>()
const emit = defineEmits<{
  copyKey: []
  remove: []
}>()

const typeIcon: Record<DevIntegration['type'], string> = {
  webhook: 'i-heroicons-arrow-uturn-right-20-solid',
  oauth: 'i-heroicons-key-20-solid',
  tool: 'i-heroicons-wrench-screwdriver-20-solid',
}
</script>

<template>
  <div class="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 sm:flex-row sm:items-center sm:gap-5">
    <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
      <UIcon :name="typeIcon[integration.type]" class="size-5 text-neutral-700" />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h3 class="truncate text-base font-semibold text-neutral-950">
          {{ integration.name }}
        </h3>
        <span class="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
          {{ integration.type }}
        </span>
      </div>
      <div class="mt-1 flex items-center gap-2 text-xs text-neutral-500">
        <code class="truncate font-mono">{{ integration.apiKey.slice(0, 18) }}…</code>
        <span class="text-neutral-300">·</span>
        <span>{{ integration.scopes.length }} scope{{ integration.scopes.length === 1 ? '' : 's' }}</span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        @click="emit('copyKey')"
      >
        <UIcon name="i-heroicons-clipboard-document-20-solid" class="size-4" />
        Copy key
      </button>
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-rose-600"
        :aria-label="`Delete ${integration.name}`"
        @click="emit('remove')"
      >
        <UIcon name="i-heroicons-trash-20-solid" class="size-4" />
      </button>
    </div>
  </div>
</template>
