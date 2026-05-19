<script setup lang="ts">
const { t } = useI18n()

const props = withDefaults(defineProps<{
  name: string
  status?: 'uploading' | 'done' | 'error'
  progress?: number
  removable?: boolean
  /** Constrain width so two chips + gap fill the row */
  halfRow?: boolean
}>(), {
  status: 'done',
  progress: 100,
  removable: true,
  halfRow: false,
})

const emit = defineEmits<{
  remove: []
}>()

const RADIUS = 5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() => CIRCUMFERENCE - (props.progress / 100) * CIRCUMFERENCE)
</script>

<template>
  <div
    class="flex h-5 min-w-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-tight transition-colors"
    :class="[
      halfRow ? 'max-w-[calc(50%_-_0.1875rem)]' : '',
      status === 'error'
        ? 'bg-red-50 text-red-700'
        : 'bg-neutral-100 text-neutral-700',
    ]"
  >
    <svg
      v-if="status === 'uploading'"
      class="size-3 shrink-0 -rotate-90"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" :r="RADIUS" fill="none" stroke="currentColor" stroke-width="1.5" class="text-neutral-300" />
      <circle
        cx="6" cy="6" :r="RADIUS" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round"
        class="text-neutral-900 transition-[stroke-dashoffset] duration-200"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>

    <UIcon
      v-else-if="status === 'error'"
      name="i-heroicons-exclamation-circle-20-solid"
      class="size-3 shrink-0 text-red-500"
      aria-hidden="true"
    />
    <UIcon
      v-else
      name="i-heroicons-document-20-solid"
      class="size-3 shrink-0 text-neutral-400"
      aria-hidden="true"
    />

    <span class="min-w-0 truncate" :title="name">{{ name }}</span>

    <button
      v-if="removable"
      type="button"
      class="-mr-0.5 flex size-3.5 shrink-0 items-center justify-center rounded transition-opacity hover:opacity-60"
      :aria-label="t('chat.removeAttachment')"
      @click.stop="emit('remove')"
    >
      <UIcon name="i-heroicons-x-mark-20-solid" class="size-3" />
    </button>
  </div>
</template>
