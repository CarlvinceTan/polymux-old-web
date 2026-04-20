<script setup lang="ts">
export type StorageProvider = 'supabase' | 'google-drive' | 'local'

const props = withDefaults(defineProps<{
  provider: StorageProvider
  /** Icon tile fill behind the cloud so the tile border doesn’t show through the outline */
  well?: 'light' | 'muted'
}>(), {
  well: 'light',
})

const wellClass = computed(() => (props.well === 'muted' ? 'bg-neutral-100' : 'bg-white'))

/** Google Drive: coloured mark, same corner placement as before */
const driveBadgeClass = 'pointer-events-none absolute top-0 right-0 z-10 h-5 w-5 translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]'

/**
 * Cloud: rounded knockout matches the file icon well, then outline cloud on top.
 * Slightly larger than the glyph so the tile’s corner border is covered.
 */
const cloudWrapClass = 'pointer-events-none absolute top-0 right-0 z-10 flex size-4 translate-x-1/2 -translate-y-1/2 items-center justify-center text-neutral-600'
</script>

<template>
  <!-- Cloud (Supabase / remote): knockout + outline -->
  <span
    v-if="props.provider === 'supabase'"
    :class="cloudWrapClass"
    aria-hidden="true"
  >
    <svg
      class="size-3 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9Z" />
    </svg>
  </span>

  <!-- Google Drive (brand trapezoids) -->
  <svg
    v-else-if="props.provider === 'google-drive'"
    :class="driveBadgeClass"
    viewBox="0 0 87.3 78"
    aria-hidden="true"
  >
    <path
      fill="#0066DA"
      d="m6.6 66.85 3.85 6.65c.8 1.4 2.3 2.35 4 2.35h60.7c1.75 0 3.35-1 4.15-2.55l9.1-15.75c.8-1.4.8-3.1 0-4.5l-9.1-15.75c-.8-1.4-2.3-2.35-4-2.35h-24.05l-20.05 34.75h20.1c1.75 0 3.35 1 4.15 2.55z"
    />
    <path
      fill="#00AC47"
      d="m43.65 25.52-9.1-15.75c-.8-1.4-2.3-2.35-4-2.35h-20.1c-1.75 0-3.35 1-4.15 2.55l-9.1 15.75c-.8 1.4-.8 3.1 0 4.5l23.75 41.15h21.35l-19.25-33.35c-.8-1.4-.8-3.1 0-4.5z"
    />
    <path
      fill="#EA4335"
      d="m73.35 35.45h-21.35l-20.05 34.75h41.4c1.75 0 3.35-1 4.15-2.55l9.1-15.75c.8-1.4.8-3.1 0-4.5l-9.1-15.75c-.8-1.4-2.3-2.35-4-2.35z"
    />
  </svg>
</template>
