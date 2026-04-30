<script setup lang="ts">
import type { FileIconName } from '~/composables/useFileIcons'
import type { StorageProvider } from '~/types/storage'

export interface SelectedItem {
  kind: 'file' | 'folder'
  name: string
  path: string
  icon: FileIconName
  provider: StorageProvider
}

const props = defineProps<{
  item: SelectedItem | null
  isRenaming?: boolean
}>()

const emit = defineEmits<{
  rename: []
  move: []
  delete: []
  deselect: []
}>()

const { t } = useI18n()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="props.item"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/90 backdrop-blur-lg border border-neutral-200 shadow-lg"
    >
      <div class="size-8 rounded-lg flex items-center justify-center bg-neutral-100 border border-neutral-200 shrink-0">
        <svg class="size-4 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path v-if="props.item.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <path v-if="props.item.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          <rect v-if="props.item.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle v-if="props.item.icon === 'image'" cx="9" cy="9" r="2" />
          <path v-if="props.item.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

          <path v-if="props.item.icon === 'file-code'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline v-if="props.item.icon === 'file-code'" points="14 2 14 8 20 8" />
          <path v-if="props.item.icon === 'file-code'" d="m9 13 2 2 4-4" />

          <path v-if="props.item.icon === 'file-text'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline v-if="props.item.icon === 'file-text'" points="14 2 14 8 20 8" />
          <line v-if="props.item.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
          <line v-if="props.item.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />

          <path v-if="props.item.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
          <rect v-if="props.item.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

          <path v-if="props.item.icon === 'audio'" d="M9 18V5l12-2v13" />
          <circle v-if="props.item.icon === 'audio'" cx="6" cy="18" r="3" />
          <circle v-if="props.item.icon === 'audio'" cx="18" cy="16" r="3" />

          <circle v-if="props.item.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />
          <path v-if="props.item.icon === 'key'" d="m21 2-9.6 9.6" />
          <path v-if="props.item.icon === 'key'" d="m15.5 7.5 3 3L22 7l-3-3" />

          <path v-if="props.item.icon === 'archive'" d="M21 8v13H3V8" />
          <path v-if="props.item.icon === 'archive'" d="M1 3h22v5H1z" />
          <path v-if="props.item.icon === 'archive'" d="M10 12h4" />

          <rect v-if="props.item.icon === 'calendar'" x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line v-if="props.item.icon === 'calendar'" x1="16" y1="2" x2="16" y2="6" />
          <line v-if="props.item.icon === 'calendar'" x1="8" y1="2" x2="8" y2="6" />
          <line v-if="props.item.icon === 'calendar'" x1="3" y1="10" x2="21" y2="10" />

          <rect v-if="props.item.icon === 'spreadsheet'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line v-if="props.item.icon === 'spreadsheet'" x1="3" y1="9" x2="21" y2="9" />
          <line v-if="props.item.icon === 'spreadsheet'" x1="3" y1="15" x2="21" y2="15" />
          <line v-if="props.item.icon === 'spreadsheet'" x1="9" y1="3" x2="9" y2="21" />
          <line v-if="props.item.icon === 'spreadsheet'" x1="15" y1="3" x2="15" y2="21" />

          <rect v-if="props.item.icon === 'presentation'" x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line v-if="props.item.icon === 'presentation'" x1="8" y1="21" x2="16" y2="21" />
          <line v-if="props.item.icon === 'presentation'" x1="12" y1="17" x2="12" y2="21" />

          <ellipse v-if="props.item.icon === 'database'" cx="12" cy="5" rx="9" ry="3" />
          <path v-if="props.item.icon === 'database'" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path v-if="props.item.icon === 'database'" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />

          <path v-if="props.item.icon === 'font'" d="M4 20h16" />
          <path v-if="props.item.icon === 'font'" d="m6 16 6-12 6 12" />
          <line v-if="props.item.icon === 'font'" x1="8" y1="12" x2="16" y2="12" />

          <circle v-if="props.item.icon === 'config'" cx="12" cy="12" r="3" />
          <path v-if="props.item.icon === 'config'" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />

          <path v-if="props.item.icon === 'executable'" d="M4 4h16v16H4z" />
          <path v-if="props.item.icon === 'executable'" d="M9 9h6v6H9z" />
          <line v-if="props.item.icon === 'executable'" x1="9" y1="2" x2="9" y2="4" />
          <line v-if="props.item.icon === 'executable'" x1="15" y1="2" x2="15" y2="4" />
          <line v-if="props.item.icon === 'executable'" x1="9" y1="20" x2="9" y2="22" />
          <line v-if="props.item.icon === 'executable'" x1="15" y1="20" x2="15" y2="22" />

          <path v-if="props.item.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline v-if="props.item.icon === 'file'" points="14 2 14 8 20 8" />
        </svg>
      </div>

      <span class="text-body-md text-neutral-950 truncate max-w-[200px] font-medium">
        {{ props.item.name }}
      </span>

      <div class="w-px h-5 bg-neutral-200 shrink-0" />

      <div class="flex items-center gap-1">
        <button
          class="flex items-center justify-center size-7 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors disabled:text-neutral-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          :disabled="props.isRenaming"
          :title="t('common.rename')"
          @click="emit('rename')"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>

        <button
          class="flex items-center justify-center size-7 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors disabled:text-neutral-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          title="Move"
          @click="emit('move')"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        </button>

        <button
          class="flex items-center justify-center size-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:text-neutral-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          :title="t('common.delete')"
          @click="emit('delete')"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>

      <button
        class="flex items-center justify-center size-6 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
        :title="t('common.close')"
        @click="emit('deselect')"
      >
        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  </Transition>
</template>
