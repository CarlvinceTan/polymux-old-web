<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  text: string
  hasDivider?: boolean
  destructive?: boolean
  active?: boolean
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent) {
  emit('click', event)
}
</script>

<template>
  <div v-if="hasDivider" class="my-0.5 h-px bg-neutral-200 mx-2"></div>
  <button
    v-bind="$attrs"
    class="grid grid-cols-[minmax(0,_1fr)_auto] w-[calc(100%_-_0.75rem)] mx-1.5 my-0.5 items-center rounded-lg px-2.5 py-1.5 text-sm cursor-pointer transition-colors outline-none"
    :class="[
      destructive ? 'text-red-600 hover:bg-red-100' : 'text-neutral-950 hover:bg-neutral-200',
      active && !destructive ? 'bg-neutral-200' : '',
    ]"
    @click="handleClick"
  >
    <!-- Content container (icon + text) -->
    <div class="flex items-center gap-2 w-full min-w-0">
      <!-- Icon container - fixed width for alignment -->
      <div class="flex items-center justify-center w-[20px] h-[20px] flex-shrink-0">
        <slot name="icon" />
      </div>
      <!-- Text -->
      <span class="truncate text-sm">{{ text }}</span>
    </div>
    <!-- Right icon (optional) -->
    <div v-if="$slots['icon-right']" class="flex items-center justify-center flex-shrink-0 text-neutral-600 ml-2">
      <slot name="icon-right" />
    </div>
  </button>
</template>
