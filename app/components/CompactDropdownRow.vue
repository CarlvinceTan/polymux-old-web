<script setup lang="ts">
const props = defineProps<{
  text: string
  hasDivider?: boolean
  destructive?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  emit('click')
}
</script>

<template>
  <div v-if="hasDivider" class="my-0.5 h-px bg-neutral-200 mx-2"></div>
  <button
    class="flex w-full items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors"
    :class="destructive ? 'text-red-600 hover:bg-red-50' : 'text-neutral-950 hover:bg-neutral-100'"
    @click="handleClick"
  >
    <!-- Icon container - fixed width for alignment -->
    <div class="flex items-center justify-center w-[20px] h-[20px] shrink-0">
      <slot name="icon" />
    </div>
    <!-- Text - always starts at same position -->
    <span class="truncate">{{ text }}</span>
  </button>
</template>
