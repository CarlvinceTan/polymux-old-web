<script setup lang="ts">
export type StorageProvider = 'supabase' | 'google-drive' | 'local'

const props = withDefaults(defineProps<{
  provider: StorageProvider
  well?: 'light' | 'muted'
  inline?: boolean
}>(), {
  well: 'light',
  inline: false,
})

const wellClass = computed(() => (props.well === 'muted' ? 'bg-neutral-100' : 'bg-white'))

const driveBadgeClass = computed(() => props.inline
  ? 'shrink-0 size-3'
  : 'pointer-events-none absolute top-0 right-0 z-10 h-5 w-5 translate-x-1/2 -translate-y-1/2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)]')

const cloudWrapClass = computed(() => props.inline
  ? 'shrink-0 flex size-3 items-center justify-center text-neutral-500'
  : 'pointer-events-none absolute top-0 right-0 z-10 flex size-4 translate-x-1/2 -translate-y-1/2 items-center justify-center text-neutral-600')
</script>

<template>
  <!-- Cloud (Supabase / remote): knockout + outline -->
  <span
    v-if="props.provider === 'supabase'"
    :class="cloudWrapClass"
    aria-hidden="true"
  >
    <svg
      :class="props.inline ? 'size-3 shrink-0' : 'size-4 shrink-0'"
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

  <!-- Google Drive (brand triangular prism) -->
  <svg
    v-else-if="props.provider === 'google-drive'"
    :class="driveBadgeClass"
    viewBox="0 0 87.3 78"
    aria-hidden="true"
  >
    <path
      fill="#0066DA"
      d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
    />
    <path
      fill="#00AC47"
      d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z"
    />
    <path
      fill="#EA4335"
      d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
    />
    <path
      fill="#00832D"
      d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
    />
    <path
      fill="#2684FC"
      d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
    />
    <path
      fill="#FFBA00"
      d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
    />
  </svg>
</template>
