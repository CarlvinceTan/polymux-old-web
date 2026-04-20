<script setup lang="ts">
defineProps<{
  label: string
  value: string
  icon?: string
  trend?: string
}>()
</script>

<template>
  <div class="rounded-lg ghost-panel bg-white p-4">
    <h3 class="text-body-md font-medium text-neutral-500">{{ label }}</h3>
    <p class="mt-2 text-3xl font-bold text-neutral-950">{{ value }}</p>
    <p v-if="trend" class="mt-1 text-label-md text-neutral-400">{{ trend }}</p>
  </div>
</template>