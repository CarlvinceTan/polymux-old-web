<script setup lang="ts">
// Viewport props for browser preview and agent status (preview area is fixed 16:9)
const props = withDefaults(defineProps<{
  isLoading?: boolean
  url?: string
  agentName?: string
  currentAction?: string
  isWorking?: boolean
  isDone?: boolean
  /** Traffic lights + URL bar (default on; set false to hide, e.g. chat thumbnails) */
  showBar?: boolean
  /** When false, status line shows only `agentName` (no `currentAction`); StatusLine unchanged */
  showActionText?: boolean
  /** Tighter typography + status for horizontal thumbnail strips */
  thumbnail?: boolean
  /** Red traffic light — e.g. close/remove browser */
  onTrafficRed?: () => void
  /** Yellow — e.g. demote to thumbnail strip */
  onTrafficYellow?: () => void
  /** Green — e.g. toggle expanded / modal view */
  onTrafficGreen?: () => void
}>(), {
  isLoading: true,
  url: 'localhost:3001/instance_alpha/preview/session/very-long-url-to-demonstrate-truncation',
  agentName: 'SUBAGENT 01',
  currentAction: 'REFACTORING...',
  isWorking: true,
  isDone: false,
  showBar: true,
  showActionText: true,
  thumbnail: false,
})

function redClick(e: Event) {
  e.stopPropagation()
  props.onTrafficRed?.()
}

function yellowClick(e: Event) {
  e.stopPropagation()
  props.onTrafficYellow?.()
}

function greenClick(e: Event) {
  e.stopPropagation()
  props.onTrafficGreen?.()
}
</script>

<template>
  <div
    class="flex w-full max-w-full flex-none flex-col"
    :class="thumbnail ? 'gap-1.5 overflow-visible' : 'gap-4'"
  >
    <!-- Outer: shadow + border paint outside clip; inner: rounds + clips chrome content -->
    <div
      class="ghost-panel flex w-full max-w-full flex-col overflow-visible rounded-lg"
    >
      <div
        class="flex w-full max-w-full flex-col overflow-hidden rounded-lg bg-white"
      >
        <!-- Browser title bar with traffic lights and URL -->
        <div
          v-if="showBar"
          class="relative flex h-9 items-center bg-surface-container px-3"
        >
          <div
            class="group/traffic flex shrink-0 items-center gap-1.5"
            :class="onTrafficRed || onTrafficYellow || onTrafficGreen ? 'cursor-auto' : 'cursor-default'"
          >
            <button
              v-if="onTrafficRed"
              type="button"
              class="flex h-2.5 w-2.5 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-[#ff5f56] p-0 ring-0"
              aria-label="Close browser"
              @click="redClick"
            >
              <UIcon
                name="i-heroicons-x-mark"
                class="size-2 text-[#4c0000] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </button>
            <div
              v-else
              class="flex h-2.5 w-2.5 items-center justify-center overflow-hidden rounded-full bg-[#ff5f56]"
            >
              <UIcon
                name="i-heroicons-x-mark"
                class="size-2 text-[#4c0000] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </div>

            <button
              v-if="onTrafficYellow"
              type="button"
              class="flex h-2.5 w-2.5 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-[#ffbd2e] p-0 ring-0"
              aria-label="Move to thumbnail row"
              @click="yellowClick"
            >
              <UIcon
                name="i-heroicons-minus"
                class="size-2 text-[#995700] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </button>
            <div
              v-else
              class="flex h-2.5 w-2.5 items-center justify-center overflow-hidden rounded-full bg-[#ffbd2e]"
            >
              <UIcon
                name="i-heroicons-minus"
                class="size-2 text-[#995700] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </div>

            <button
              v-if="onTrafficGreen"
              type="button"
              class="flex h-2.5 w-2.5 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-[#27c93f] p-0 ring-0"
              aria-label="Expand preview"
              @click="greenClick"
            >
              <UIcon
                name="i-heroicons-plus"
                class="size-2 text-[#006500] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </button>
            <div
              v-else
              class="flex h-2.5 w-2.5 items-center justify-center overflow-hidden rounded-full bg-[#27c93f]"
            >
              <UIcon
                name="i-heroicons-plus"
                class="size-2 text-[#006500] opacity-0 transition-opacity group-hover/traffic:opacity-100"
              />
            </div>
          </div>

          <div class="ml-3.5 flex min-w-0 flex-1 justify-start">
            <span
              class="max-w-[min(50%,280px)] truncate font-mono text-body-md text-secondary"
            >
              {{ url }}
            </span>
          </div>
        </div>

        <!-- Preview: fixed 16:9 (padding-bottom % of width — immune to flex/grid stretch breaking aspect-ratio) -->
        <div class="relative w-full bg-neutral-50">
          <div class="relative w-full pb-[56.25%]">
            <div class="absolute inset-0 overflow-hidden bg-neutral-50">
              <div
                v-if="isLoading"
                class="absolute inset-0 flex w-full flex-col"
                :class="thumbnail ? 'gap-2 p-2' : 'gap-6 p-8'"
              >
                <div
                  class="animate-pulse rounded-full bg-neutral-200/80"
                  :class="thumbnail ? 'h-2 w-[58%]' : 'h-4 w-2/3'"
                />
                <div
                  class="animate-pulse rounded-full bg-neutral-200/70 opacity-90"
                  :class="thumbnail ? 'h-2 w-full' : 'h-4 w-full'"
                />
                <div
                  class="animate-pulse rounded-full bg-neutral-200/60 opacity-70"
                  :class="thumbnail ? 'h-2 w-[42%]' : 'h-4 w-2/4'"
                />
              </div>
              <slot />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Below the rounded panel -->
    <div
      class="flex gap-2"
      :class="thumbnail
        ? 'items-center justify-center px-0'
        : 'items-baseline justify-between px-1'
      "
    >
      <div
        class="flex min-w-0 items-center font-mono tracking-wide"
        :class="thumbnail ? 'gap-1 text-2xs text-neutral-600 sm:text-caption' : 'gap-3 text-body-md'"
      >
        <div class="flex min-w-0 items-baseline gap-1">
          <span
            class="shrink-0 truncate font-bold uppercase"
            :class="thumbnail ? 'text-neutral-600' : 'text-secondary'"
          >{{ agentName }}<template v-if="showActionText">:</template></span>
          <span
            v-if="showActionText"
            class="min-w-0 truncate font-medium uppercase"
            :class="thumbnail ? 'text-neutral-500' : 'text-secondary/80'"
          >{{ currentAction }}</span>
        </div>
      </div>

      <StatusLine :is-working="isWorking" :is-done="isDone" :small="thumbnail" />
    </div>
  </div>
</template>
