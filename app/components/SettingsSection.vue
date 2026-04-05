<script setup lang="ts">
defineProps<{
  title: string
}>()

defineSlots<{
  default?: () => unknown
}>()
</script>

<template>
  <section class="min-w-0">
    <h2 class="mb-3 text-body-md font-semibold tracking-tight text-neutral-950">
      {{ title }}
    </h2>
    <div
      class="divide-y divide-neutral-200/90 overflow-hidden rounded-lg bg-white ghost-panel"
    >
      <slot />
    </div>
  </section>
</template>
