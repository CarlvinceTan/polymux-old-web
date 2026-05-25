<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    class="size-3.5"
    :class="$props.class"
    aria-hidden="true"
  >
    <rect
      x="2.9"
      y="4.9"
      width="18.2"
      height="14.2"
      rx="3.1"
      stroke="currentColor"
      stroke-width="1.8"
    />
  </svg>
</template>
