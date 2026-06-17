<script setup lang="ts">
import type { ArtifactType, SandboxArtifact } from '~/composables/artifacts/useArtifacts'

const props = defineProps<{
  artifacts: readonly SandboxArtifact[]
}>()

const emit = defineEmits<{
  open: [artifact: SandboxArtifact]
  download: [artifact: SandboxArtifact]
  save: [artifact: SandboxArtifact]
  delete: [artifact: SandboxArtifact]
  bulkDownload: [artifacts: SandboxArtifact[]]
  bulkSave: [artifacts: SandboxArtifact[]]
  bulkDelete: [artifacts: SandboxArtifact[]]
}>()

const { t } = useI18n()

type ViewMode = 'grid' | 'list'
const view = ref<ViewMode>('grid')

// ---- Sort ------------------------------------------------------------------
type SortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
const sortKey = ref<SortKey>('newest')
const sortOpen = ref(false)
const sortRef = ref<HTMLElement | null>(null)

const SORT_OPTIONS: { key: SortKey, labelKey: string }[] = [
  { key: 'newest', labelKey: 'artifacts.sortNewest' },
  { key: 'oldest', labelKey: 'artifacts.sortOldest' },
  { key: 'name-asc', labelKey: 'artifacts.sortNameAsc' },
  { key: 'name-desc', labelKey: 'artifacts.sortNameDesc' },
  { key: 'size-desc', labelKey: 'artifacts.sortSizeDesc' },
  { key: 'size-asc', labelKey: 'artifacts.sortSizeAsc' },
]
const activeSortLabel = computed(() => {
  const opt = SORT_OPTIONS.find(o => o.key === sortKey.value)
  return opt ? t(opt.labelKey) : ''
})

function ts(a: SandboxArtifact): number {
  const n = new Date(a.createdAt).getTime()
  return Number.isNaN(n) ? 0 : n
}
function sortArtifacts(list: SandboxArtifact[]): SandboxArtifact[] {
  const arr = [...list]
  switch (sortKey.value) {
    case 'oldest': return arr.sort((a, b) => ts(a) - ts(b))
    case 'name-asc': return arr.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-desc': return arr.sort((a, b) => b.name.localeCompare(a.name))
    case 'size-desc': return arr.sort((a, b) => (b.size || 0) - (a.size || 0))
    case 'size-asc': return arr.sort((a, b) => (a.size || 0) - (b.size || 0))
    case 'newest':
    default: return arr.sort((a, b) => ts(b) - ts(a))
  }
}

function onSortDocClick(e: MouseEvent) {
  if (sortOpen.value && sortRef.value && !sortRef.value.contains(e.target as Node)) {
    sortOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', onSortDocClick))
onUnmounted(() => document.removeEventListener('click', onSortDocClick))

// Filter is 'all' or one of the artifact types. The chip row only offers types
// that actually appear, in a stable display order, so the bar stays minimal.
const TYPE_ORDER: ArtifactType[] = ['image', 'code', 'document', 'video', 'audio', 'archive', 'other']
const activeFilter = ref<'all' | ArtifactType>('all')

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

const availableTypes = computed(() => {
  const present = new Set(props.artifacts.map(a => a.type))
  return TYPE_ORDER.filter(type => present.has(type))
})

watch(availableTypes, (types) => {
  if (activeFilter.value !== 'all' && !types.includes(activeFilter.value)) {
    activeFilter.value = 'all'
  }
})

const filtered = computed(() =>
  activeFilter.value === 'all'
    ? [...props.artifacts]
    : props.artifacts.filter(a => a.type === activeFilter.value),
)

const totalSize = computed(() => filtered.value.reduce((sum, a) => sum + (a.size || 0), 0))

// Sorted view of the filtered set.
const sorted = computed(() => sortArtifacts(filtered.value))

// ---- Multi-select ----------------------------------------------------------
// Reassign a fresh Set on every mutation so the change is unambiguously
// reactive regardless of Vue's collection-tracking version.
const selected = ref<Set<string>>(new Set())
const confirmingDelete = ref(false)
const selecting = computed(() => selected.value.size > 0)
const selectedArtifacts = computed(() => props.artifacts.filter(a => selected.value.has(a.id)))
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every(a => selected.value.has(a.id)))

function isSelected(id: string): boolean {
  return selected.value.has(id)
}
function toggleSelect(artifact: SandboxArtifact) {
  const next = new Set(selected.value)
  if (next.has(artifact.id)) next.delete(artifact.id)
  else next.add(artifact.id)
  selected.value = next
}
function selectAll() {
  selected.value = new Set(filtered.value.map(a => a.id))
}
function clearSelection() {
  selected.value = new Set()
  confirmingDelete.value = false
}

// Drop ids that no longer exist (after a delete elsewhere) so the bulk bar
// count never lies.
watch(() => props.artifacts, (list) => {
  const ids = new Set(list.map(a => a.id))
  const next = new Set([...selected.value].filter(id => ids.has(id)))
  if (next.size !== selected.value.size) selected.value = next
  if (next.size === 0) confirmingDelete.value = false
})

function bulkDownload() {
  emit('bulkDownload', selectedArtifacts.value)
  clearSelection()
}
function bulkSave() {
  emit('bulkSave', selectedArtifacts.value)
  clearSelection()
}
function bulkDeleteConfirmed() {
  emit('bulkDelete', selectedArtifacts.value)
  clearSelection()
}
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <template v-if="artifacts.length > 0">
      <!-- Toolbar: type filter · count + size · group + view toggles -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5 sm:px-5">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="activeFilter === 'all' ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100'"
            @click="activeFilter = 'all'"
          >
            {{ t('artifacts.filterAll') }}
          </button>
          <button
            v-for="type in availableTypes"
            :key="type"
            type="button"
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            :class="activeFilter === type ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100'"
            @click="activeFilter = type"
          >
            {{ typeLabel(type) }}
          </button>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-meta text-neutral-500">
            {{ t('artifacts.fileCount', filtered.length) }} · {{ formatSize(totalSize) }}
          </span>

          <!-- Sort dropdown: menu matches the trigger width, directly below it -->
          <div ref="sortRef" class="relative">
            <button
              type="button"
              :aria-label="t('artifacts.sortBy')"
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              :class="sortOpen ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-600 hover:text-neutral-900'"
              @click.stop="sortOpen = !sortOpen"
            >
              <svg class="size-3.5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h12" /><path d="M3 12h9" /><path d="M3 18h6" /><path d="m17 8 4-4 4 4" /><path d="M21 4v16" />
              </svg>
              {{ activeSortLabel }}
              <svg class="size-3 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div
              v-if="sortOpen"
              class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in SORT_OPTIONS"
                :key="opt.key"
                type="button"
                class="flex w-full items-center justify-between gap-2 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors hover:bg-neutral-100"
                :class="sortKey === opt.key ? 'text-neutral-950' : 'text-neutral-600'"
                @click="sortKey = opt.key; sortOpen = false"
              >
                {{ t(opt.labelKey) }}
                <svg v-if="sortKey === opt.key" class="size-3.5 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            </div>
          </div>

          <div class="flex overflow-hidden rounded-lg ring-1 ring-neutral-200">
            <button
              type="button"
              :aria-label="t('artifacts.viewGrid')"
              :title="t('artifacts.viewGrid')"
              class="grid size-7 place-items-center transition-colors"
              :class="view === 'grid' ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-400 hover:text-neutral-600'"
              @click="view = 'grid'"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              :aria-label="t('artifacts.viewList')"
              :title="t('artifacts.viewList')"
              class="grid size-7 place-items-center transition-colors"
              :class="view === 'list' ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-400 hover:text-neutral-600'"
              @click="view = 'list'"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 pb-20 sm:p-5 sm:pb-20">
        <!-- Grid view -->
        <div
          v-if="view === 'grid'"
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))"
        >
          <ArtifactCard
            v-for="artifact in sorted"
            :key="artifact.id"
            :artifact="artifact"
            :selected="isSelected(artifact.id)"
            :selecting="selecting"
            @open="emit('open', $event)"
            @download="emit('download', $event)"
            @save="emit('save', $event)"
            @delete="emit('delete', $event)"
            @toggle-select="toggleSelect"
          />
        </div>

        <!-- List view -->
        <div v-else class="overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
          <ArtifactRow
            v-for="artifact in sorted"
            :key="artifact.id"
            :artifact="artifact"
            :selected="isSelected(artifact.id)"
            :selecting="selecting"
            @open="emit('open', $event)"
            @download="emit('download', $event)"
            @save="emit('save', $event)"
            @delete="emit('delete', $event)"
            @toggle-select="toggleSelect"
          />
        </div>
      </div>

      <!-- Bulk action bar -->
      <div
        v-if="selecting"
        class="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1.5 shadow-lg"
      >
        <template v-if="!confirmingDelete">
          <span class="px-2 text-xs font-medium text-neutral-600">{{ t('artifacts.selectedCount', { count: selected.size }) }}</span>
          <button
            v-if="!allSelected"
            type="button"
            class="rounded-full px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            @click="selectAll"
          >
            {{ t('artifacts.selectAll') }}
          </button>
          <div class="mx-0.5 h-5 w-px bg-neutral-200" />
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
            @click="bulkDownload"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {{ t('artifacts.download') }}
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
            @click="bulkSave"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            {{ t('artifacts.saveToStorage') }}
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            @click="confirmingDelete = true"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            {{ t('artifacts.delete') }}
          </button>
          <div class="mx-0.5 h-5 w-px bg-neutral-200" />
          <button
            type="button"
            :aria-label="t('artifacts.clearSelection')"
            :title="t('artifacts.clearSelection')"
            class="grid size-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            @click="clearSelection"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </template>
        <template v-else>
          <span class="px-2 text-xs font-medium text-neutral-700">{{ t('artifacts.bulkDeleteConfirm', selected.size, { count: selected.size }) }}</span>
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            @click="confirmingDelete = false"
          >
            {{ t('artifacts.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-full bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
            @click="bulkDeleteConfirmed"
          >
            {{ t('artifacts.delete') }}
          </button>
        </template>
      </div>
    </template>

    <!-- Empty state -->
    <template v-else>
      <div class="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col items-center justify-center self-stretch gap-3 py-12 text-center">
        <svg class="size-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div class="flex flex-col gap-1">
          <p class="text-sm font-medium text-neutral-950">{{ t('artifacts.emptyTitle') }}</p>
          <p class="max-w-sm text-meta text-neutral-500">{{ t('artifacts.emptyDescription') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
