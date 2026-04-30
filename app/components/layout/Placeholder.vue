<script setup lang="ts">
defineProps<{
  message: string
}>()

defineSlots<{
  icon?: () => unknown
}>()
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col items-center justify-center self-stretch py-12 text-center"
  >
    <div v-if="$slots.icon" class="mb-4 rounded-full bg-neutral-100 p-4">
      <slot name="icon" />
    </div>
    <p class="max-w-md text-neutral-500">
      {{ message }}
    </p>
  </div>
</template>
