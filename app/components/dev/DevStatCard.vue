<script setup lang="ts">
defineProps<{
  label: string
  value: string
  delta?: string
  deltaTone?: 'positive' | 'negative' | 'neutral'
  icon?: string
}>()
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-5">
    <div class="flex items-start justify-between gap-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {{ label }}
      </span>
      <UIcon v-if="icon" :name="icon" class="size-4 text-neutral-400" />
    </div>
    <div class="mt-3 flex items-baseline gap-2">
      <span class="text-2xl font-semibold tracking-tight text-neutral-950">
        {{ value }}
      </span>
      <span
        v-if="delta"
        class="text-xs font-medium"
        :class="{
          'text-emerald-600': deltaTone === 'positive',
          'text-rose-600': deltaTone === 'negative',
          'text-neutral-500': !deltaTone || deltaTone === 'neutral',
        }"
      >
        {{ delta }}
      </span>
    </div>
  </div>
</template>
