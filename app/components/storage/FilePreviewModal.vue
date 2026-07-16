<script setup lang="ts">
import type { FileIconName } from '~/composables/ui/useFileIcons'
import type { StorageProvider } from '~/types/storage'

const props = defineProps<{
  item: {
    kind: 'file'
    name: string
    path: string
    icon: FileIconName
    provider: StorageProvider
  }
  canManageAccess?: boolean
}>()

const emit = defineEmits<{
  close: []
  download: []
  share: []
  permissions: []
  move: []
  rename: []
  duplicate: []
  delete: []
  info: []
}>()

const { getSignedUrl, stripUserPrefix } = useStorageFiles()
const { t } = useI18n()

const previewUrl = ref<string | null>(null)
const textContent = ref<string | null>(null)
const isLoading = ref(true)
const fetchFailed = ref(false)

function ext(): string {
  const i = props.item.name.lastIndexOf('.')
  return i >= 0 ? props.item.name.slice(i + 1).toLowerCase() : ''
}

const isPdf = computed(() => ext() === 'pdf')
const isImagePreview = computed(() => props.item.icon === 'image')
const isVideoPreview = computed(() => props.item.icon === 'video')
const isAudioPreview = computed(() => props.item.icon === 'audio')
const isTextPreview = computed(() =>
  ['file-code', 'file-text', 'config', 'key', 'certificate', 'calendar'].includes(props.item.icon) && !isPdf.value
)
const isPreviewable = computed(() =>
  isImagePreview.value || isVideoPreview.value || isAudioPreview.value || isTextPreview.value || isPdf.value
)

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)

  if (!isPreviewable.value) {
    isLoading.value = false
    return
  }

  const relativePath = stripUserPrefix(props.item.path)
  const url = await getSignedUrl(relativePath)

  if (!url) {
    fetchFailed.value = true
    isLoading.value = false
    return
  }

  if (isTextPreview.value) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      textContent.value = await res.text()
    } catch {
      fetchFailed.value = true
    }
  } else {
    previewUrl.value = url
  }

  isLoading.value = false
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

const canDisplay = computed(() => {
  if (!isPreviewable.value || fetchFailed.value) return false
  if (isTextPreview.value) return textContent.value !== null
  return previewUrl.value !== null
})
</script>

<template>
  <div class="fixed inset-0 z-[70]">
    <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
    <div class="absolute inset-6 flex flex-col bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-3 px-3 py-3.5 shrink-0">
        <span class="text-body-md font-semibold text-neutral-950 truncate flex-1 min-w-0">{{ item.name }}</span>
        <div class="flex items-center gap-1 shrink-0">
          <!-- Share -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('share')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.share') }}</span>
          </div>
          <!-- Manage access (permissions) -->
          <div v-if="canManageAccess" class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('permissions')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('workspaceMenu.manageAccess') }}</span>
          </div>
          <!-- Rename -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('rename')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" />
                <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.rename') }}</span>
          </div>
          <!-- Move -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('move')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <path d="M8 13h8" />
                <path d="m13 10 3 3-3 3" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.move') }}</span>
          </div>
          <!-- Duplicate -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('duplicate')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.duplicate') }}</span>
          </div>
          <!-- Download -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('download')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.download') }}</span>
          </div>
          <!-- Info -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors" @click="emit('info')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.info') }}</span>
          </div>
          <!-- Delete -->
          <div class="group/action relative">
            <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors" @click="emit('delete')">
              <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <span class="pointer-events-none absolute top-full right-0 mt-1.5 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.delete') }}</span>
          </div>
          <div class="w-px h-5 bg-neutral-200 shrink-0 mx-0.5" />
          <!-- Close -->
          <button class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors" @click="emit('close')">
            <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Preview area -->
      <div class="flex-1 min-h-0 flex items-center justify-center overflow-auto">
        <!-- Loading -->
        <div v-if="isLoading">
          <svg class="size-5 text-neutral-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>

        <!-- Can't preview -->
        <p v-else-if="!canDisplay" class="text-body-md text-neutral-500 font-medium">
          Can't be previewed
        </p>

        <!-- Image -->
        <img
          v-else-if="isImagePreview && previewUrl"
          :src="previewUrl"
          :alt="item.name"
          class="max-w-full max-h-full object-contain p-6"
        >

        <!-- Video -->
        <video
          v-else-if="isVideoPreview && previewUrl"
          :src="previewUrl"
          controls
          class="max-w-full max-h-full"
        />

        <!-- Audio -->
        <audio
          v-else-if="isAudioPreview && previewUrl"
          :src="previewUrl"
          controls
          class="w-full max-w-md mx-6"
        />

        <!-- PDF -->
        <iframe
          v-else-if="isPdf && previewUrl"
          :src="previewUrl"
          class="w-full h-full border-0"
          :title="item.name"
        />

        <!-- Text / code -->
        <pre
          v-else-if="isTextPreview && textContent"
          class="w-full h-full overflow-auto p-5 text-[13px] leading-relaxed text-neutral-800 font-mono whitespace-pre-wrap"
        >{{ textContent }}</pre>
      </div>
    </div>
  </div>
</template>
