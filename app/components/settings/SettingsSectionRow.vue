<script setup lang="ts">
const props = withDefaults(defineProps<{
  clickable?: boolean
  requiresAuth?: boolean
  variant?: 'flat' | 'panel'
  align?: 'center' | 'start'
  tone?: 'default' | 'danger'
}>(), {
  variant: 'flat',
  align: 'center',
  tone: 'default',
})

defineSlots<{
  icon?: () => unknown
  label: () => unknown
  description?: () => unknown
  trailing: () => unknown
}>()

const user = useSupabaseUser()
const isVisible = computed(() => !props.requiresAuth || !!user.value)

const rowClass = computed(() => [
  'group flex w-full justify-between gap-4 text-left transition-colors',
  props.variant === 'panel'
    ? [
        'flex-col px-5 py-4 sm:flex-row sm:px-6',
        props.align === 'start' ? 'items-start' : 'items-start sm:items-center',
      ]
    : 'items-center py-4 pr-3',
  props.clickable ? 'cursor-pointer hover:bg-neutral-50/70' : '',
])

const labelWrapClass = computed(() =>
  props.variant === 'panel'
    ? 'flex min-w-0 flex-1 items-start gap-3 pr-0 sm:pr-4'
    : 'flex w-3/5 min-w-0 shrink-0 items-start gap-3',
)

const labelTextClass = computed(() => [
  'block truncate text-[0.9375rem] font-medium transition-colors',
  props.tone === 'danger' ? 'text-red-700' : 'text-neutral-950',
  props.clickable && props.tone === 'default' ? 'group-hover:text-neutral-600' : '',
])

const trailingClass = computed(() => [
  'flex shrink-0 items-center gap-1.5 text-sm font-normal text-neutral-600',
  props.variant === 'panel' ? 'w-full justify-start sm:w-auto sm:justify-end' : '',
])
</script>

<template>
  <!-- Row = left column (name + description stacked) + control on the right.
       pr-3 insets the control from the row's right edge while the full-width
       divider (divide-y on the parent) still spans edge to edge. -->
  <component
    v-if="isVisible"
    :is="clickable ? 'button' : 'div'"
    :class="rowClass"
    v-bind="clickable ? { type: 'button' } : {}"
  >
    <div :class="labelWrapClass">
      <span
        v-if="$slots.icon"
        class="mt-0.5 hidden size-5 shrink-0 items-center justify-center text-neutral-400 sm:flex"
      >
        <slot name="icon" />
      </span>
      <span class="min-w-0 flex-1">
        <span :class="labelTextClass">
          <slot name="label" />
        </span>
        <div
          v-if="$slots.description"
          class="mt-1 text-sm leading-relaxed text-neutral-500"
        >
          <slot name="description" />
        </div>
      </span>
    </div>
    <span :class="trailingClass">
      <slot name="trailing" />
    </span>
  </component>
</template>
