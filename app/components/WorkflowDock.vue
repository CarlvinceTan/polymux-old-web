<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div
    class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain border-neutral-200/90 md:w-auto md:min-h-0 md:min-w-0 md:border-r bg-neutral-50"
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3">
      <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <div class="mx-auto w-full text-center">
          <div class="flex flex-col items-center justify-center gap-3 text-neutral-400">
            <svg
              class="size-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <path d="M10.5 10.5h3M10.5 17.5h3M10.5 3.5v3" />
            </svg>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-medium text-neutral-500">Workflow steps</p>
              <p class="text-xs text-neutral-400">Node-based workflow visualization coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
