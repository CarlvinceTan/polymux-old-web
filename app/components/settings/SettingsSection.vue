<script setup lang="ts">
const props = defineProps<{
  title: string
  requiresAuth?: boolean
}>()

defineSlots<{
  default?: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)
</script>

<template>
  <section v-if="isVisible" class="min-w-0">
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
