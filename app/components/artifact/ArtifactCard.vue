<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const props = defineProps<{
  artifact: SandboxArtifact
  selected?: boolean
  // True when a multi-select is in progress (≥1 card selected anywhere). In
  // that mode a plain card click toggles selection instead of opening, and the
  // checkbox is always visible.
  selecting?: boolean
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
  toggleSelect: [artifact: SandboxArtifact]
}>()

// In selection mode the whole card toggles selection; otherwise it opens.
function onCardClick() {
  if (props.selecting) emit('toggleSelect', props.artifact)
  else emit('open', props.artifact)
}

const { t } = useI18n()
const { relativeOrAbsoluteTime } = useRelativeTime()

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

function toggleMenu(e: MouseEvent) {
  e.stopPropagation()
  menuOpen.value = !menuOpen.value
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (menuRef.value?.contains(target)) return
  if (triggerRef.value?.contains(target)) return
  menuOpen.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const previewLines = computed(() => {
  if (!props.artifact.content) return ''
  return props.artifact.content.split('\n').slice(0, 4).join('\n')
})

// Uppercase extension for the corner chip — the fastest way to scan a wall of
// files. Falls back to nothing when the name has no extension.
const ext = computed(() => {
  const parts = props.artifact.name.split('.')
  if (parts.length < 2) return ''
  return (parts.pop() || '').toUpperCase().slice(0, 5)
})

const typeIcon = computed(() => {
  switch (props.artifact.type) {
    case 'image': return 'image'
    case 'code': return 'code'
    case 'document': return 'document'
    case 'video': return 'video'
    case 'audio': return 'audio'
    case 'archive': return 'archive'
    default: return 'file'
  }
})

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

// "Document · 1.0 KB · 5 min ago" — the time segment is empty during SSR (see
// useRelativeTime) so it's dropped until hydration to avoid a trailing dot.
const meta = computed(() => {
  const parts = [typeLabel.value, formatSize(props.artifact.size)]
  const time = relativeOrAbsoluteTime(props.artifact.createdAt)
  if (time) parts.push(time)
  return parts.join(' · ')
})
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-left transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    :class="selected ? 'border-neutral-950 ring-2 ring-neutral-950' : 'border-neutral-200 hover:border-neutral-300'"
    @click="onCardClick"
    @keydown.enter.prevent="onCardClick"
    @keydown.space.prevent="onCardClick"
  >
    <div class="relative w-full aspect-[4/3] bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
      <template v-if="artifact.type === 'image' && artifact.url">
        <img
          :src="artifact.url"
          :alt="artifact.name"
          class="w-full h-full object-cover"
          loading="lazy"
        />
      </template>
      <template v-else-if="artifact.content">
        <div class="w-full h-full p-3 overflow-hidden">
          <pre class="text-[10px] leading-tight font-mono text-neutral-500 whitespace-pre-wrap break-all">{{ previewLines }}</pre>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col items-center gap-1.5">
          <svg v-if="typeIcon === 'image'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <svg v-else-if="typeIcon === 'code'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          <svg v-else-if="typeIcon === 'video'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m22 8-6 4 6 4V8Z" /><rect x="2" y="6" width="14" height="12" rx="2" />
          </svg>
          <svg v-else-if="typeIcon === 'audio'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          <svg v-else-if="typeIcon === 'archive'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
          </svg>
          <svg v-else-if="typeIcon === 'document'" class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <svg v-else class="size-8 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="text-[10px] text-neutral-400">{{ t('artifacts.noPreviewShort') }}</span>
        </div>
      </template>

      <!-- Extension chip — top-left; fades out when the select checkbox shows -->
      <div
        v-if="ext"
        class="absolute left-2 top-2 z-10 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-600 ring-1 ring-neutral-200 backdrop-blur-sm transition-opacity group-hover:opacity-0"
        :class="(selected || selecting) ? 'opacity-0' : ''"
      >
        {{ ext }}
      </div>

      <!-- Select checkbox — visible on hover, or always while selecting -->
      <button
        type="button"
        :aria-label="t('artifacts.select')"
        class="absolute left-2 top-2 z-20 grid size-5 place-items-center rounded-md border backdrop-blur-sm transition-all"
        :class="[
          selected ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 bg-white/90 text-transparent',
          (selected || selecting) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ]"
        @click.stop="emit('toggleSelect', artifact)"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </button>

      <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <!-- Hover actions: quick download + overflow menu -->
      <div class="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          :aria-label="t('artifacts.download')"
          :title="t('artifacts.download')"
          class="flex items-center justify-center size-7 rounded-md bg-white/90 backdrop-blur-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-white shadow-sm transition-colors"
          @click.stop="emit('download', artifact)"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>

        <div ref="triggerRef" @click="toggleMenu">
          <button
            type="button"
            class="flex items-center justify-center size-7 rounded-md bg-white/90 backdrop-blur-sm border border-neutral-200 text-neutral-600 hover:text-neutral-950 hover:bg-white shadow-sm transition-colors"
            @click.stop="toggleMenu"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" />
            </svg>
          </button>

          <div
            v-if="menuOpen"
            ref="menuRef"
            class="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg bg-white shadow-lg ring-1 ring-neutral-200 overflow-hidden"
            @click.stop
          >
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer"
              @click="emit('download', artifact); menuOpen = false"
            >
              <svg class="size-3.5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {{ t('artifacts.download') }}
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer"
              @click="emit('save', artifact); menuOpen = false"
            >
              <svg class="size-3.5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              {{ t('artifacts.saveToStorage') }}
            </button>
            <div class="my-0.5 h-px bg-neutral-200 mx-2" />
            <button
              type="button"
              class="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              @click="emit('delete', artifact); menuOpen = false"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {{ t('artifacts.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-0.5 p-3 min-w-0">
      <span class="text-sm font-medium text-neutral-950 truncate leading-snug">{{ artifact.name }}</span>
      <span class="text-meta text-neutral-500 truncate">{{ meta }}</span>
    </div>
  </div>
</template>
