<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    /** `below`: under trigger (e.g. workspace). `above`: above trigger (e.g. sidebar footer). */
    placement?: 'below' | 'above'
    /** `left`: anchored to left edge (default). `right`: anchored to right edge. */
    align?: 'left' | 'right'
    /** Override the default `w-full` with a fixed width class e.g. `"w-40"`. */
    width?: string
  }>(),
  { placement: 'below', align: 'left' },
)

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
    :class="[
      'absolute rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden z-50',
      align === 'right' ? 'right-0' : 'left-0',
      width ?? 'w-full',
      placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
    ]"
  >
    <slot />
  </div>
</template>
