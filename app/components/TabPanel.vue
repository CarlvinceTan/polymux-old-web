<script setup lang="ts">
/**
 * Shell panel: ghost-panel, rounded corners, optional header + scroll body + optional footer.
 *
 * - No header slots → scroll body only (optionally with footer).
 * - #title and/or #actions → title row; full-width divider below the header block.
 * - #header → replaces title/actions; minimal inset padding; full-width divider below.
 * - Default slot → no body padding; pages add their own inset if needed.
 * - #footer → e.g. PromptInput; full-width divider above; padded footer slot.
 *
 * Dividers span the full inner width of the panel (edge to edge inside the rounded chrome).
 */
defineSlots<{
  header?: () => unknown
  title?: () => unknown
  actions?: () => unknown
  default?: () => unknown
  footer?: () => unknown
}>()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="ghost-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-[1.25rem] bg-white">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem]">
        <template v-if="$slots.header || $slots.title || $slots.actions">
          <div class="shrink-0">
            <div class="px-3 py-2.5 sm:px-4 sm:py-3">
              <slot v-if="$slots.header" name="header" />
              <template v-else>
                <div class="flex items-center justify-between gap-5">
                  <div class="min-w-0 flex-1">
                    <slot name="title" />
                  </div>
                  <div v-if="$slots.actions" class="flex shrink-0 items-start">
                    <slot name="actions" />
                  </div>
                </div>
              </template>
            </div>
            <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />
          </div>
        </template>

        <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <!-- Sole body child (typical padded wrapper) becomes a flex column so children like Placeholder can use flex-1. -->
          <div class="flex min-h-0 min-w-0 flex-1 flex-col *:only:flex *:only:min-h-0 *:only:flex-1 *:only:flex-col">
            <slot />
          </div>
        </div>

        <template v-if="$slots.footer">
          <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />
          <div class="shrink-0 p-2.5 sm:p-3">
            <slot name="footer" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
