<script setup lang="ts">
defineSlots<{
  icon?: () => unknown
  label: () => unknown
  trailing: () => unknown
}>()
</script>

<template>
  <div
    class="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
  >
    <div class="flex min-w-0 items-center gap-3">
      <template v-if="$slots.icon">
        <slot name="icon" />
      </template>
      <span class="min-w-0 truncate text-body-md font-medium text-neutral-950">
        <slot name="label" />
      </span>
    </div>
    <span class="shrink-0 text-label-md font-normal text-neutral-600">
      <slot name="trailing" />
    </span>
  </div>
</template>
