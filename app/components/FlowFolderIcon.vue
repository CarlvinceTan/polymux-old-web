<script setup lang="ts">
defineProps<{ open: boolean }>()
</script>

<template>
  <span class="flex h-[20px] w-[28px] shrink-0 items-center justify-center text-neutral-950" aria-hidden="true">
    <UIcon v-if="open" name="i-lucide-folder-open" class="shrink-0" style="width: 16px; height: 16px" />
    <UIcon v-else name="i-lucide-folder-closed" class="shrink-0" style="width: 16px; height: 16px" />
  </span>
</template>
