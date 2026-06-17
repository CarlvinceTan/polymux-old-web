<script setup lang="ts">
const props = defineProps<{
  clickable?: boolean
  requiresAuth?: boolean
}>()

defineSlots<{
  label: () => unknown
  description?: () => unknown
  trailing: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)
</script>

<template>
  <!-- Row = left column (name + description stacked) + control on the right.
       pr-3 insets the control from the row's right edge while the full-width
       divider (divide-y on the parent) still spans edge to edge. -->
  <component
    v-if="isVisible"
    :is="clickable ? 'button' : 'div'"
    class="group flex w-full items-center justify-between gap-4 py-4 pr-3 text-left"
    :class="{ 'cursor-pointer': clickable }"
    v-bind="clickable ? { type: 'button' } : {}"
  >
    <div class="w-3/5 min-w-0 shrink-0">
      <span
        class="block truncate text-[0.9375rem] font-medium text-neutral-950 transition-colors"
        :class="{ 'group-hover:text-neutral-600': clickable }"
      >
        <slot name="label" />
      </span>
      <p
        v-if="$slots.description"
        class="mt-1 text-sm leading-relaxed text-neutral-500"
      >
        <slot name="description" />
      </p>
    </div>
    <span class="flex shrink-0 items-center gap-1.5 text-sm font-normal text-neutral-600">
      <slot name="trailing" />
    </span>
  </component>
</template>
