<script setup lang="ts">
const props = defineProps<{
  clickable?: boolean
  requiresAuth?: boolean
}>()

defineSlots<{
  icon?: () => unknown
  label: () => unknown
  trailing: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)
</script>

<template>
  <component
    v-if="isVisible"
    :is="clickable ? 'button' : 'div'"
    class="flex w-full items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
    :class="{ 'cursor-pointer text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100': clickable }"
    v-bind="clickable ? { type: 'button' } : {}"
  >
    <div class="flex min-w-0 items-center gap-3">
      <template v-if="$slots.icon">
        <slot name="icon" />
      </template>
      <span class="min-w-0 truncate text-body-md font-medium text-neutral-950">
        <slot name="label" />
      </span>
    </div>
    <span class="flex shrink-0 items-center text-label-md font-normal text-neutral-600">
      <slot name="trailing" />
    </span>
  </component>
</template>
