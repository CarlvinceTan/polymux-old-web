<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    initials: string
    color?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Optional box+text size override (e.g. 'h-5 w-5 text-[10px]') for sizes outside the preset scale. */
    sizeClass?: string
    role?: string
    ariaLabel?: string
  }>(),
  {
    color: 'bg-neutral-950',
    size: 'md',
    sizeClass: undefined,
    role: undefined,
    ariaLabel: undefined,
  },
)

// Limit to maximum 2 characters
const displayInitials = computed(() => {
  return props.initials.slice(0, 2).toUpperCase()
})

// Size classes with constant text-to-box ratio of 50%
// Box sizes: 16px (sm), 24px (md), 30px (lg)
// Text sizes: 8px (sm), 12px (md), 15px (lg) - all 50% of box
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-4 w-4 text-[8px]'
    case 'md':
      return 'h-6 w-6 text-[12px]'
    case 'lg':
      return 'h-8 w-8 text-[16px]'
    case 'xl':
      return 'h-10 w-10 text-[20px]'
    default:
      return 'h-[30px] w-[30px] text-[15px]'
  }
})
</script>

<template>
  <div class="flex items-center justify-center rounded-md text-white font-bold shrink-0" :class="[sizeClass || sizeClasses, color]"
    :role="role" :aria-label="ariaLabel" :aria-hidden="ariaLabel ? undefined : 'true'">
    {{ displayInitials }}
  </div>
</template>
