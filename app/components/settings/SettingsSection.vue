<script setup lang="ts">
const props = defineProps<{
  requiresAuth?: boolean
}>()

defineSlots<{
  default?: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)
</script>

<template>
  <!-- Flat, full-width divided list (ChatGPT settings content style). The line
       above the first row is provided by the fixed header divider in the modal. -->
  <div v-if="isVisible" class="flex flex-col divide-y divide-neutral-200/80">
    <slot />
  </div>
</template>
