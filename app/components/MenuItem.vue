<script setup lang="ts">
const props = defineProps<{
  text: string
  hasDivider?: boolean
  destructive?: boolean
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
    class="grid grid-cols-[minmax(0,_1fr)_auto] w-full items-center px-3 py-1.5 text-sm cursor-pointer transition-colors outline-none"
    :class="destructive ? 'text-red-600 hover:bg-red-50' : 'text-neutral-950 hover:bg-neutral-100'"
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
