<script setup lang="ts">
import type { SelectedItem } from '~/types/storage'

const props = defineProps<{
  item: SelectedItem
  size?: number
  createdAt?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const location = computed(() => {
  const segments = props.item.path.split('/').filter(Boolean)
  segments.pop()
  if (segments.length === 0) return '/'
  return '/' + segments.join('/')
})

const { providerLabel } = useStoragePreferences()

const rows = computed(() => {
  const items: { label: string; value: string }[] = [
    { label: 'Type', value: props.item.kind === 'folder' ? 'Folder' : 'File' },
    { label: 'Location', value: location.value },
    { label: 'Storage', value: providerLabel(props.item.provider) },
  ]
  if (props.size !== undefined) {
    items.splice(1, 0, { label: 'Size', value: formatSize(props.size) })
  }
  if (props.createdAt) {
    items.push({ label: 'Created', value: formatDate(props.createdAt) })
  }
  return items
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      data-modal
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        appear
      >
        <div class="w-full max-w-sm mx-4 rounded-2xl bg-white modal-surface overflow-hidden">
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 pt-5 pb-4">
            <div class="size-9 rounded-lg flex items-center justify-center bg-neutral-100 shrink-0">
              <svg class="size-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="item.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <path v-else d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline v-if="item.icon !== 'folder'" points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-headline-md font-semibold text-neutral-950 truncate">{{ item.name }}</h3>
            </div>
            <button
              class="shrink-0 flex items-center justify-center size-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <!-- Info rows -->
          <div class="px-5 pb-4 pt-1 space-y-3">
            <div
              v-for="row in rows"
              :key="row.label"
              class="flex items-start justify-between gap-4"
            >
              <span class="text-body-sm font-medium text-neutral-500 shrink-0 w-20">{{ row.label }}</span>
              <span class="text-body-sm text-neutral-950 text-right break-all">{{ row.value }}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 flex justify-end">
            <button
              class="px-4 py-2 rounded-lg text-body-md font-medium bg-neutral-950 text-white hover:bg-neutral-800 transition-colors"
              @click="emit('close')"
            >
              {{ t('storage.share.done') }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
