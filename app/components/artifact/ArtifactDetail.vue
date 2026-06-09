<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const props = defineProps<{
  artifact: SandboxArtifact
  getDownloadUrl?: (artifactId: string) => Promise<string | null>
}>()

const emit = defineEmits<{
  close: []
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()

type ViewMode = 'preview' | 'raw'

const viewMode = ref<ViewMode>('preview')
const rawText = ref<string | null>(null)
const rawTextArtifactId = ref<string | null>(null)
const rawLoading = ref(false)
const rawError = ref('')
const previewObjectUrl = ref<string | null>(null)

const fileExtension = computed(() => {
  const ext = props.artifact.name.split('.').pop()?.toLowerCase() ?? ''
  return ext
})

const isHtml = computed(() =>
  props.artifact.mimeType === 'text/html' || fileExtension.value === 'html' || fileExtension.value === 'htm',
)

const isPdf = computed(() =>
  props.artifact.mimeType === 'application/pdf' || fileExtension.value === 'pdf',
)

const previewSrc = computed(() => props.artifact.url ?? previewObjectUrl.value ?? '')

const previewKind = computed<'image' | 'video' | 'audio' | 'html' | 'pdf' | null>(() => {
  if (!previewSrc.value) return null
  if (props.artifact.type === 'image') return 'image'
  if (props.artifact.type === 'video') return 'video'
  if (props.artifact.type === 'audio') return 'audio'
  if (isHtml.value) return 'html'
  if (isPdf.value) return 'pdf'
  return null
})

const canPreview = computed(() => previewKind.value !== null)
const canShowRaw = computed(() =>
  typeof props.artifact.content === 'string' || Boolean(props.artifact.url || props.getDownloadUrl),
)
const effectiveViewMode = computed<ViewMode>(() =>
  viewMode.value === 'preview' && !canPreview.value ? 'raw' : viewMode.value,
)

function revokePreviewObjectUrl() {
  if (!previewObjectUrl.value) return
  URL.revokeObjectURL(previewObjectUrl.value)
  previewObjectUrl.value = null
}

watch(
  [() => props.artifact.id, () => props.artifact.content, isHtml, isPdf],
  () => {
    revokePreviewObjectUrl()
    if (!import.meta.client || typeof props.artifact.content !== 'string' || (!isHtml.value && !isPdf.value)) return
    const type = props.artifact.mimeType ?? (isPdf.value ? 'application/pdf' : 'text/html')
    previewObjectUrl.value = URL.createObjectURL(new Blob([props.artifact.content], { type }))
  },
  { immediate: true },
)

onBeforeUnmount(revokePreviewObjectUrl)

watch(
  () => props.artifact.id,
  () => {
    viewMode.value = 'preview'
    rawText.value = null
    rawTextArtifactId.value = null
    rawLoading.value = false
    rawError.value = ''
  },
  { immediate: true },
)

async function ensureRawText() {
  if (typeof props.artifact.content === 'string') return
  if (rawTextArtifactId.value === props.artifact.id && rawText.value !== null) return
  const artifactId = props.artifact.id
  rawLoading.value = true
  rawError.value = ''
  try {
    const url = props.artifact.url ?? await props.getDownloadUrl?.(artifactId)
    if (props.artifact.id !== artifactId) return
    if (!url) {
      rawError.value = t('artifacts.rawUnavailable')
      return
    }
    const response = await fetch(url)
    if (!response.ok) {
      rawError.value = t('artifacts.rawLoadStatus', { status: response.status })
      return
    }
    const text = await response.text()
    if (props.artifact.id !== artifactId) return
    rawText.value = text
    rawTextArtifactId.value = artifactId
  }
  catch (err) {
    console.error('[ArtifactDetail] raw fetch failed', err)
    rawError.value = t('artifacts.rawLoadError')
  }
  finally {
    if (props.artifact.id === artifactId) rawLoading.value = false
  }
}

watch(
  [effectiveViewMode, () => props.artifact.id],
  () => {
    if (effectiveViewMode.value === 'raw') void ensureRawText()
  },
  { immediate: true },
)

function selectViewMode(mode: ViewMode) {
  if (mode === 'preview' && !canPreview.value) return
  if (mode === 'raw' && !canShowRaw.value) return
  viewMode.value = mode
  if (mode === 'raw') void ensureRawText()
}

const rawDisplayText = computed(() => props.artifact.content ?? rawText.value ?? '')
const rawLines = computed(() => {
  const text = rawDisplayText.value
  return text ? text.replace(/\r\n/g, '\n').split('\n') : []
})
const lineCount = computed(() => rawLines.value.length)

const langClass = computed(() => {
  const ext = fileExtension.value
  const map: Record<string, string> = {
    ts: 'language-typescript', tsx: 'language-typescript',
    js: 'language-javascript', jsx: 'language-javascript',
    vue: 'language-html', html: 'language-html',
    css: 'language-css', scss: 'language-css',
    py: 'language-python', go: 'language-go',
    rs: 'language-rust', rb: 'language-ruby',
    java: 'language-java', c: 'language-c', cpp: 'language-cpp',
    sh: 'language-bash', bash: 'language-bash',
    yaml: 'language-yaml', yml: 'language-yaml',
    json: 'language-json', xml: 'language-xml',
    sql: 'language-sql', md: 'language-markdown',
  }
  return map[ext] ?? ''
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 shrink-0">
      <div class="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          class="flex items-center justify-center size-7 rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition-colors shrink-0"
          :aria-label="t('common.back')"
          @click="emit('close')"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-semibold text-neutral-950 truncate">{{ artifact.name }}</span>
          <span class="text-meta text-neutral-500">
            {{ formatSize(artifact.size) }}<template v-if="lineCount > 0"> &middot; {{ lineCount }} lines</template>
          </span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <div
          v-if="canPreview || canShowRaw"
          class="mr-2 flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5"
          :aria-label="t('artifacts.viewMode')"
        >
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="effectiveViewMode === 'preview' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-950'"
            :disabled="!canPreview"
            @click="selectViewMode('preview')"
          >
            {{ t('artifacts.preview') }}
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="effectiveViewMode === 'raw' ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-950'"
            :disabled="!canShowRaw"
            @click="selectViewMode('raw')"
          >
            {{ t('artifacts.raw') }}
          </button>
        </div>
        <button
          type="button"
          class="flex items-center justify-center size-8 rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
          :aria-label="t('artifacts.download')"
          @click="emit('download', artifact)"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          type="button"
          class="flex items-center justify-center size-8 rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
          :aria-label="t('artifacts.saveToStorage')"
          @click="emit('save', artifact)"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
          </svg>
        </button>
        <button
          type="button"
          class="flex items-center justify-center size-8 rounded-md text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          :aria-label="t('artifacts.delete')"
          @click="emit('delete', artifact)"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
      <template v-if="effectiveViewMode === 'preview' && canPreview">
        <template v-if="previewKind === 'image'">
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 bg-neutral-50">
          <img
            :src="previewSrc"
            :alt="artifact.name"
            class="max-w-full max-h-full object-contain rounded-lg shadow-sm"
          />
        </div>
        </template>
        <template v-else-if="previewKind === 'video'">
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 bg-neutral-950">
          <video
            :src="previewSrc"
            controls
            class="max-w-full max-h-full rounded-lg"
          />
        </div>
      </template>
        <template v-else-if="previewKind === 'audio'">
          <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 bg-neutral-50">
            <audio
              :src="previewSrc"
              controls
              class="w-full max-w-xl"
            />
          </div>
        </template>
        <template v-else-if="previewKind === 'html'">
          <iframe
            :src="previewSrc"
            :title="artifact.name"
            sandbox="allow-forms allow-popups allow-scripts"
            class="min-h-0 min-w-0 flex-1 border-0 bg-white"
          />
        </template>
        <template v-else-if="previewKind === 'pdf'">
          <iframe
            :src="previewSrc"
            :title="artifact.name"
            class="min-h-0 min-w-0 flex-1 border-0 bg-white"
          />
        </template>
      </template>
      <template v-else-if="effectiveViewMode === 'raw' && canShowRaw">
        <div v-if="rawLoading && !rawDisplayText" class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-8 text-sm text-neutral-500">
          {{ t('artifacts.rawLoading') }}
        </div>
        <div v-else-if="rawError && !rawDisplayText" class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-8 text-center bg-neutral-50">
          <svg class="size-10 text-neutral-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <p class="text-sm text-neutral-500 font-medium">{{ rawError }}</p>
        </div>
        <div v-else class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div class="shrink-0 py-4 pl-4 pr-2 text-right select-none bg-neutral-50 border-r border-neutral-200">
            <div
              v-for="(_, index) in rawLines"
              :key="index"
              class="text-[11px] leading-[1.6] font-mono text-neutral-400"
            >
              {{ index + 1 }}
            </div>
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto py-4 px-4">
            <pre
              class="text-[12px] leading-[1.6] font-mono text-neutral-800 whitespace-pre"
              :class="langClass"
            ><code>{{ rawDisplayText }}</code></pre>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-8 text-center bg-neutral-50">
          <svg class="size-10 text-neutral-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <p class="text-sm text-neutral-500 font-medium">{{ t('artifacts.noPreview') }}</p>
          <p class="text-meta text-neutral-400 mt-1">{{ t('artifacts.noPreviewDesc') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
