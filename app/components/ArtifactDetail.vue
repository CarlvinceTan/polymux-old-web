<script setup lang="ts">
import type { SandboxArtifact } from '~/composables/useArtifacts'

const props = defineProps<{
  artifact: SandboxArtifact
}>()

const emit = defineEmits<{
  close: []
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
}>()

const { t } = useI18n()
const { formatSize } = useArtifacts(inject<Ref<string>>('chat-session-id')!)

const showLineNumbers = ref(true)

const lineCount = computed(() => {
  if (!props.artifact.content) return 0
  return props.artifact.content.split('\n').length
})

const fileExtension = computed(() => {
  const ext = props.artifact.name.split('.').pop()?.toLowerCase() ?? ''
  return ext
})

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
          <span class="text-meta text-neutral-500">{{ formatSize(artifact.size) }} &middot; {{ lineCount }} lines</span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
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
      <template v-if="artifact.type === 'image' && artifact.url">
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 bg-neutral-50">
          <img
            :src="artifact.url"
            :alt="artifact.name"
            class="max-w-full max-h-full object-contain rounded-lg shadow-sm"
          />
        </div>
      </template>
      <template v-else-if="artifact.type === 'video' && artifact.url">
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 bg-neutral-950">
          <video
            :src="artifact.url"
            controls
            class="max-w-full max-h-full rounded-lg"
          />
        </div>
      </template>
      <template v-else-if="artifact.content">
        <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div v-if="showLineNumbers" class="shrink-0 py-4 pl-4 pr-2 text-right select-none bg-neutral-50 border-r border-neutral-200">
            <div
              v-for="i in lineCount"
              :key="i"
              class="text-[11px] leading-[1.6] font-mono text-neutral-400"
            >
              {{ i }}
            </div>
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto py-4 px-4">
            <pre
              class="text-[12px] leading-[1.6] font-mono text-neutral-800 whitespace-pre"
              :class="langClass"
            ><code>{{ artifact.content }}</code></pre>
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
