<script setup lang="ts">
defineProps<{
  icon: string
  label: string
  /** When true, the icon renders as a filled-black "selected" state instead of
   *  the default outline + neutral-400 idle. Used by toggleable actions like
   *  thumbs-up / thumbs-down. */
  active?: boolean
}>()
</script>

<template>
  <div class="group/action relative">
    <button
      type="button"
      class="flex size-5 items-center justify-center rounded-md transition-colors"
      :class="active
        ? 'text-neutral-900'
        : 'text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-900'"
      :aria-label="label"
      :aria-pressed="active"
    >
      <UIcon :name="icon" class="size-3" />
    </button>
    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100">
      {{ label }}
    </span>
  </div>
</template>
