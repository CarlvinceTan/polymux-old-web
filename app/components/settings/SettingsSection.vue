<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
  requiresAuth?: boolean
  variant?: 'flat' | 'panel'
}>(), {
  title: undefined,
  description: undefined,
  variant: 'flat',
})

defineSlots<{
  default?: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)
</script>

<template>
  <!-- Flat, full-width divided list (ChatGPT settings content style). The line
       above the first row is provided by the fixed header divider in the modal. -->
  <section
    v-if="isVisible"
    :class="variant === 'panel'
      ? 'scroll-mt-20'
      : 'flex flex-col divide-y divide-neutral-200/80'"
  >
    <template v-if="variant === 'panel'">
      <div v-if="title || description" class="mb-3">
        <h3 v-if="title" class="text-base font-semibold leading-7 text-neutral-950">
          {{ title }}
        </h3>
        <p v-if="description" class="mt-0.5 max-w-2xl text-sm leading-relaxed text-neutral-500">
          {{ description }}
        </p>
      </div>
      <div class="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm divide-y divide-neutral-100">
        <slot />
      </div>
    </template>
    <slot v-else />
  </section>
</template>
