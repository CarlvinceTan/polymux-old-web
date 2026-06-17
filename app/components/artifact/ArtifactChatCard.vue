<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'
import { formatBytesShort } from '~/composables/storage/useStorageUsage'

const props = defineProps<{
  artifact: SandboxArtifact
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()

const typeLabel = computed(() => {
  switch (props.artifact.type) {
    case 'image': return t('artifacts.typeImage')
    case 'code': return t('artifacts.typeCode')
    case 'document': return t('artifacts.typeDocument')
    case 'video': return t('artifacts.typeVideo')
    case 'audio': return t('artifacts.typeAudio')
    case 'archive': return t('artifacts.typeArchive')
    default: return t('artifacts.typeOther')
  }
})

// Type label, with a size suffix when the artifact has a known byte count.
// Sandbox-created code artifacts often report size 0, in which case the bar
// shows just the type so the meta line never reads "Code · 0 B".
const subtitle = computed(() => {
  const size = props.artifact.size > 0 ? formatBytesShort(props.artifact.size) : ''
  return size ? `${typeLabel.value} · ${size}` : typeLabel.value
})

const showThumb = computed(() => props.artifact.type === 'image' && !!props.artifact.url)
</script>

<template>
  <!-- Full-width bar: leading type icon (or image thumbnail), file name with a
       type·size meta line, and a trailing chevron. Clicking routes to the
       artifacts surface for this artifact (handled by the parent's @open). -->
  <button
    type="button"
    data-testid="artifact-chat-card"
    :aria-label="`${t('chat.openArtifactRef')} — ${artifact.name}`"
    class="group my-2 flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white py-2.5 pr-3 pl-2.5 text-left shadow-sm ring-1 ring-neutral-950/5 transition hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    @click="emit('open', artifact)"
  >
    <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-500">
      <img
        v-if="showThumb"
        :src="artifact.url"
        :alt="artifact.name"
        class="size-full object-cover"
        loading="lazy"
      >
      <svg v-else-if="artifact.type === 'image'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
      <svg v-else-if="artifact.type === 'code'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
      <svg v-else-if="artifact.type === 'video'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" />
      </svg>
      <svg v-else-if="artifact.type === 'audio'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
      <svg v-else-if="artifact.type === 'archive'" class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
      </svg>
      <svg v-else class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    </span>

    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm font-medium text-neutral-900">{{ artifact.name }}</span>
      <span class="truncate text-[11px] text-neutral-500">{{ subtitle }}</span>
    </span>

    <svg
      class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</template>
