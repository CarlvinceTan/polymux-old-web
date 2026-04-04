<script setup lang="ts">
const headerTabs = {
  PERSONAL: '/vault',
  WORKSPACES: '/vault/workspaces',
  SHARED: '/vault/shared',
} as const satisfies Record<string, string>

const open = defineModel<boolean>('open', { required: true })

type ViewMode = 'icon' | 'list'
const viewMode = ref<ViewMode>('icon')
const searchQuery = ref('')
const searchFocused = ref(false)

// Mock vault files - in a real app these would come from an API/store
const vaultFiles = ref([
  { id: '1', name: 'Screenshot 2026-03-12.png', type: 'image', icon: 'image' },
  { id: '2', name: 'logo_ascii.png', type: 'image', icon: 'image' },
  { id: '3', name: 'Tuesday Social Session.ics', type: 'calendar', icon: 'calendar' },
  { id: '4', name: 'openapi.yaml', type: 'document', icon: 'file-code' },
  { id: '5', name: 'output.mp4', type: 'video', icon: 'video' },
  { id: '6', name: 'Untitled Project.JPG', type: 'image', icon: 'image' },
  { id: '7', name: 'README.md', type: 'document', icon: 'file-text' },
  { id: '8', name: 'requirements.txt', type: 'document', icon: 'file-code' },
  { id: '9', name: 'ca.key', type: 'key', icon: 'key' },
  { id: '10', name: 'client.key', type: 'key', icon: 'key' },
  { id: '11', name: 'add_if_then_else.h', type: 'document', icon: 'file-code' },
  { id: '12', name: 'Docker.dmg', type: 'archive', icon: 'archive' },
  { id: '13', name: 'Bumblebee (2018).mkv', type: 'video', icon: 'video' },
  { id: '14', name: 'out.mp4', type: 'video', icon: 'video' },
])

function fuzzyMatch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

const filteredFiles = computed(() => {
  const term = searchQuery.value
  if (!term.trim()) return vaultFiles.value
  return vaultFiles.value.filter((f) => fuzzyMatch(f.name, term))
})

// Dropdown state
const isFilterOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)

function toggleFilter() {
  isFilterOpen.value = !isFilterOpen.value
}

function closeFilter() {
  isFilterOpen.value = false
}

// Click outside to close dropdown
function handleClickOutside(event: MouseEvent) {
  if (filterRef.value && !filterRef.value.contains(event.target as Node)) {
    closeFilter()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const filterItems = [
  { label: 'All files', icon: 'file' },
  { label: 'Images', icon: 'image' },
  { label: 'Documents', icon: 'file-text' },
  { label: 'Videos', icon: 'video' },
]
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
          <template #header>
            <!-- Toolbar: search on left, view selector + add + filter on right -->
            <div class="flex shrink-0 items-center gap-3">
      <!-- Search - fills remaining space on left -->
      <div
        class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-100 border border-neutral-300 transition-all"
        :class="searchFocused ? 'border-neutral-950 bg-white shadow-sm' : ''">
        <svg class="size-4 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="searchQuery" type="text" placeholder="Search files..."
          class="flex-1 min-w-0 bg-transparent text-body-md text-neutral-950 placeholder:text-neutral-600 outline-none"
          @focus="searchFocused = true" @blur="searchFocused = false">
      </div>

      <!-- View selector + add + filter on top right -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- View toggle (icon vs list) -->
        <div class="flex rounded-lg bg-neutral-100 overflow-hidden border border-neutral-300">
          <button class="flex items-center justify-center size-9 transition-colors"
            :class="viewMode === 'icon' ? 'bg-white text-neutral-950 border-r border-neutral-300' : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-200'"
            aria-label="Icon view" @click="viewMode = 'icon'">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button class="flex items-center justify-center size-9 transition-colors"
            :class="viewMode === 'list' ? 'bg-white text-neutral-950' : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-200'"
            aria-label="List view" @click="viewMode = 'list'">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Add button -->
        <button
          class="flex items-center justify-center size-9 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition-colors shadow-sm"
          aria-label="Add">
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </button>

        <!-- Filter button -->
        <div ref="filterRef" class="relative">
          <button
            class="flex items-center justify-center h-9 min-w-9 gap-1 px-2.5 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:text-neutral-950 hover:border-neutral-400 transition-colors"
            aria-label="Filter files" @click="toggleFilter">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="21" y1="4" x2="14" y2="4" />
              <line x1="10" y1="4" x2="3" y2="4" />
              <line x1="21" y1="12" x2="12" y2="12" />
              <line x1="8" y1="12" x2="3" y2="12" />
              <line x1="21" y1="20" x2="16" y2="20" />
              <line x1="12" y1="20" x2="3" y2="20" />
              <line x1="14" y1="2" x2="14" y2="6" />
              <line x1="8" y1="10" x2="8" y2="14" />
              <line x1="16" y1="18" x2="16" y2="22" />
            </svg>
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <!-- Dropdown Menu -->
          <div v-if="isFilterOpen"
            class="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg bg-white py-1 shadow-lg border border-neutral-300 overflow-hidden">
            <button v-for="item in filterItems" :key="item.icon"
              class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer">
              <svg class="size-4 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path v-if="item.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                <rect v-if="item.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle v-if="item.icon === 'image'" cx="9" cy="9" r="2" />
                <path v-if="item.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

                <path v-if="item.icon === 'file-text'"
                  d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline v-if="item.icon === 'file-text'" points="14 2 14 8 20 8" />
                <line v-if="item.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
                <line v-if="item.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
                <line v-if="item.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />

                <path v-if="item.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
                <rect v-if="item.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

                <path v-if="item.icon === 'file'"
                  d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline v-if="item.icon === 'file'" points="14 2 14 8 20 8" />
              </svg>
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
            </div>
          </template>

          <!-- File area (TabPanel body scrolls) -->
          <div class="p-4 sm:p-5">
      <!-- Icon view - grid like Mac Finder, sized for ~3 rows visible -->
      <div v-if="viewMode === 'icon'" class="grid gap-4"
        style="grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))">
        <button v-for="file in filteredFiles" :key="file.id"
          class="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-neutral-100 border border-transparent hover:border-neutral-300 hover:shadow-sm transition-all text-left group">
          <div
            class="size-11 rounded-lg flex items-center justify-center bg-white border border-neutral-300 group-hover:border-neutral-400 group-hover:shadow-sm transition-all shrink-0">
            <svg class="size-5 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path v-if="file.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              <rect v-if="file.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle v-if="file.icon === 'image'" cx="9" cy="9" r="2" />
              <path v-if="file.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

              <rect v-if="file.icon === 'calendar'" x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line v-if="file.icon === 'calendar'" x1="16" y1="2" x2="16" y2="6" />
              <line v-if="file.icon === 'calendar'" x1="8" y1="2" x2="8" y2="6" />
              <line v-if="file.icon === 'calendar'" x1="3" y1="10" x2="21" y2="10" />

              <path v-if="file.icon === 'file-code'"
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline v-if="file.icon === 'file-code'" points="14 2 14 8 20 8" />
              <path v-if="file.icon === 'file-code'" d="m9 13 2 2 4-4" />

              <path v-if="file.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
              <rect v-if="file.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

              <path v-if="file.icon === 'file-text'"
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline v-if="file.icon === 'file-text'" points="14 2 14 8 20 8" />
              <line v-if="file.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
              <line v-if="file.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
              <line v-if="file.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />

              <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />
              <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
              <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3L22 7l-3-3" />

              <path v-if="file.icon === 'archive'" d="M21 8v13H3V8" />
              <path v-if="file.icon === 'archive'" d="M1 3h22v5H1z" />
              <path v-if="file.icon === 'archive'" d="M10 12h4" />
            </svg>
          </div>
          <span
            class="text-meta text-neutral-950 text-center line-clamp-2 wrap-break-word w-full px-0.5 leading-tight font-medium">
            {{ file.name }}
          </span>
        </button>
      </div>

      <!-- List view - rows like Mac Finder list -->
      <div v-else class="ghost-panel flex flex-col overflow-hidden rounded-lg bg-white">
        <button v-for="(file, index) in filteredFiles" :key="file.id"
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-100 transition-colors text-left w-full border-b border-neutral-200 last:border-b-0">
          <div
            class="size-9 rounded-lg flex items-center justify-center bg-neutral-100 border border-neutral-200 shrink-0">
            <svg class="size-4 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path v-if="file.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              <rect v-if="file.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle v-if="file.icon === 'image'" cx="9" cy="9" r="2" />
              <path v-if="file.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

              <rect v-if="file.icon === 'calendar'" x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line v-if="file.icon === 'calendar'" x1="16" y1="2" x2="16" y2="6" />
              <line v-if="file.icon === 'calendar'" x1="8" y1="2" x2="8" y2="6" />
              <line v-if="file.icon === 'calendar'" x1="3" y1="10" x2="21" y2="10" />

              <path v-if="file.icon === 'file-code'"
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline v-if="file.icon === 'file-code'" points="14 2 14 8 20 8" />
              <path v-if="file.icon === 'file-code'" d="m9 13 2 2 4-4" />

              <path v-if="file.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
              <rect v-if="file.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

              <path v-if="file.icon === 'file-text'"
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline v-if="file.icon === 'file-text'" points="14 2 14 8 20 8" />
              <line v-if="file.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
              <line v-if="file.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
              <line v-if="file.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />

              <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />
              <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
              <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3L22 7l-3-3" />

              <path v-if="file.icon === 'archive'" d="M21 8v13H3V8" />
              <path v-if="file.icon === 'archive'" d="M1 3h22v5H1z" />
              <path v-if="file.icon === 'archive'" d="M10 12h4" />
            </svg>
          </div>
          <span class="text-body-md text-neutral-950 truncate flex-1 min-w-0 font-medium">
            {{ file.name }}
          </span>
          <span class="text-xs text-neutral-600 shrink-0 capitalize">
            {{ file.type }}
          </span>
        </button>
      </div>

            <p v-if="filteredFiles.length === 0" class="py-8 text-center text-body-md text-neutral-700 font-medium">
              No files match your search.
            </p>
          </div>
      </TabPanel>
    </div>
  </div>
</template>
