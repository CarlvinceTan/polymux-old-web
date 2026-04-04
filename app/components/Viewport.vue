<script setup lang="ts">
// Viewport props for browser preview and agent status
const props = withDefaults(defineProps<{
  isLoading?: boolean;
  url?: string;
  agentName?: string;
  currentAction?: string;
  isWorking?: boolean;
  isDone?: boolean;
  /** Tighter chrome for grid layouts */
  compact?: boolean;
}>(), {
  isLoading: true,
  url: 'localhost:3001/instance_alpha/preview/session/very-long-url-to-demonstrate-truncation',
  agentName: 'SUBAGENT 01',
  currentAction: 'REFACTORING...',
  isWorking: true,
  isDone: false,
  compact: false,
});
</script>

<template>
  <div class="flex w-full flex-col gap-4" :class="compact ? 'gap-1.5' : 'h-full'">
    <!-- Browser chrome container -->
    <div class="ghost-panel flex w-full flex-col overflow-hidden rounded-lg bg-white">
      <!-- Browser title bar with traffic lights and URL -->
      <div class="relative flex items-center bg-neutral-100/90" :class="compact
          ? 'min-h-6 px-0 py-px'
          : 'h-9 bg-surface-container px-3'
        ">
        <!-- Traffic light buttons (close/minimize/maximize) -->
        <div class="group/traffic flex shrink-0 cursor-default items-center" :class="compact ? 'gap-1 pl-2.5' : 'gap-1.5'">
          <!-- Close button (red) -->
          <div class="flex items-center justify-center overflow-hidden rounded-full bg-[#ff5f56]"
            :class="compact ? 'h-2 w-2' : 'h-2.5 w-2.5'">
            <UIcon name="i-heroicons-x-mark"
              class="text-[#4c0000] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              :class="compact ? 'size-1.5' : 'size-2'" />
          </div>
          <!-- Minimize button (yellow) -->
          <div class="flex items-center justify-center overflow-hidden rounded-full bg-[#ffbd2e]"
            :class="compact ? 'h-2 w-2' : 'h-2.5 w-2.5'">
            <UIcon name="i-heroicons-minus"
              class="text-[#995700] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              :class="compact ? 'size-1.5' : 'size-2'" />
          </div>
          <!-- Maximize button (green) -->
          <div class="flex items-center justify-center overflow-hidden rounded-full bg-[#27c93f]"
            :class="compact ? 'h-2 w-2' : 'h-2.5 w-2.5'">
            <UIcon name="i-heroicons-plus"
              class="text-[#006500] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              :class="compact ? 'size-1.5' : 'size-2'" />
          </div>
        </div>

        <!-- URL display -->
        <div class="flex min-w-0 flex-1 justify-start" :class="compact ? 'ml-3 pr-1.5' : 'ml-3.5'">
          <span class="truncate font-mono text-secondary" :class="compact
              ? 'max-w-[92%] text-caption leading-tight text-neutral-400'
              : 'max-w-[min(50%,280px)] rounded-md bg-surface-container-high px-2.5 py-0.5 text-body-md'
            ">
            {{ url }}
          </span>
        </div>
      </div>

      <!-- Preview content area -->
      <div class="relative flex w-full flex-col bg-neutral-50">
        <div class="relative aspect-video w-full overflow-hidden bg-neutral-50">
          <!-- Loading skeleton state -->
          <div v-if="isLoading" class="absolute inset-0 flex w-full flex-col gap-2 p-3"
            :class="compact ? 'gap-2 p-0' : 'gap-6 p-8'">
            <div class="rounded-full bg-neutral-200/80 animate-pulse" :class="compact ? 'h-2 w-[58%]' : 'h-4 w-2/3'" />
            <div class="rounded-full bg-neutral-200/70 opacity-90 animate-pulse"
              :class="compact ? 'h-2 w-full' : 'h-4 w-full'" />
            <div class="rounded-full bg-neutral-200/60 opacity-70 animate-pulse"
              :class="compact ? 'h-2 w-[42%]' : 'h-4 w-2/4'" />
          </div>
          <slot />
        </div>
      </div>
    </div>

    <!-- Agent status bar -->
    <div class="flex items-baseline justify-between gap-2" :class="compact ? 'px-0' : 'px-1'">
      <!-- Agent name and current action -->
      <div class="flex min-w-0 items-center gap-2 font-mono"
        :class="compact ? 'text-2xs tracking-wide sm:text-caption' : 'gap-3 text-body-md tracking-wide'">
        <!-- Terminal icon -->
        <div v-if="!compact"
          class="flex items-center rounded bg-surface-container-low px-1.5 py-0.5 text-secondary outline outline-outline-variant/15">
          <span class="text-xs font-bold">>_</span>
        </div>
        <div class="flex min-w-0 items-baseline gap-1">
          <span class="shrink-0 font-bold uppercase text-neutral-500"
            :class="compact ? 'text-neutral-600' : 'text-secondary'">{{ agentName }}:</span>
          <span class="min-w-0 truncate uppercase text-neutral-400"
            :class="compact ? 'font-semibold text-neutral-500' : 'font-medium text-secondary/80'">{{ currentAction
            }}</span>
        </div>
      </div>

      <StatusLine :is-working="isWorking" :is-done="isDone" :compact="compact" />
    </div>
  </div>
</template>
