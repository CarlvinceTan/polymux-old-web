<script setup lang="ts">
import type { ArtifactType, SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const props = defineProps<{
  artifact: SandboxArtifact
  selected?: boolean
  selecting?: boolean
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
  toggleSelect: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()
const { relativeOrAbsoluteTime } = useRelativeTime()

function typeLabel(type: ArtifactType): string {
  switch (type) {
    case 'image': return t('artifacts.typeImage')
    case 'code': return t('artifacts.typeCode')
    case 'document': return t('artifacts.typeDocument')
    case 'video': return t('artifacts.typeVideo')
    case 'audio': return t('artifacts.typeAudio')
    case 'archive': return t('artifacts.typeArchive')
    default: return t('artifacts.typeOther')
  }
}

const ext = computed(() => {
  const parts = props.artifact.name.split('.')
  if (parts.length < 2) return ''
  return (parts.pop() || '').toUpperCase().slice(0, 5)
})

const iconName = computed<ArtifactType | 'document'>(() =>
  ['image', 'code', 'video', 'audio', 'archive'].includes(props.artifact.type) ? props.artifact.type : 'document',
)

function onRowClick() {
  if (props.selecting) emit('toggleSelect', props.artifact)
  else emit('open', props.artifact)
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-950"
    :class="selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'"
    @click="onRowClick"
    @keydown.enter.prevent="onRowClick"
    @keydown.space.prevent="onRowClick"
  >
    <!-- Select checkbox: visible on hover, or always while selecting -->
    <button
      type="button"
      :aria-label="t('artifacts.select')"
      class="grid size-5 shrink-0 place-items-center rounded-md border transition-all"
      :class="[
        selected ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 text-transparent',
        (selected || selecting) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
      @click.stop="emit('toggleSelect', artifact)"
    >
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </button>

    <div class="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-500">
      <img v-if="artifact.type === 'image' && artifact.url" :src="artifact.url" :alt="artifact.name" class="size-full object-cover" loading="lazy">
      <svg v-else-if="iconName === 'image'" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
      <svg v-else-if="iconName === 'code'" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
      <svg v-else-if="iconName === 'video'" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
      <svg v-else-if="iconName === 'audio'" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
      <svg v-else-if="iconName === 'archive'" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
      <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
    </div>

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium text-neutral-950">{{ artifact.name }}</div>
      <div class="text-meta text-neutral-500">{{ typeLabel(artifact.type) }}</div>
    </div>

    <span class="hidden w-16 shrink-0 text-right text-meta text-neutral-400 sm:block">{{ ext }}</span>
    <span class="w-20 shrink-0 text-right text-meta text-neutral-500">{{ formatSize(artifact.size) }}</span>
    <span class="hidden w-24 shrink-0 text-right text-meta text-neutral-500 sm:block">{{ relativeOrAbsoluteTime(artifact.createdAt) }}</span>

    <div class="flex w-20 shrink-0 justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        :aria-label="t('artifacts.download')"
        :title="t('artifacts.download')"
        class="text-neutral-400 transition-colors hover:text-neutral-950"
        @click.stop="emit('download', artifact)"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      </button>
      <button
        type="button"
        :aria-label="t('artifacts.saveToStorage')"
        :title="t('artifacts.saveToStorage')"
        class="text-neutral-400 transition-colors hover:text-neutral-950"
        @click.stop="emit('save', artifact)"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
      </button>
      <button
        type="button"
        :aria-label="t('artifacts.delete')"
        :title="t('artifacts.delete')"
        class="text-neutral-400 transition-colors hover:text-red-600"
        @click.stop="emit('delete', artifact)"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  </div>
</template>
