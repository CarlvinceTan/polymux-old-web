<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()

const dropdownRef = ref<HTMLElement | null>(null)

// Expose ref for click-outside handling
defineExpose({
  dropdownRef,
})
</script>

<template>
  <div
    v-if="open"
    ref="dropdownRef"
    class="absolute top-full left-0 mt-1 w-full rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden z-50"
  >
    <slot />
  </div>
</template>
