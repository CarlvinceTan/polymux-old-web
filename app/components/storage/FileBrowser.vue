<script setup lang="ts">
import type Sortable from 'sortablejs'
import { vDraggable, type DraggableEvent } from 'vue-draggable-plus'
import type { StorageFile, StorageFolder } from '~/composables/storage/useStorageFiles'
import type { SelectedItem } from '~/types/storage'
import type { FileIconName } from '~/composables/ui/useFileIcons'
import type { StorageProvider } from '~/types/storage'
import type { MigrateConfirmGroup } from '~/components/storage/MigrateConfirmModal.vue'

const props = withDefaults(defineProps<{
  /** Open the browser at this directory on mount / when the prop changes.
   *  Used by the storage page to honour `?path=...` deeplinks from polymux://
   *  chips in agent replies. Empty array (default) means the workspace root. */
  initialPath?: string[]
  /** When set, select the file with this name once the directory finishes
   *  loading. Cleared after a match lands or when the user navigates away. */
  highlightFileName?: string
}>(), {
  initialPath: () => [],
  highlightFileName: undefined,
})

const { listFiles, getCachedDirectory, storageDirRev, uploadFile, deleteFiles, renameFile, renameFolder, moveFile, migrateItems, transferLocalFile, reorderFiles, createFolder, copyStorageFile, copyStorageFolder, downloadFile, stripUserPrefix, validateSubdirectoryShare, clearStorageListCache, provider: storageProvider, isLoading, listingLoading, error: storageError, folderOpMessage } = useStorageFiles()
const { resolvedOrder: storageResolvedOrder } = useStoragePreferences()
const { getIconForFile } = useFileIcons()
const { t, locale } = useI18n()
const toast = useAppToast()

const kindI18nKey: Record<FileIconName, string> = {
  'folder': 'storage.kinds.folder',
  'image': 'storage.kinds.image',
  'file-code': 'storage.kinds.code',
  'file-text': 'storage.kinds.document',
  'video': 'storage.kinds.video',
  'audio': 'storage.kinds.audio',
  'key': 'storage.kinds.key',
  'archive': 'storage.kinds.archive',
  'calendar': 'storage.kinds.calendar',
  'spreadsheet': 'storage.kinds.spreadsheet',
  'presentation': 'storage.kinds.presentation',
  'database': 'storage.kinds.database',
  'font': 'storage.kinds.font',
  'config': 'storage.kinds.config',
  'executable': 'storage.kinds.executable',
  'file': 'storage.kinds.file',
}

function kindLabel(icon: FileIconName): string {
  return t(kindI18nKey[icon] ?? 'storage.kinds.file')
}

function formatListDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type ViewMode = 'icon' | 'list'
const viewMode = ref<ViewMode>('icon')
const searchQuery = ref('')
const searchExpanded = ref(false)
const searchFocused = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const currentPath = ref<string[]>([...props.initialPath])
const pathHistory = ref<string[][]>([[...props.initialPath]])
const historyIndex = ref(0)
// Name of the file the deeplink wants to select once the active directory's
// listing arrives. Cleared once we find a match (or when the user navigates).
const pendingHighlightName = ref<string | null>(props.highlightFileName ?? null)

const folders = ref<StorageFolder[]>([])
const files = ref<StorageFile[]>([])
const currentOrder = ref<string[]>([])

// In-memory per-directory cache keyed by `currentPath.join('/')`. Lets us paint
// the last-seen listing instantly when navigating back to a visited folder
// while the fresh fetch runs in the background (stale-while-revalidate).
interface DirCacheEntry {
  folders: StorageFolder[]
  files: StorageFile[]
  order: string[]
}
const directoryCache = new Map<string, DirCacheEntry>()

function pathKey(segments: readonly string[]): string {
  return segments.join('/')
}

const selectedItemId = ref<string | null>(null)
const selectedItem = ref<SelectedItem | null>(null)
// Multi-select: `selectedItemIds` is the full set of grey-highlighted items.
// `selectedItemId`/`selectedItem` continue to track the primary (first
// selected) item for single-target UI like FileInfoModal/FilePreviewModal.
// `selectedItemsArray` is what batch-aware modals (Share, Manage Access)
// receive — it contains every selected item in selection order.
// `isMultiSelection` gates batch-only toolbar behavior.
const selectedItemIds = ref<Set<string>>(new Set())
const selectedItemsMap = ref<Map<string, SelectedItem>>(new Map())
const isMultiSelection = computed(() => selectedItemIds.value.size > 1)
const selectedItemsArray = computed<SelectedItem[]>(() => Array.from(selectedItemsMap.value.values()))
const isRenaming = ref(false)
const renameInput = ref('')
/** v-for refs become an array in Vue 3; normalize before focus/select */
const renameInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

function resolveRenameInputEl(): HTMLInputElement | null {
  const r = renameInputRef.value
  if (!r) return null
  if (Array.isArray(r)) {
    const el = r.find((x): x is HTMLInputElement => x instanceof HTMLInputElement)
    return el ?? null
  }
  return r
}

function onRenameInputFocus(ev: FocusEvent) {
  const t = ev.target
  if (t instanceof HTMLInputElement) {
    t.select()
  }
}

const isPreviewOpen = ref(false)
const previewFile = ref<(typeof filteredFiles.value)[number] | null>(null)

function openPreview(item: (typeof filteredFiles.value)[number]) {
  if (item.kind !== 'file') return
  selectItem(item)
  previewFile.value = item
  isPreviewOpen.value = true
}

function closePreview(deselect = true) {
  isPreviewOpen.value = false
  previewFile.value = null
  if (deselect) deselectItem()
}

type PreviewableFile = {
  kind: 'file'
  name: string
  path: string
  icon: FileIconName
  provider: StorageProvider
}

const typedPreviewFile = computed<PreviewableFile | null>(() => {
  const f = previewFile.value
  if (!f || f.kind !== 'file') return null
  return f as PreviewableFile
})

interface MoveTreeNode {
  name: string
  path: string[]
  children: MoveTreeNode[] | null
  loadingPromise: Promise<void> | null
  expanded: boolean
  // `undefined` at the root — the workspace root isn't backed by any one
  // provider. When the user picks the root as a destination, the effective
  // provider is the user's currently preferred one (storageProvider.value).
  provider?: StorageProvider
}

const isMoveModalOpen = ref(false)
const moveTreeRoot = ref<MoveTreeNode>({
  name: '',
  path: [],
  children: null,
  loadingPromise: null,
  expanded: false,
})
const moveSelectedPath = ref<string[]>([])

// Explicit destination-provider override for the Move modal. When the user
// picks a non-root folder we lock this to the folder's provider (per the
// invariant "everything inside a folder must share one provider"). At root,
// the user is free to choose any connected provider via the dropdown.
const moveTargetProviderOverride = ref<StorageProvider | null>(null)
const moveProviderMenuOpen = ref(false)
const moveProviderMenuRef = ref<HTMLElement | null>(null)

const visibleMoveNodes = computed<Array<{ node: MoveTreeNode; depth: number }>>(() => {
  const out: Array<{ node: MoveTreeNode; depth: number }> = []
  const visit = (node: MoveTreeNode, depth: number) => {
    out.push({ node, depth })
    if (node.expanded && node.children) {
      for (const child of node.children) visit(child, depth + 1)
    }
  }
  visit(moveTreeRoot.value, 0)
  return out
})

function moveNodeKey(node: MoveTreeNode): string {
  return node.path.length === 0 ? '__move_root__' : node.path.join('/')
}

function isMoveDestinationSelected(node: MoveTreeNode): boolean {
  if (node.path.length !== moveSelectedPath.value.length) return false
  for (let i = 0; i < node.path.length; i++) {
    if (node.path[i] !== moveSelectedPath.value[i]) return false
  }
  return true
}

// Provider menu options for the Move modal — only providers ready to accept
// writes show up. Defined here next to other move-related state.
const availableMoveProviders = computed<StorageProvider[]>(() => storageResolvedOrder.value)

const moveProviderLabels = computed<Record<StorageProvider, string>>(() => ({
  'google-drive': t('storage.settings.providerGoogleDrive'),
  'local': t('storage.settings.providerLocal'),
  'b2': t('storage.settings.providerCloud'),
}))

function moveProviderLabel(provider: StorageProvider): string {
  return moveProviderLabels.value[provider] ?? provider
}

// The folder selection's intrinsic provider — undefined for the workspace
// root (the root has no inherent provider; items at root can live anywhere).
const moveSelectedFolderProvider = computed<StorageProvider | undefined>(() => {
  if (moveSelectedPath.value.length === 0) return undefined
  const node = findMoveNode(moveSelectedPath.value)
  return node?.provider
})

// Effective destination provider for the move/migrate operation. Locked to
// the destination folder's provider when a non-root folder is selected (per
// the per-folder invariant). At root the user picks via the dropdown override.
const effectiveMoveTargetProvider = computed<StorageProvider>(() => {
  const folderProvider = moveSelectedFolderProvider.value
  if (folderProvider) return folderProvider
  if (moveTargetProviderOverride.value && availableMoveProviders.value.includes(moveTargetProviderOverride.value)) {
    return moveTargetProviderOverride.value
  }
  return availableMoveProviders.value[0] ?? storageProvider.value
})

const moveProviderLocked = computed(() => moveSelectedFolderProvider.value !== undefined)
const moveProviderInteractive = computed(() => !moveProviderLocked.value && availableMoveProviders.value.length > 1)

function selectMoveProvider(provider: StorageProvider) {
  moveTargetProviderOverride.value = provider
  moveProviderMenuOpen.value = false
}

function toggleMoveProviderMenu() {
  if (!moveProviderInteractive.value) return
  moveProviderMenuOpen.value = !moveProviderMenuOpen.value
}

function handleMoveProviderClickOutside(event: MouseEvent) {
  if (!moveProviderMenuOpen.value) return
  const target = event.target as Node
  if (moveProviderMenuRef.value && !moveProviderMenuRef.value.contains(target)) {
    moveProviderMenuOpen.value = false
  }
}

const pendingNewFolder = ref<{ draftName: string } | null>(null)
const newFolderInputRef = ref<HTMLInputElement | null>(null)

const pendingDuplicate = ref<{ draftName: string; sourceKind: 'file' | 'folder'; sourceName: string; sourceIcon: FileIconName } | null>(null)
const duplicateInputRef = ref<HTMLInputElement | null>(null)

/** Function ref avoids Vue 3 turning `ref` inside `v-for` into an array (arrays have no `.focus()`). */
function bindNewFolderInputRef(el: unknown) {
  newFolderInputRef.value = el instanceof HTMLInputElement ? el : null
}

function onNewFolderInputFocus(ev: FocusEvent) {
  const t = ev.target
  if (t instanceof HTMLInputElement) {
    t.select()
  }
}

function focusNewFolderInput() {
  const run = (): boolean => {
    const el = newFolderInputRef.value
    if (!el) return false
    el.focus()
    el.select()
    requestAnimationFrame(() => {
      el.focus()
      el.select()
    })
    return true
  }
  nextTick(() => {
    if (run()) return
    nextTick(() => run())
  })
}

function bindDuplicateInputRef(el: unknown) {
  duplicateInputRef.value = el instanceof HTMLInputElement ? el : null
}

function onDuplicateInputFocus(ev: FocusEvent) {
  const t = ev.target
  if (t instanceof HTMLInputElement) {
    t.select()
  }
}

function focusDuplicateInput() {
  const run = (): boolean => {
    const el = duplicateInputRef.value
    if (!el) return false
    el.focus()
    el.select()
    requestAnimationFrame(() => {
      el.focus()
      el.select()
    })
    return true
  }
  nextTick(() => {
    if (run()) return
    nextTick(() => run())
  })
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const selectionActionsRef = ref<HTMLElement | null>(null)
const isShareModalOpen = ref(false)
const isPermissionsModalOpen = ref(false)
const isInfoModalOpen = ref(false)

const { currentWorkspace } = useWorkspaces()
const canManageAccess = computed(() =>
  !!currentWorkspace.value && ['owner', 'admin'].includes(currentWorkspace.value.role ?? ''),
)
const selectedFileExtra = ref<{ size?: number; createdAt?: string } | null>(null)

const canGoBack = computed(() => historyIndex.value > 0)
const canGoForward = computed(() => historyIndex.value < pathHistory.value.length - 1)

// Breadcrumb root shows the workspace name (the files live at the workspace
// root), with the house icon. Subfolders render after it as " / subfolder".
const rootLabel = computed(() => currentWorkspace.value?.name || t('common.workspace'))

const breadcrumbSegments = computed(() => {
  return [rootLabel.value, ...currentPath.value]
})

const selectedBreadcrumbLabel = computed(() => {
  const selected = selectedItemsArray.value
  if (selected.length !== 1) return ''
  return selected[0]?.name ?? ''
})

function navigateToPath(path: string[]) {
  const newPath = [...path]
  pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
  pathHistory.value.push(newPath)
  historyIndex.value = pathHistory.value.length - 1
  currentPath.value = newPath
}

function goBack() {
  if (!canGoBack.value) return
  historyIndex.value--
  currentPath.value = [...pathHistory.value[historyIndex.value]!]
}

function goForward() {
  if (!canGoForward.value) return
  historyIndex.value++
  currentPath.value = [...pathHistory.value[historyIndex.value]!]
}

function navigateToBreadcrumb(index: number) {
  const newPath = currentPath.value.slice(0, index)
  navigateToPath(newPath)
}

function openFolder(folderName: string) {
  deselectItem()
  navigateToPath([...currentPath.value, folderName])
}

// Manual-position helpers. The grid's source of truth for ordering is the
// server-persisted `file_order.ordered_names`; these helpers keep that list in
// sync across create/rename/duplicate/upload/delete so new items land where
// the user expects instead of snapping to the tail on the next refresh.

function visibleNamesInCurrentView(): string[] {
  // Seed from the names currently rendered. Pending placeholders shouldn't
  // carry a rank.
  const all = [
    ...folders.value.filter(f => !f.name.startsWith('.')).map(f => f.name),
    ...files.value.filter(f => !f.name.startsWith('.')).map(f => f.name),
  ]
  if (!currentOrder.value.length) return all
  const rank = new Map<string, number>()
  currentOrder.value.forEach((n, i) => rank.set(n, i))
  return all.sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
}

/** Returns a mutable working copy of the ranked order, seeded from the current
 * view if no explicit rank has been persisted yet. This avoids the "only the
 * changed item is ranked, everything else falls to the tail" failure mode. */
function snapshotOrder(): string[] {
  if (currentOrder.value.length > 0) return [...currentOrder.value]
  return visibleNamesInCurrentView()
}

async function persistOrder(orderedNames: string[]) {
  currentOrder.value = orderedNames
  const parentPath = currentPath.value.join('/')
  const cached = directoryCache.get(pathKey(currentPath.value))
  if (cached) cached.order = orderedNames
  const ok = await reorderFiles(parentPath, orderedNames)
  if (!ok) toast.show(t('storage.orderSaveFailed'), 'error')
}

async function refreshFiles(force = false) {
  // Snapshot the target path so a late-arriving response for the previous
  // directory can't clobber the current one when the user navigates quickly.
  const targetPath = [...currentPath.value]
  const key = pathKey(targetPath)
  const result = await listFiles(targetPath, force ? { force: true } : undefined)
  if (pathKey(currentPath.value) !== key) return
  folders.value = result.folders
  files.value = result.files
  currentOrder.value = result.order ?? []
  directoryCache.set(key, {
    folders: result.folders,
    files: result.files,
    order: result.order ?? [],
  })
}

// Deeplink sync: when the storage page re-passes a different initialPath
// (the user clicked another polymux:// chip in chat without remounting this
// component), navigate to it and queue up the new highlight target. The
// initial mount is already handled by seeding currentPath from the prop
// above, so this watch is `not` immediate.
watch(
  () => props.initialPath,
  (path) => {
    const next = [...(path ?? [])]
    const same = next.length === currentPath.value.length && next.every((s, i) => s === currentPath.value[i])
    if (!same) {
      pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
      pathHistory.value.push(next)
      historyIndex.value = pathHistory.value.length - 1
      currentPath.value = next
    }
    pendingHighlightName.value = props.highlightFileName ?? null
  },
  { deep: true },
)

watch(
  () => props.highlightFileName,
  (name) => {
    pendingHighlightName.value = name ?? null
  },
)

// Also watch the active workspace id: `listFiles` silently returns an empty
// directory when the workspace isn't loaded yet, and workspaces arrive
// asynchronously from the sidebar's fetch. Without this dependency, a cold
// load can race and leave the browser permanently empty until remount.
// `directoryCache` is keyed by path only, so it must be dropped the moment the
// workspace changes — otherwise this watch (which runs before the cache-clear
// watch below) could paint the previous workspace's listing for one tick.
let lastDirCacheWsId: string | null = null
watch(
  [currentPath, () => currentWorkspace.value?.id],
  ([path, wsId]) => {
    if (!wsId) return
    if (wsId !== lastDirCacheWsId) {
      directoryCache.clear()
      lastDirCacheWsId = wsId
    }
    // Paint the cached listing instantly so the grid swaps without a fetch
    // round-trip visible to the user; refreshFiles() then revalidates.
    let cached = directoryCache.get(pathKey(path))
    if (!cached) {
      // Cold mount: fall back to the Vue Query cache (warmed by the
      // workspace-entry prefetch or a prior fetch) so the grid paints
      // last-known data instead of flashing the skeleton.
      const warmed = getCachedDirectory(path)
      if (warmed) {
        cached = { folders: warmed.folders, files: warmed.files, order: warmed.order ?? [] }
        directoryCache.set(pathKey(path), cached)
      }
    }
    if (cached) {
      folders.value = cached.folders
      files.value = cached.files
      currentOrder.value = cached.order
    }
    refreshFiles()
  },
  { immediate: true },
)

// Invalidate the cache when the workspace flips so a stale listing from the
// previous workspace never shows up in the new one.
watch(() => currentWorkspace.value?.id, () => {
  directoryCache.clear()
  clearStorageListCache()
})

// Refresh when a local migration finishes so provider icons reflect the
// new backend without requiring a manual reload.
const { state: localMigrationState } = useLocalMigration()
watch(() => localMigrationState.status, (status, prev) => {
  if (prev === 'running' && (status === 'done' || status === 'failed')) {
    refreshFiles(true)
  }
})

useOnReconnect(() => {
  void refreshFiles(true)
})

// Realtime: useWorkspaceEvents bumps storageDirRev when the server reports a
// `files` change in this workspace (e.g. an agent uploads while we're viewing
// the folder). Revalidate the directory we're showing so it stays fresh while
// visible — the 800ms debounce upstream collapses bursts (e.g. a bulk upload).
watch(storageDirRev, () => {
  void refreshFiles(true)
})

function toggleSearch() {
  searchExpanded.value = !searchExpanded.value
  if (searchExpanded.value) {
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  } else {
    searchQuery.value = ''
  }
}

const isFilterOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLElement | null>(null)
const activeFilter = ref<'all' | 'images' | 'documents' | 'videos'>('all')

function toggleFilter() {
  isFilterOpen.value = !isFilterOpen.value
}

function closeFilter() {
  isFilterOpen.value = false
}

function setFilter(id: 'all' | 'images' | 'documents' | 'videos') {
  activeFilter.value = id
  closeFilter()
}

function handleClickOutside(event: MouseEvent) {
  if (filterRef.value && !filterRef.value.contains(event.target as Node)) {
    closeFilter()
  }
  if (searchRef.value && !searchRef.value.contains(event.target as Node)) {
    searchExpanded.value = false
    searchQuery.value = ''
  }
  if (selectedItem.value && !isMoveModalOpen.value && !isShareModalOpen.value && !isPermissionsModalOpen.value && !isInfoModalOpen.value) {
    const target = event.target as Element
    const clickedFileItem = target.closest('[data-file-item]')
    const clickedActionBar = selectionActionsRef.value?.contains(target as Node)
    if (!clickedFileItem && !clickedActionBar) {
      deselectItem()
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('click', handleMoveProviderClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('click', handleMoveProviderClickOutside)
})

const filterItems = [
  { id: 'all' as const, icon: 'file' },
  { id: 'images' as const, icon: 'image' },
  { id: 'documents' as const, icon: 'file-text' },
  { id: 'videos' as const, icon: 'video' },
]

function fuzzyMatch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi]!, ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

function iconToFilterType(icon: FileIconName): string[] {
  const map: Record<string, string[]> = {
    'image': ['image'],
    'file-code': ['document'],
    'file-text': ['document'],
    'video': ['video'],
    'audio': ['audio'],
    'key': ['key'],
    'archive': ['archive'],
    'calendar': ['document'],
    'spreadsheet': ['document'],
    'presentation': ['document'],
    'database': ['database'],
    'font': ['font'],
    'config': ['config'],
    'executable': ['executable'],
    'file': ['other'],
  }
  return map[icon] ?? ['other']
}

const filteredFiles = computed(() => {
  let resultFolders = folders.value.filter(f => !f.name.startsWith('.'))
  let resultFiles = files.value.filter(f => !f.name.startsWith('.'))

  if (activeFilter.value !== 'all') {
    const typeMap: Record<string, string[]> = {
      images: ['image'],
      documents: ['document', 'calendar', 'spreadsheet', 'presentation', 'file-text', 'file-code'],
      videos: ['video'],
    }
    const allowed = typeMap[activeFilter.value]
    if (allowed) {
      resultFiles = resultFiles.filter(f => {
        const icon = getIconForFile(f.name)
        const types = iconToFilterType(icon)
        return types.some(type => allowed.includes(type))
      })
      resultFolders = []
    }
  }

  const term = searchQuery.value
  if (term.trim()) {
    resultFolders = resultFolders.filter(f => fuzzyMatch(f.name, term))
    resultFiles = resultFiles.filter(f => fuzzyMatch(f.name, term))
  }

  const allItems = [
    ...resultFolders.map(f => ({ kind: 'folder' as const, name: f.name, path: f.path, provider: f.provider, icon: 'folder' as FileIconName, id: `folder-${f.name}`, size: f.size, empty: f.empty, createdAt: f.createdAt })),
    ...resultFiles.map(f => ({ kind: 'file' as const, name: f.name, path: f.path, provider: f.provider, icon: getIconForFile(f.name) as FileIconName, id: f.id, size: f.size, createdAt: f.createdAt, empty: false })),
  ]

  // Manual positioning only: ranked items (those the user has dragged) keep
  // their rank; unranked items stay in arrival order from the listing. No
  // alphabetical or folders-first fallback — the user's drag order is the
  // only source of truth.
  if (currentOrder.value.length) {
    const rank = new Map<string, number>()
    currentOrder.value.forEach((n, i) => rank.set(n, i))
    allItems.sort((a, b) => {
      const ra = rank.get(a.name)
      const rb = rank.get(b.name)
      if (ra === undefined && rb === undefined) return 0
      if (ra === undefined) return 1
      if (rb === undefined) return -1
      return ra - rb
    })
  }

  return allItems
})

const listItemsForView = computed(() => {
  const base = filteredFiles.value
  if (pendingDuplicate.value) {
    return [
      {
        isPendingDuplicate: true as const,
        id: 'pending-duplicate' as const,
        kind: pendingDuplicate.value.sourceKind as 'file' | 'folder',
        name: '',
        path: '',
        provider: storageProvider.value,
        icon: pendingDuplicate.value.sourceIcon,
        empty: false,
      },
      ...base,
    ]
  }
  if (pendingNewFolder.value) {
    return [
      {
        isPendingNew: true as const,
        id: 'pending-new-folder' as const,
        kind: 'folder' as const,
        name: '',
        path: '',
        provider: storageProvider.value,
        icon: 'folder' as FileIconName,
        empty: true,
      },
      ...base,
    ]
  }
  return base
})

/** Icon + copy centred in the whole white panel (behind the toolbar), not only below it */
const showEmptyFolderOverlay = computed(() => {
  if (listingLoading.value && filteredFiles.value.length === 0 && !pendingNewFolder.value && !pendingDuplicate.value) return false
  if (storageError.value) return false
  return listItemsForView.value.length === 0
})

function nextDefaultFolderName(): string {
  const existing = new Set<string>()
  for (const f of folders.value) existing.add(f.name)
  for (const f of files.value) existing.add(f.name)
  let n = 1
  while (existing.has(`folder ${n}`)) n++
  return `folder ${n}`
}

function resolveNewFolderFinalName(draft: string): string {
  const t = draft.trim()
  if (t) return t
  return nextDefaultFolderName()
}

type MaybePendingRow = { isPendingNew?: boolean; isPendingDuplicate?: boolean }

function isPendingRow<T>(item: T): item is T & ({ isPendingNew: true } | { isPendingDuplicate: true }) {
  const r = item as MaybePendingRow
  return r.isPendingNew === true || r.isPendingDuplicate === true
}

function toSelectedItem(item: typeof filteredFiles.value[number]): SelectedItem {
  return {
    kind: item.kind,
    name: item.name,
    path: item.path,
    icon: item.icon,
    provider: item.provider as StorageProvider,
  }
}

function isSelected(id: string): boolean {
  return selectedItemIds.value.has(id)
}

function selectItem(item: typeof filteredFiles.value[number]) {
  if (selectedItemId.value === item.id && selectedItemIds.value.size === 1) {
    deselectItem()
    return
  }
  const entry = toSelectedItem(item)
  selectedItemId.value = item.id
  selectedItem.value = entry
  selectedItemIds.value = new Set([item.id])
  selectedItemsMap.value = new Map([[item.id, entry]])
  selectedFileExtra.value = 'size' in item
    ? { size: item.size as number, createdAt: item.createdAt as string }
    : null
  searchExpanded.value = false
  searchQuery.value = ''
}

// Replace the current selection with the given set of items. Used by marquee
// drag: we keep the first-added id as the primary so single-target UI still
// has a sensible focus item even when several are highlighted. Accepts the
// union type from `listItemsForView` (which includes pending rows) and
// filters those out here so callers don't have to.
function setSelectionFromItems(items: Array<{ id: string; kind?: string; name?: string; path?: string; icon?: unknown; provider?: unknown; isPendingNew?: boolean; isPendingDuplicate?: boolean; size?: number; createdAt?: string }>) {
  const filtered = items.filter(i =>
    !i.isPendingNew &&
    !i.isPendingDuplicate &&
    (i.kind === 'file' || i.kind === 'folder'),
  ) as Array<typeof filteredFiles.value[number]>
  if (filtered.length === 0) {
    deselectItem()
    return
  }
  const idSet = new Set<string>()
  const entryMap = new Map<string, SelectedItem>()
  for (const item of filtered) {
    idSet.add(item.id)
    entryMap.set(item.id, toSelectedItem(item))
  }
  selectedItemIds.value = idSet
  selectedItemsMap.value = entryMap
  const primary = filtered[0]!
  selectedItemId.value = primary.id
  selectedItem.value = toSelectedItem(primary)
  selectedFileExtra.value = 'size' in primary
    ? { size: primary.size as number, createdAt: primary.createdAt as string }
    : null
  searchExpanded.value = false
  searchQuery.value = ''
  isRenaming.value = false
}

function deselectItem() {
  selectedItemId.value = null
  selectedItem.value = null
  selectedItemIds.value = new Set()
  selectedItemsMap.value = new Map()
  selectedFileExtra.value = null
  isRenaming.value = false
}

// Deeplink highlight: when the storage page passes highlightFileName (set
// from `?path=&kind=file` on the URL), wait for the file's directory to
// finish loading and select it the moment it appears. The watch clears
// pendingHighlightName after a successful match so subsequent navigation
// inside the browser doesn't keep snapping the user back.
watch(
  [filteredFiles, pendingHighlightName],
  ([items, name]) => {
    if (!name) return
    const match = items.find(i => i.kind === 'file' && i.name === name)
    if (!match) return
    selectItem(match)
    pendingHighlightName.value = null
  },
  { immediate: true },
)

function handleItemClick(item: typeof filteredFiles.value[number]) {
  if (item.kind === 'folder') {
    openFolder(item.name)
  } else {
    selectItem(item)
  }
}

function handleFolderClick(item: typeof filteredFiles.value[number]) {
  if (selectedItemId.value === item.id) {
    deselectItem()
  } else {
    selectItem(item)
  }
}

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  isUploading.value = true
  deselectItem()

  const filesToUpload = Array.from(input.files)
  const total = filesToUpload.length
  // Snapshot the upload target so navigating away mid-batch doesn't misplace
  // optimistic inserts or trigger a refresh of the wrong folder.
  const targetPath = [...currentPath.value]
  const targetDir = targetPath.join('/')
  const stillOnTarget = () =>
    currentPath.value.length === targetPath.length
    && currentPath.value.every((v, i) => v === targetPath[i])

  const filesLabel = t(total === 1 ? 'storage.fileSingular' : 'storage.filePlural')
  // Spinner toast stays up for the whole batch; counter ticks after each file
  // resolves so users see 1/4 → 2/4 → 3/4 → 4/4 rather than a frozen 0/N.
  const toastId = toast.show(t('storage.uploadProgress', { done: 0, total, files: filesLabel }), 'loading', 0)
  let failed = 0
  // Seeded once at the start of the batch so siblings keep their current ranks
  // and newly uploaded names append to the end rather than collapsing the
  // existing order.
  let workingOrder: string[] = snapshotOrder()
  let orderChanged = false

  for (let i = 0; i < total; i++) {
    const file = filesToUpload[i]!
    const ok = await uploadFile(targetPath, file)
    if (!ok) {
      failed++
    } else if (stillOnTarget()) {
      // Optimistic insert so finished files appear immediately instead of
      // waiting for the whole batch + one final list refresh. The final
      // refreshFiles() below swaps these placeholders for the real rows.
      const filePath = targetDir ? `${targetDir}/${file.name}` : file.name
      const record: StorageFile = {
        id: `optimistic-${Date.now()}-${i}`,
        name: file.name,
        path: filePath,
        size: file.size,
        createdAt: new Date().toISOString(),
        provider: storageProvider.value,
      }
      const existingIdx = files.value.findIndex(f => f.name === file.name)
      if (existingIdx >= 0) {
        const next = [...files.value]
        next[existingIdx] = record
        files.value = next
      } else {
        files.value = [...files.value, record]
      }
      if (!workingOrder.includes(file.name)) {
        workingOrder.push(file.name)
        orderChanged = true
      }
    }
    toast.update(toastId, {
      message: t('storage.uploadProgress', { done: i + 1, total, files: filesLabel }),
    })
  }

  if (orderChanged && stillOnTarget()) {
    await persistOrder(workingOrder)
  }

  if (failed === 0) {
    const key = total === 1 ? 'storage.uploadDoneOne' : 'storage.uploadDoneMany'
    toast.update(toastId, { message: t(key, { total }), type: 'info' })
    setTimeout(() => toast.dismiss(toastId), 3000)
  } else if (failed === total) {
    const key = total === 1 ? 'storage.uploadFailedAllOne' : 'storage.uploadFailedAllMany'
    toast.update(toastId, { message: t(key, { total }), type: 'error' })
    setTimeout(() => toast.dismiss(toastId), 6000)
  } else {
    toast.update(toastId, {
      message: t('storage.uploadFailedSome', { ok: total - failed, total, failed }),
      type: 'error',
    })
    setTimeout(() => toast.dismiss(toastId), 6000)
  }

  isUploading.value = false
  input.value = ''
  if (stillOnTarget()) await refreshFiles(true)
}

function startNewFolder() {
  if (pendingNewFolder.value) return
  if (pendingDuplicate.value) cancelPendingDuplicate()
  deselectItem()
  folderOpMessage.value = null
  pendingNewFolder.value = { draftName: nextDefaultFolderName() }
  focusNewFolderInput()
}

async function commitPendingNewFolder() {
  const state = pendingNewFolder.value
  if (!state) return
  const finalName = resolveNewFolderFinalName(state.draftName)

  // Optimistic UI: render the new folder immediately so pressing Enter feels
  // instant. The real create fires in the background; refreshFiles() reconciles
  // against the canonical listing (or removes the placeholder on failure, where
  // folderOpMessage surfaces the reason via the existing banner).
  const parentJoined = currentPath.value.filter(Boolean).join('/')
  const optimisticPath = parentJoined ? `${parentJoined}/${finalName}` : finalName
  const optimisticFolder: StorageFolder = {
    name: finalName,
    path: optimisticPath,
    provider: storageProvider.value,
    size: 0,
    empty: true,
    createdAt: new Date().toISOString(),
  }
  const alreadyExists = folders.value.some(f => f.name === finalName)
  // Prepend + rank first so the new folder takes over the pending row's
  // top-left slot when the pending clears. Appending instead would force every
  // sibling to shift left by one cell, and refreshFiles() would later re-sort
  // to alphabetical (or the persisted drag rank) and shift things again — the
  // "shift left then back" the user sees. Persisting the rank keeps the
  // server's subsequent listing aligned with what's already on screen.
  let persistedOrder: string[] | null = null
  if (!alreadyExists) {
    folders.value = [optimisticFolder, ...folders.value]
    persistedOrder = [finalName, ...currentOrder.value.filter(n => n !== finalName)]
    currentOrder.value = persistedOrder
  }
  pendingNewFolder.value = null

  void (async () => {
    const ok = await createFolder(currentPath.value, finalName)
    if (!ok) {
      if (!alreadyExists) {
        folders.value = folders.value.filter(f => f.path !== optimisticPath)
        currentOrder.value = currentOrder.value.filter(n => n !== finalName)
      }
      return
    }
    if (persistedOrder) {
      await reorderFiles(parentJoined, persistedOrder)
    }
    await refreshFiles(true)
  })()
}

function cancelPendingNewFolder() {
  pendingNewFolder.value = null
  folderOpMessage.value = null
}

function focusPendingFolderInput() {
  focusNewFolderInput()
}

function nextDuplicateName(sourceName: string, kind: 'file' | 'folder'): string {
  const existing = new Set<string>()
  for (const f of folders.value) existing.add(f.name)
  for (const f of files.value) existing.add(f.name)

  if (kind === 'file') {
    const lastDot = sourceName.lastIndexOf('.')
    const baseName = lastDot > 0 ? sourceName.slice(0, lastDot) : sourceName
    const ext = lastDot > 0 ? sourceName.slice(lastDot) : ''
    let candidate = `${baseName} copy${ext}`
    if (!existing.has(candidate)) return candidate
    let n = 2
    while (existing.has(`${baseName} copy ${n}${ext}`)) n++
    return `${baseName} copy ${n}${ext}`
  }

  let candidate = `${sourceName} copy`
  if (!existing.has(candidate)) return candidate
  let n = 2
  while (existing.has(`${sourceName} copy ${n}`)) n++
  return `${sourceName} copy ${n}`
}

function startDuplicate() {
  if (selectedItemsMap.value.size === 0) return
  if (pendingDuplicate.value) return
  if (pendingNewFolder.value) cancelPendingNewFolder()
  folderOpMessage.value = null

  // Multi-select: skip the inline-rename prompt (one input can only edit one
  // name) and duplicate each item with an auto-generated " copy" name. Single
  // select keeps the inline rename so the user can tweak the copy's name
  // before commit.
  if (isMultiSelection.value) {
    const targets = Array.from(selectedItemsMap.value.values())
    deselectItem()
    void (async () => {
      const takenNames = new Set<string>()
      for (const f of folders.value) takenNames.add(f.name)
      for (const f of files.value) takenNames.add(f.name)
      let anyFailed = false
      for (const item of targets) {
        const finalName = reserveDuplicateName(item.name, item.kind, takenNames)
        takenNames.add(finalName)
        const ok = await performDuplicate(item, finalName)
        if (!ok) anyFailed = true
      }
      if (anyFailed) toast.show(t('storage.orderSaveFailed'), 'error')
      await refreshFiles(true)
    })()
    return
  }

  const primary = selectedItem.value
  if (!primary) return
  pendingDuplicate.value = {
    draftName: nextDuplicateName(primary.name, primary.kind),
    sourceKind: primary.kind,
    sourceName: primary.name,
    sourceIcon: primary.icon,
  }
  deselectItem()
  focusDuplicateInput()
}

// Shared name-picker that takes an explicit `taken` set so batch duplication
// doesn't hand the same " copy" name to two sibling items.
function reserveDuplicateName(sourceName: string, kind: 'file' | 'folder', taken: Set<string>): string {
  if (kind === 'file') {
    const lastDot = sourceName.lastIndexOf('.')
    const baseName = lastDot > 0 ? sourceName.slice(0, lastDot) : sourceName
    const ext = lastDot > 0 ? sourceName.slice(lastDot) : ''
    let candidate = `${baseName} copy${ext}`
    if (!taken.has(candidate)) return candidate
    let n = 2
    while (taken.has(`${baseName} copy ${n}${ext}`)) n++
    return `${baseName} copy ${n}${ext}`
  }
  let candidate = `${sourceName} copy`
  if (!taken.has(candidate)) return candidate
  let n = 2
  while (taken.has(`${sourceName} copy ${n}`)) n++
  return `${sourceName} copy ${n}`
}

async function performDuplicate(item: SelectedItem, finalName: string): Promise<boolean> {
  if (item.kind === 'file') {
    const rel = stripUserPrefix(item.path)
    const lastSlash = rel.lastIndexOf('/')
    const dir = lastSlash >= 0 ? rel.slice(0, lastSlash + 1) : ''
    return await copyStorageFile(rel, `${dir}${finalName}`)
  }
  const sourceSegments = [...currentPath.value, item.name]
  return await copyStorageFolder(sourceSegments, finalName)
}

async function commitPendingDuplicate() {
  const state = pendingDuplicate.value
  if (!state) return
  const finalName = state.draftName.trim()
  if (!finalName) {
    cancelPendingDuplicate()
    return
  }
  if (finalName === state.sourceName) {
    cancelPendingDuplicate()
    return
  }

  // Rank the duplicate immediately after its source so the new entry appears
  // right where the user expects rather than at the tail after the next
  // listing refresh.
  const nextOrder = snapshotOrder().filter(n => n !== finalName)
  const srcIdx = nextOrder.indexOf(state.sourceName)
  if (srcIdx >= 0) nextOrder.splice(srcIdx + 1, 0, finalName)
  else nextOrder.push(finalName)

  if (state.sourceKind === 'file') {
    const itemRelativePath = stripUserPrefix(
      files.value.find(f => f.name === state.sourceName)?.path ?? ''
    )
    const lastSlash = itemRelativePath.lastIndexOf('/')
    const dir = lastSlash >= 0 ? itemRelativePath.slice(0, lastSlash + 1) : ''
    const destPath = `${dir}${finalName}`
    const ok = await copyStorageFile(itemRelativePath, destPath)
    if (ok) {
      pendingDuplicate.value = null
      await persistOrder(nextOrder)
      await refreshFiles(true)
    }
  } else {
    const sourceSegments = [...currentPath.value, state.sourceName]
    const ok = await copyStorageFolder(sourceSegments, finalName)
    if (ok) {
      pendingDuplicate.value = null
      await persistOrder(nextOrder)
      await refreshFiles(true)
    }
  }
}

function cancelPendingDuplicate() {
  pendingDuplicate.value = null
  folderOpMessage.value = null
}

function handleRowClick(item: (typeof listItemsForView.value)[number]) {
  if (isPendingRow(item)) {
    if ('isPendingDuplicate' in item && item.isPendingDuplicate) focusDuplicateInput()
    else focusPendingFolderInput()
    return
  }
  if (item.kind === 'folder') handleFolderClick(item)
  else handleItemClick(item)
}

function handleRowDblClick(item: (typeof listItemsForView.value)[number]) {
  if (isPendingRow(item)) return
  if (item.kind === 'folder') openFolder(item.name)
  else openPreview(item)
}

function startRename() {
  if (!selectedItem.value) return
  isRenaming.value = true
  renameInput.value = selectedItem.value.name
  nextTick(() => {
    const el = resolveRenameInputEl()
    if (!el) return
    el.focus()
    el.select()
    requestAnimationFrame(() => el.select())
  })
}

async function confirmRename() {
  if (!selectedItem.value) return
  const newName = renameInput.value.trim()
  if (!newName || newName === selectedItem.value.name) {
    isRenaming.value = false
    return
  }
  const item = selectedItem.value
  const relativePath = stripUserPrefix(item.path)

  // Optimistic UI: update the row in place so Enter/blur feels instant. Swap
  // only the final path segment to keep the directory prefix intact.
  const lastSlash = item.path.lastIndexOf('/')
  const pathPrefix = lastSlash >= 0 ? item.path.slice(0, lastSlash + 1) : ''
  const newPath = `${pathPrefix}${newName}`
  if (item.kind === 'folder') {
    folders.value = folders.value.map(f =>
      f.path === item.path ? { ...f, name: newName, path: newPath } : f,
    )
  } else {
    files.value = files.value.map(f =>
      f.path === item.path ? { ...f, name: newName, path: newPath } : f,
    )
  }
  // Keep the manual-position rank tied to the renamed item — otherwise the old
  // name lingers in currentOrder, the new name is unranked, and the item drops
  // to the tail on next refresh. Seed from the current view when no explicit
  // order has been persisted yet so siblings don't collapse to unranked.
  const renamedOrder = snapshotOrder().map(n => (n === item.name ? newName : n))
  if (!renamedOrder.includes(newName)) renamedOrder.push(newName)
  currentOrder.value = renamedOrder
  isRenaming.value = false
  deselectItem()

  void (async () => {
    const ok = item.kind === 'folder'
      ? await renameFolder(relativePath, newName)
      : await renameFile(relativePath, newName)
    if (!ok) {
      toast.show(t('storage.renameFailed'), 'error')
      await refreshFiles(true)
      return
    }
    await persistOrder(renamedOrder)
    await refreshFiles(true)
  })()
}

function cancelRename() {
  isRenaming.value = false
  renameInput.value = ''
}

async function handleDelete() {
  const targets = Array.from(selectedItemsMap.value.values())
  if (targets.length === 0) return

  // Split by kind so each `deleteFiles` call stays homogeneous — the backend
  // takes a single `kind` per batch.
  const filePaths = new Set<string>()
  const folderPaths = new Set<string>()
  const allItemPaths = new Set<string>()
  const allItemNames = new Set<string>()
  for (const item of targets) {
    allItemPaths.add(item.path)
    allItemNames.add(item.name)
    const rel = stripUserPrefix(item.path)
    if (item.kind === 'folder') folderPaths.add(rel)
    else filePaths.add(rel)
  }

  // Optimistic removal from the current view. `refreshFiles()` reconciles if
  // the backend rejects the delete.
  folders.value = folders.value.filter(f => !allItemPaths.has(f.path))
  files.value = files.value.filter(f => !allItemPaths.has(f.path))
  const pruned = currentOrder.value.filter(n => !allItemNames.has(n))
  const orderChanged = pruned.length !== currentOrder.value.length
  if (orderChanged) currentOrder.value = pruned
  deselectItem()

  void (async () => {
    const ops: Array<Promise<boolean>> = []
    if (filePaths.size > 0) ops.push(deleteFiles([...filePaths], 'file'))
    if (folderPaths.size > 0) ops.push(deleteFiles([...folderPaths], 'folder'))
    const results = await Promise.all(ops)
    const allOk = results.every(Boolean)
    if (!allOk) {
      toast.show(t('storage.deleteFailed'), 'error')
      await refreshFiles(true)
      return
    }
    if (orderChanged) await persistOrder(pruned)
  })()
}

async function openMoveModal() {
  if (selectedItemsMap.value.size === 0) return
  const initialPath = [...currentPath.value]
  moveTreeRoot.value = {
    name: '',
    path: [],
    children: null,
    loadingPromise: null,
    expanded: false,
  }
  moveSelectedPath.value = initialPath
  // Default the provider override to whichever provider holds the current
  // folder we open into, falling back to the first selected item's provider
  // (for root) so the dropdown reflects the items' "home" before any move.
  const firstSelected = selectedItemsMap.value.values().next().value
  moveTargetProviderOverride.value = (firstSelected?.provider as StorageProvider | undefined) ?? null
  moveProviderMenuOpen.value = false
  isMoveModalOpen.value = true
  await expandMoveNode(moveTreeRoot.value)
  let cursor: MoveTreeNode = moveTreeRoot.value
  for (const segment of initialPath) {
    const child = cursor.children?.find(c => c.name === segment)
    if (!child) break
    await expandMoveNode(child)
    cursor = child
  }
}

async function loadMoveNodeChildren(node: MoveTreeNode): Promise<void> {
  if (node.children !== null) return
  if (node.loadingPromise) {
    await node.loadingPromise
    return
  }
  const promise = (async () => {
    const result = await listFiles(node.path)
    const excluded = new Set<string>()
    for (const item of selectedItemsMap.value.values()) {
      if (item.kind !== 'folder') continue
      excluded.add(stripUserPrefix(item.path))
    }
    node.children = result.folders
      .filter((f) => {
        const childPath = [...node.path, f.name].join('/')
        return !excluded.has(childPath)
      })
      .map<MoveTreeNode>(f => ({
        name: f.name,
        path: [...node.path, f.name],
        children: null,
        loadingPromise: null,
        expanded: false,
        provider: f.provider as StorageProvider,
      }))
  })()
  node.loadingPromise = promise
  try {
    await promise
  } finally {
    node.loadingPromise = null
  }
}

// Prefetch one level deeper than what will be rendered so each visible child's
// chevron reflects whether it has subfolders, without waiting for a user click.
async function expandMoveNode(node: MoveTreeNode): Promise<void> {
  await loadMoveNodeChildren(node)
  const children = node.children ?? []
  await Promise.all(children.map(c => loadMoveNodeChildren(c)))
  node.expanded = true
}

async function toggleMoveNodeExpand(node: MoveTreeNode): Promise<void> {
  if (node.expanded) {
    node.expanded = false
  } else {
    await expandMoveNode(node)
  }
}

function selectMoveDestination(node: MoveTreeNode) {
  moveSelectedPath.value = [...node.path]
  if (!node.expanded && node.children !== null && node.children.length > 0) {
    void expandMoveNode(node)
  }
}

// ---------------------------------------------------------------------------
// Move vs cross-provider migration.
//
// Any code path that moves items into a folder (drag-drop + Move-To modal)
// routes through `beginMoveOrMigrate`. If every item already lives on the
// destination folder's provider, it's a plain move via the existing moveFile
// endpoint (fast, no data transfer). If any item lives on a different
// provider, we open the MigrateConfirmModal; the user confirms, and the
// server-side /files/migrate-items handler copies the bytes + flips the
// metadata + drops the source. Partial failures leave successes intact and
// surface an error toast listing the count that failed — per product spec.

interface PlannedMigrationItem {
  path: string
  name: string
  kind: 'file' | 'folder'
  provider: StorageProvider
  icon: FileIconName
}

interface PendingMigration {
  items: PlannedMigrationItem[]
  targetProvider: StorageProvider
  targetParent: string
  targetParentName: string
  onComplete: () => void | Promise<void>
}

const pendingMigration = ref<PendingMigration | null>(null)
const isMigrationRunning = ref(false)

const migrationGroups = computed<MigrateConfirmGroup[]>(() => {
  const m = pendingMigration.value
  if (!m) return []
  const byProvider = new Map<StorageProvider, MigrateConfirmGroup>()
  for (const item of m.items) {
    // Only list cross-provider items in the modal — same-provider items pass
    // through as a normal move and don't need user consent.
    if (item.provider === m.targetProvider) continue
    const existing = byProvider.get(item.provider)
    if (existing) {
      existing.items.push({ name: item.name, kind: item.kind, icon: item.icon })
    } else {
      byProvider.set(item.provider, {
        sourceProvider: item.provider,
        items: [{ name: item.name, kind: item.kind, icon: item.icon }],
      })
    }
  }
  return Array.from(byProvider.values())
})

// How a single planned item gets relocated, given where it lives and where
// it's headed. Three real backends (local, google-drive, b2) make the matrix
// non-trivial, and Cloud (B2) is the tricky one: B2 objects are keyed by their
// logical path, so a B2 "move"/rename is a server-side copy-to-new-key, never
// a bare metadata path rewrite.
//   metadata — same provider, non-Cloud: /files/move path rewrite is safe
//              (Drive/local bytes are keyed by id, not path).
//   server   — handled end-to-end by the server (migrate-items): b2→b2 copy,
//              drive↔b2 byte transfer, drive→drive rename, and folders whose
//              descendants the server can move (no 'local' involved).
//   client   — cross-provider FILE moves that touch 'local'; OPFS bytes live
//              only in this browser, so the client streams them.
//   deferred — cross-provider FOLDER moves that touch 'local': each descendant
//              would need a client byte hop. Not supported yet; errors clearly.
type MoveRoute = 'metadata' | 'server' | 'client' | 'deferred'
function routeForMove(item: PlannedMigrationItem, target: StorageProvider): MoveRoute {
  if (item.provider === target) {
    // Same provider: B2 still needs a server-side object copy (path-keyed);
    // Drive/local are a pure metadata path rewrite.
    return target === 'b2' ? 'server' : 'metadata'
  }
  if (item.kind === 'file') {
    return (item.provider === 'local' || target === 'local') ? 'client' : 'server'
  }
  // Cross-provider folder.
  return (item.provider === 'local' || target === 'local') ? 'deferred' : 'server'
}

// Executes a mixed batch of planned moves, dispatching each item to the right
// mechanism and aggregating successes + per-item failures. Partial failure is
// non-fatal (mirrors the existing migrate semantics).
async function runMigrationBatch(
  items: PlannedMigrationItem[],
  target: StorageProvider,
  targetParent: string,
): Promise<{ migrated: number; errors: { path: string; reason: string }[] }> {
  const metaItems: PlannedMigrationItem[] = []
  const serverItems: PlannedMigrationItem[] = []
  const clientItems: PlannedMigrationItem[] = []
  const deferred: PlannedMigrationItem[] = []
  for (const i of items) {
    const route = routeForMove(i, target)
    if (route === 'metadata') metaItems.push(i)
    else if (route === 'server') serverItems.push(i)
    else if (route === 'client') clientItems.push(i)
    else deferred.push(i)
  }

  let migrated = 0
  const errors: { path: string; reason: string }[] = []
  const destOf = (name: string) => (targetParent.length > 0 ? `${targetParent}/${name}` : name)

  // Same-provider, non-Cloud: metadata path rewrite.
  for (const i of metaItems) {
    const ok = await moveFile(stripUserPrefix(i.path), destOf(i.name), i.kind)
    if (ok) migrated++
    else errors.push({ path: i.path, reason: 'move_failed' })
  }

  // Server-handled (b2↔drive, b2→b2, drive rename, no-local folders).
  if (serverItems.length > 0) {
    const payload = serverItems.map(i => ({ path: stripUserPrefix(i.path), kind: i.kind }))
    const res = await migrateItems(payload, target, targetParent)
    migrated += res.migrated.length
    for (const e of res.errors) errors.push(e)
  }

  // Client-driven (local-involved cross-provider files).
  for (const i of clientItems) {
    const res = await transferLocalFile(stripUserPrefix(i.path), destOf(i.name), i.provider, target)
    if (res.ok) migrated++
    else errors.push({ path: i.path, reason: res.reason ?? 'transfer_failed' })
  }

  for (const i of deferred) {
    errors.push({ path: i.path, reason: 'folder_cross_provider_unsupported' })
  }

  return { migrated, errors }
}

// Runs a batch with the sticky loading toast + result toast + cache flush.
// Shared by the silent path (same-Cloud reorganisation) and the confirm-modal
// path (genuine cross-provider transfers).
async function executeMigration(
  items: PlannedMigrationItem[],
  target: StorageProvider,
  targetParent: string,
  onComplete: () => void | Promise<void>,
) {
  isMigrationRunning.value = true
  const total = items.length
  // Sticky loading toast (duration 0 = no auto-dismiss) stays up for the whole
  // batch; on completion we dismiss it and raise a fresh fixed-lifetime toast.
  const loadingToastId = toast.show(
    total === 1 ? t('storage.moveToast.movingOne', { n: total }) : t('storage.moveToast.movingMany', { n: total }),
    'loading',
    0,
  )
  try {
    const { migrated, errors } = await runMigrationBatch(items, target, targetParent)
    toast.dismiss(loadingToastId)
    if (errors.length === 0) {
      toast.show(
        migrated === 1 ? t('storage.moveToast.movedOne', { n: migrated }) : t('storage.moveToast.movedMany', { n: migrated }),
        'info',
        4000,
      )
    }
    else if (errors[0]?.reason === 'cloud_cap') {
      // The upgrade prompt already fired inside transferLocalFile.
      toast.show(t('storage.moveToast.cloudLimit'), 'error', 6000)
    }
    else if (migrated === 0) {
      toast.show(t('storage.moveToast.failed', { reason: errors[0]?.reason ?? t('storage.moveToast.unknownError') }), 'error', 6000)
    }
    else {
      toast.show(t('storage.moveToast.partial', { migrated, failed: errors.length }), 'error', 6000)
    }
  }
  catch (err) {
    toast.dismiss(loadingToastId)
    const reason = err instanceof Error ? err.message : String(err)
    toast.show(t('storage.moveToast.failed', { reason }), 'error', 6000)
  }
  finally {
    isMigrationRunning.value = false
    // Cross-provider changes touch multiple paths (source + target + any
    // descendants for folder moves). The path-keyed directoryCache would paint
    // stale entries if the user navigated back to the source right after; a
    // full flush is cheap and sidesteps partial-invalidation bugs.
    directoryCache.clear()
    clearStorageListCache()
    await onComplete()
  }
}

function beginMoveOrMigrate(
  items: PlannedMigrationItem[],
  targetProvider: StorageProvider,
  targetParent: string,
  targetParentName: string,
  onDone: () => void | Promise<void>,
) {
  if (items.length === 0) return
  const routes = items.map(i => routeForMove(i, targetProvider))

  if (routes.every(r => r === 'metadata')) {
    // Fast path: pure same-provider non-Cloud move. Stay inline so callers'
    // optimistic UI behaviour is preserved.
    void (async () => {
      let anyFailed = false
      for (const item of items) {
        const rel = stripUserPrefix(item.path)
        const dest = targetParent.length > 0 ? `${targetParent}/${item.name}` : item.name
        const ok = await moveFile(rel, dest, item.kind)
        if (!ok) anyFailed = true
      }
      if (anyFailed) toast.show(t('storage.orderSaveFailed'), 'error')
      await onDone()
    })()
    return
  }

  // If nothing actually crosses providers (e.g. a Cloud→Cloud reorganisation
  // that still needs a server object copy), run it silently — the migrate
  // confirmation modal only makes sense for genuine cross-provider transfers.
  const hasCrossProvider = items.some(i => i.provider !== targetProvider)
  if (!hasCrossProvider) {
    void executeMigration(items, targetProvider, targetParent, onDone)
    return
  }

  pendingMigration.value = {
    items,
    targetProvider,
    targetParent,
    targetParentName,
    onComplete: onDone,
  }
}

async function confirmMigration() {
  const m = pendingMigration.value
  if (!m) return
  // Keep the modal mounted (showing its migrating state) for the duration of
  // the batch; clear it only once the work + refresh have settled.
  try {
    await executeMigration(m.items, m.targetProvider, m.targetParent, m.onComplete)
  }
  finally {
    pendingMigration.value = null
  }
}

async function cancelMigration() {
  const m = pendingMigration.value
  pendingMigration.value = null
  if (m) await m.onComplete()
}

async function confirmMove() {
  const targets = Array.from(selectedItemsMap.value.values())
  if (targets.length === 0) return
  const destDir = moveSelectedPath.value.join('/')
  // Destination provider comes from `effectiveMoveTargetProvider`: locked to
  // the chosen folder's provider when one is selected, otherwise driven by
  // the explicit provider dropdown (root case).
  const destProvider: StorageProvider = effectiveMoveTargetProvider.value
  const destName = moveSelectedPath.value.length === 0
    ? 'Home'
    : (moveSelectedPath.value[moveSelectedPath.value.length - 1] ?? 'Home')

  const planned: PlannedMigrationItem[] = targets.map(item => ({
    path: item.path,
    name: item.name,
    kind: item.kind,
    provider: item.provider,
    icon: item.icon,
  }))

  // Close move modal before (potentially) opening the migrate modal so we
  // don't stack two modals on top of each other.
  isMoveModalOpen.value = false

  beginMoveOrMigrate(
    planned,
    destProvider,
    destDir,
    destName,
    async () => {
      deselectItem()
      await refreshFiles(true)
    },
  )
}

function findMoveNode(path: string[]): MoveTreeNode | null {
  let cursor: MoveTreeNode = moveTreeRoot.value
  for (const segment of path) {
    const next = cursor.children?.find(c => c.name === segment)
    if (!next) return null
    cursor = next
  }
  return cursor
}

function cancelMove() {
  isMoveModalOpen.value = false
  moveSelectedPath.value = []
  moveTargetProviderOverride.value = null
  moveProviderMenuOpen.value = false
}

async function handleDownload() {
  if (!selectedItem.value || selectedItem.value.kind === 'folder') return
  const relativePath = stripUserPrefix(selectedItem.value.path)
  await downloadFile(relativePath)
}

// ---------------------------------------------------------------------------
// Drag-and-drop: reorder + drop-into-folder via vue-draggable-plus.
//
// `displayItems` is a writable mirror of `listItemsForView` that SortableJS
// mutates during a drag. On drag end we either persist the new order (pure
// reorder) or trigger `moveFile` (drop-into-folder), depending on which zone
// the pointer was in when the user released.

type DisplayItem = (typeof listItemsForView.value)[number]
const displayItems = ref<DisplayItem[]>([])
let suppressRebuild = false
let pendingDropInto: { name: string; path: string; element: HTMLElement; provider: StorageProvider } | null = null
// Reactive drag flag: while an item is being dragged, siblings suppress their
// hover highlight so the only visible affordance is the drop-into outline from
// `pendingDropInto`. Without this, CSS `:hover` still matches under the cursor
// and every row lights up as the drag passes over it.
const isDragging = ref(false)

// Multi-drag: when the user grabs an item that's part of a multi-selection, we
// freeze the selection, block SortableJS reorders (drop-into-folder only), and
// render a custom stacked-icon ghost that follows the cursor. The regular
// SortableJS clone stays transparent (see `.fb-drag` CSS) so it doesn't
// conflict visually.
const multiDragActive = ref(false)
const multiDragHasMoved = ref(false)
const multiDragCursor = ref<{ x: number; y: number } | null>(null)
const multiDragItems = ref<SelectedItem[]>([])

watch(listItemsForView, (next) => {
  if (suppressRebuild) {
    suppressRebuild = false
    return
  }
  displayItems.value = [...next]
}, { immediate: true, deep: true })

function clearDropIntoHighlight() {
  document.querySelectorAll('.fb-drop-into').forEach(el => el.classList.remove('fb-drop-into'))
}

function parseRowData(el: HTMLElement | null | undefined): { kind: 'file' | 'folder'; name: string; path: string; provider?: StorageProvider } | null {
  const raw = el?.dataset?.item
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.kind === 'file' || parsed.kind === 'folder') && typeof parsed.path === 'string') {
      return parsed
    }
  } catch {}
  return null
}

function onSortableMove(evt: Sortable.MoveEvent, originalEvent?: Event): boolean {
  clearDropIntoHighlight()
  pendingDropInto = null

  const related = evt.related as HTMLElement | null
  const dragged = parseRowData(evt.dragged as HTMLElement | null)
  const target = parseRowData(related)
  if (!target) return true

  // Reject targets that are part of the multi-drag selection (can't drop the
  // group into one of its own members), and folders that are ancestors of any
  // selected folder. In single-drag we check only the dragged item; in
  // multi-drag every selected folder is a potential source.
  if (multiDragActive.value) {
    for (const item of multiDragItems.value) {
      if (target.path === item.path) return false
      if (item.kind === 'folder' && target.path.startsWith(`${item.path}/`)) return false
    }
  } else {
    if (!dragged) return true
    // Never drop onto self.
    if (target.path === dragged.path) return false
    // Never drop a folder into its own descendant.
    if (dragged.kind === 'folder' && target.path.startsWith(`${dragged.path}/`)) return false
  }

  // Drop-into-folder zone. List rows are short (~37px) so a tight middle
  // band is hard to land in — use the middle 66% there, leaving thin
  // top/bottom strips for reorder. In ICON (grid) view we need BOTH axes
  // with a tighter band: otherwise dragging horizontally across a row puts
  // the cursor at the vertical midline of every cell it passes, so every
  // folder along the way returned `false` from onMove and blocked the
  // reorder swap — which looked like "siblings never shift".
  if (target.kind === 'folder' && related) {
    const rect: DOMRect = (evt.relatedRect as DOMRect | undefined) ?? related.getBoundingClientRect()
    let x = 0
    let y = 0
    if (originalEvent) {
      if ('clientX' in originalEvent && typeof (originalEvent as MouseEvent).clientX === 'number') {
        x = (originalEvent as MouseEvent).clientX
        y = (originalEvent as MouseEvent).clientY
      } else if ('touches' in originalEvent && (originalEvent as TouchEvent).touches[0]) {
        x = (originalEvent as TouchEvent).touches[0]!.clientX
        y = (originalEvent as TouchEvent).touches[0]!.clientY
      }
    }
    const yMargin = viewMode.value === 'icon' ? 0.3 : 0.17
    const inMidY = y >= rect.top + rect.height * yMargin && y <= rect.bottom - rect.height * yMargin
    const inMidX = x >= rect.left + rect.width * 0.3 && x <= rect.right - rect.width * 0.3
    const inMid = viewMode.value === 'icon' ? (inMidX && inMidY) : inMidY
    if (inMid) {
      related.classList.add('fb-drop-into')
      pendingDropInto = {
        name: target.name,
        path: target.path,
        element: related,
        provider: (target.provider as StorageProvider) ?? storageProvider.value,
      }
      return false
    }
  }
  // In multi-drag, never let SortableJS reorder — the group is represented by
  // the floating stack, not by a position in the current list.
  if (multiDragActive.value) return false
  return true
}

// SortableJS's onMove only fires while the cursor is over another sortable
// row, so moving into empty space (or back onto the dragged item) leaves
// `pendingDropInto` stuck on the last folder that was hovered. This listener
// runs during the whole drag and clears the pending target as soon as the
// cursor leaves the stored folder's drop-into zone, so the highlight lets go
// in real time and the drop doesn't fall into the wrong folder.
function onDragPointerMove(ev: PointerEvent) {
  // Track cursor for the multi-drag stacked ghost. Once the user has actually
  // moved after grabbing, flip `multiDragHasMoved` so the stack becomes
  // visible — per spec, a plain grab with no motion should look like a normal
  // selection, not a collapsed bundle.
  if (multiDragActive.value) {
    multiDragCursor.value = { x: ev.clientX, y: ev.clientY }
    if (!multiDragHasMoved.value) multiDragHasMoved.value = true
  }
  if (!pendingDropInto) return
  const rect = pendingDropInto.element.getBoundingClientRect()
  const yMargin = viewMode.value === 'icon' ? 0.3 : 0.17
  const inMidY = ev.clientY >= rect.top + rect.height * yMargin &&
                 ev.clientY <= rect.bottom - rect.height * yMargin
  const inMidX = ev.clientX >= rect.left + rect.width * 0.3 &&
                 ev.clientX <= rect.right - rect.width * 0.3
  // Mirror onSortableMove's zone: 2D in grid view, Y-only in list view.
  const inside = viewMode.value === 'icon'
    ? (inMidX && inMidY)
    : (inMidY && ev.clientX >= rect.left && ev.clientX <= rect.right)
  if (!inside) {
    pendingDropInto.element.classList.remove('fb-drop-into')
    pendingDropInto = null
  }
}

function onSortableStart(evt: DraggableEvent) {
  const item = evt?.item as HTMLElement | undefined
  const grabbedId = item?.dataset?.id ?? null
  // Match the grabbed row against the existing selection by id first, with a
  // path fallback in case the row re-rendered between select and grab and the
  // id reference drifted. Any match proves "this grab happened within a
  // selected item's handle", which is the cue to enter multi-drag.
  const grabbedPath = item ? parseRowData(item)?.path ?? null : null
  let grabbedIsSelected = false
  if (grabbedId && selectedItemIds.value.has(grabbedId)) {
    grabbedIsSelected = true
  } else if (grabbedPath) {
    for (const sel of selectedItemsMap.value.values()) {
      if (sel.path === grabbedPath) { grabbedIsSelected = true; break }
    }
  }

  if (grabbedIsSelected && selectedItemIds.value.size > 1) {
    // Keep the selection so `isSelected()` keeps returning true for every row;
    // the opacity binding fades them together this same frame so there's no
    // window where only the grabbed item looks ghosted (which otherwise reads
    // as single-item drag).
    multiDragActive.value = true
    multiDragHasMoved.value = false
    multiDragCursor.value = null
    multiDragItems.value = Array.from(selectedItemsMap.value.values())
  } else {
    // Single-item path: drop the prior focus border so the one dragged row
    // doesn't carry a lingering selection highlight.
    deselectItem()
  }
  isDragging.value = true
  document.addEventListener('pointermove', onDragPointerMove, true)
}

async function onSortableEnd(evt: DraggableEvent) {
  isDragging.value = false
  document.removeEventListener('pointermove', onDragPointerMove, true)
  const dropTarget = pendingDropInto
  pendingDropInto = null
  clearDropIntoHighlight()

  // Multi-drag branch: either drop the whole group into a target folder, or
  // cancel (no reorder was allowed anyway since onMove returned false).
  if (multiDragActive.value) {
    const items = multiDragItems.value.slice()
    const droppedInto = dropTarget
    multiDragActive.value = false
    multiDragHasMoved.value = false
    multiDragCursor.value = null
    multiDragItems.value = []

    if (!droppedInto || items.length === 0) {
      // Nothing to do — SortableJS didn't move anything because onMove
      // rejected every swap. Keep the current displayItems; selection stays.
      return
    }

    const planned: PlannedMigrationItem[] = items.map(i => ({
      path: i.path,
      name: i.name,
      kind: i.kind,
      provider: i.provider,
      icon: i.icon,
    }))
    const hasCrossProvider = planned.some(i => i.provider !== droppedInto.provider)

    // Same-provider batch: keep the snappy optimistic removal. Cross-provider
    // would ask the user first, so we leave items visible until they confirm.
    if (!hasCrossProvider) {
      const movedPaths = new Set(items.map(i => i.path))
      suppressRebuild = true
      displayItems.value = listItemsForView.value.filter((row) => {
        const p = (row as { path?: unknown }).path
        return typeof p !== 'string' || !movedPaths.has(p)
      })
      deselectItem()
    }

    beginMoveOrMigrate(
      planned,
      droppedInto.provider,
      stripUserPrefix(droppedInto.path),
      droppedInto.name,
      async () => {
        if (hasCrossProvider) deselectItem()
        await refreshFiles(true)
      },
    )
    return
  }

  if (dropTarget) {
    const dragged = parseRowData(evt.item as HTMLElement)
    if (!dragged) {
      suppressRebuild = true
      displayItems.value = [...listItemsForView.value]
      return
    }

    const draggedProvider: StorageProvider = (dragged.provider as StorageProvider) ?? storageProvider.value
    const kind = dragged.kind
    const icon: FileIconName = kind === 'folder'
      ? ('folder' as FileIconName)
      : (getIconForFile(dragged.name) as FileIconName)

    const planned: PlannedMigrationItem = {
      path: dragged.path,
      name: dragged.name,
      kind,
      provider: draggedProvider,
      icon,
    }
    const isCrossProvider = draggedProvider !== dropTarget.provider

    // Same-provider single drag: match the original optimistic-UI flow so the
    // item disappears immediately while the move resolves. Cross-provider
    // waits for the modal confirmation before touching the view.
    if (!isCrossProvider) {
      suppressRebuild = true
      displayItems.value = listItemsForView.value.filter((item) => {
        const p = (item as { path?: unknown }).path
        return typeof p !== 'string' || p !== dragged.path
      })
      deselectItem()
    }

    beginMoveOrMigrate(
      [planned],
      dropTarget.provider,
      stripUserPrefix(dropTarget.path),
      dropTarget.name,
      async () => {
        if (isCrossProvider) deselectItem()
        await refreshFiles(true)
      },
    )
    return
  }

  // Pure reorder — persist the new order. Pending rows are excluded.
  const parentPath = currentPath.value.join('/')
  const orderedNames = displayItems.value
    .filter(item => !isPendingRow(item))
    .map(item => item.name)
  // Skip the watcher's rebuild pass that would otherwise run when we mutate
  // currentOrder below — SortableJS has already positioned the DOM, and a
  // fresh displayItems assignment would tear it down and re-render, which
  // looks like the drop "snaps back" to a different slot.
  suppressRebuild = true
  currentOrder.value = orderedNames
  const ok = await reorderFiles(parentPath, orderedNames)
  if (!ok) {
    toast.show(t('storage.orderSaveFailed'), 'error')
    await refreshFiles(true)
  }
}

const sortableCommon = {
  animation: 500,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // Keep SortableJS's default swapThreshold (1): the entire neighbour is the
  // trigger zone, so siblings shift the moment the dragged clone enters any
  // neighbour — not only once it reaches the neighbour's centre.
  emptyInsertThreshold: 8,
  forceFallback: true,
  fallbackOnBody: true,
  fallbackTolerance: 3,
  filter: '.fb-pending-row',
  preventOnFilter: false,
  // Drag only initiates from the inner 88px tile (the grey-hover surface).
  // The outer grid cell is padding/whitespace — mousedowns there must be
  // inert so the user can't grab by empty space around the icon.
  handle: '[data-fb-handle]',
  ghostClass: 'fb-ghost',
  chosenClass: 'fb-chosen',
  dragClass: 'fb-drag',
  onStart: onSortableStart,
  onMove: onSortableMove,
  onEnd: onSortableEnd,
}

// ---------------------------------------------------------------------------
// Marquee (rubber-band) multi-select.
//
// A pointerdown on empty space inside the scrollable grid container starts a
// rectangle selection. The rectangle tracks the cursor; every `[data-fb-handle]`
// whose bounding box intersects the rectangle becomes selected. Dragging from a
// file's handle is caught by SortableJS first (it owns `data-fb-handle`), so
// the marquee only fires on whitespace — which is exactly the rule the feature
// calls for.
//
// Coordinates are stored relative to the scroll container so the marquee stays
// aligned if the container scrolls mid-drag.

const marqueeContainer = ref<HTMLElement | null>(null)
const marqueeState = ref<{
  active: boolean
  startX: number
  startY: number
  curX: number
  curY: number
} | null>(null)

// Selection snapshot captured at pointerdown time. Hit-tests *replace* the
// selection each tick, so without a snapshot we'd lose modifier-held state.
let marqueeInitialIds: Set<string> = new Set()
let marqueeAdditive = false
let marqueePointerId = -1
// Guard the ensuing `click` event: after a marquee drag, the browser still
// fires `click` on the pointerdown target, which would deselect everything.
let suppressNextClick = false

const marqueeBoxStyle = computed(() => {
  const m = marqueeState.value
  if (!m || !m.active) return null
  const left = Math.min(m.startX, m.curX)
  const top = Math.min(m.startY, m.curY)
  const width = Math.abs(m.curX - m.startX)
  const height = Math.abs(m.curY - m.startY)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

function containerScrollPoint(container: HTMLElement, clientX: number, clientY: number) {
  const rect = container.getBoundingClientRect()
  return {
    x: clientX - rect.left + container.scrollLeft,
    y: clientY - rect.top + container.scrollTop,
  }
}

function onMarqueePointerDown(ev: PointerEvent) {
  // Only left button initiates a marquee; right-click/middle-click pass
  // through untouched.
  if (ev.button !== 0) return
  const target = ev.target as HTMLElement | null
  if (!target) return
  // If the pointer is on a file/folder handle, SortableJS owns the gesture.
  // Bail so drag-to-reorder keeps working. Also bail on interactive chrome
  // (inputs, buttons) — those shouldn't trigger marquee either.
  if (target.closest('[data-fb-handle]')) return
  if (target.closest('input, textarea, button, [contenteditable="true"]')) return
  const container = marqueeContainer.value
  if (!container) return
  // Ignore clicks outside the scroll area (e.g., on the scrollbar itself).
  if (!container.contains(target)) return

  const point = containerScrollPoint(container, ev.clientX, ev.clientY)
  marqueeState.value = {
    active: true,
    startX: point.x,
    startY: point.y,
    curX: point.x,
    curY: point.y,
  }
  marqueeAdditive = ev.shiftKey || ev.metaKey || ev.ctrlKey
  marqueeInitialIds = marqueeAdditive
    ? new Set(selectedItemIds.value)
    : new Set()
  marqueePointerId = ev.pointerId
  try { container.setPointerCapture(ev.pointerId) } catch {}
  // Keyboard focus in a text input would otherwise keep blinking inside the
  // marquee; this makes the drag feel like a clean reset.
  if (document.activeElement instanceof HTMLElement && document.activeElement !== container) {
    // Only blur inputs inside the browser — avoid disturbing focus elsewhere.
    const active = document.activeElement
    if (active.closest('[data-file-item]')) active.blur()
  }
  window.addEventListener('pointermove', onMarqueePointerMove)
  window.addEventListener('pointerup', onMarqueePointerUp)
  window.addEventListener('pointercancel', onMarqueePointerUp)
  ev.preventDefault()
}

function onMarqueePointerMove(ev: PointerEvent) {
  const m = marqueeState.value
  const container = marqueeContainer.value
  if (!m || !m.active || !container) return
  const point = containerScrollPoint(container, ev.clientX, ev.clientY)
  marqueeState.value = { ...m, curX: point.x, curY: point.y }
  updateMarqueeSelection()
}

function onMarqueePointerUp(ev: PointerEvent) {
  const container = marqueeContainer.value
  const m = marqueeState.value
  window.removeEventListener('pointermove', onMarqueePointerMove)
  window.removeEventListener('pointerup', onMarqueePointerUp)
  window.removeEventListener('pointercancel', onMarqueePointerUp)
  if (container && marqueePointerId !== -1) {
    try { container.releasePointerCapture(marqueePointerId) } catch {}
  }
  marqueePointerId = -1
  if (!m) return
  const dragged = Math.abs(m.curX - m.startX) + Math.abs(m.curY - m.startY) > 3
  if (dragged) {
    // Suppress the click event that fires right after this pointerup — the
    // browser synthesizes a click on the pointerdown target, which would run
    // whitespace-click deselection and wipe the selection we just built.
    suppressNextClick = true
  } else if (!marqueeAdditive) {
    // A quick click on whitespace (no real drag): clear selection. Matches
    // Finder/Explorer behavior and gives users an obvious "escape hatch" when
    // they've selected something and want to go back to the no-selection
    // toolbar.
    deselectItem()
  }
  marqueeState.value = null
  marqueeInitialIds = new Set()
  marqueeAdditive = false
}

function onMarqueeClick(ev: MouseEvent) {
  if (suppressNextClick) {
    suppressNextClick = false
    ev.stopPropagation()
    ev.preventDefault()
  }
}

function updateMarqueeSelection() {
  const m = marqueeState.value
  const container = marqueeContainer.value
  if (!m || !container) return
  const rect = {
    left: Math.min(m.startX, m.curX),
    right: Math.max(m.startX, m.curX),
    top: Math.min(m.startY, m.curY),
    bottom: Math.max(m.startY, m.curY),
  }
  const containerRect = container.getBoundingClientRect()
  const scrollLeft = container.scrollLeft
  const scrollTop = container.scrollTop

  const handles = container.querySelectorAll<HTMLElement>('[data-fb-handle]')
  const matchedIds: string[] = []
  const orderedByDom: string[] = []
  for (const handle of handles) {
    const owner = handle.closest<HTMLElement>('[data-file-item]')
    if (!owner) continue
    if (owner.classList.contains('fb-pending-row')) continue
    const id = owner.dataset.id
    if (!id) continue
    orderedByDom.push(id)
    const r = handle.getBoundingClientRect()
    const hr = {
      left: r.left - containerRect.left + scrollLeft,
      right: r.right - containerRect.left + scrollLeft,
      top: r.top - containerRect.top + scrollTop,
      bottom: r.bottom - containerRect.top + scrollTop,
    }
    const intersects = hr.left <= rect.right
      && hr.right >= rect.left
      && hr.top <= rect.bottom
      && hr.bottom >= rect.top
    if (intersects) matchedIds.push(id)
  }

  const finalIds = marqueeAdditive
    ? new Set([...marqueeInitialIds, ...matchedIds])
    : new Set(matchedIds)

  // Translate ids → items in DOM order so the primary (first in
  // selectedItemId) corresponds to the earliest matched row, which feels
  // natural when single-target actions fall back to the primary.
  const idOrder = orderedByDom.filter(id => finalIds.has(id))
  const idToItem = new Map<string, DisplayItem>()
  for (const item of listItemsForView.value) {
    idToItem.set(item.id, item)
  }
  const items = idOrder.map(id => idToItem.get(id)).filter((v): v is DisplayItem => !!v)
  setSelectionFromItems(items)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMarqueePointerMove)
  window.removeEventListener('pointerup', onMarqueePointerUp)
  window.removeEventListener('pointercancel', onMarqueePointerUp)
  if (typeof document !== 'undefined') document.body.classList.remove('fb-multi-dragging')
})

// Toggle a body-level class during multi-drag so we can hide the SortableJS
// clone (which lives in <body> due to `fallbackOnBody: true` — outside this
// component's scoped CSS reach). The hide itself is done by an unscoped style
// rule at the bottom of this file.
watch(multiDragActive, (active) => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('fb-multi-dragging', active)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col relative">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            v-if="showEmptyFolderOverlay"
            class="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-4 sm:px-5"
          >
            <div class="flex flex-col items-center gap-3 text-center">
              <svg
                v-if="searchQuery.trim()"
                class="size-14 shrink-0 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <svg
                v-else
                class="size-14 shrink-0 text-neutral-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p class="max-w-sm text-body-md text-neutral-500 font-medium">
                {{ searchQuery.trim() ? t('storage.noSearchResults') : t('storage.emptyFolder') }}
              </p>
            </div>
          </div>

        <div class="relative z-20 shrink-0 bg-white border-b border-neutral-100">
          <div class="px-3.5 pt-2 pb-1.5 sm:px-4">
            <div class="flex items-center gap-1.5">
              <nav
                class="min-w-0 flex-1 flex items-center gap-1 overflow-hidden text-body-md font-semibold text-neutral-950"
                :aria-label="t('vault.tabs.files')"
              >
                <template v-for="(segment, index) in breadcrumbSegments" :key="index">
                  <span v-if="index > 0" class="shrink-0 text-neutral-400" aria-hidden="true">/</span>
                  <button
                    type="button"
                    class="flex min-w-0 items-center gap-2 truncate rounded-md py-0.5 transition-colors hover:bg-neutral-100"
                    :class="[
                      index === 0 ? 'pr-1' : 'px-1',
                      index === breadcrumbSegments.length - 1 ? 'text-neutral-950' : 'text-neutral-600 hover:text-neutral-950',
                    ]"
                    @click="navigateToBreadcrumb(index)"
                  >
                    <svg
                      v-if="index === 0"
                      class="size-4.5 shrink-0 -translate-y-px"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span class="truncate">{{ segment }}</span>
                  </button>
                </template>
                <template v-if="selectedBreadcrumbLabel">
                  <span class="shrink-0 text-neutral-400" aria-hidden="true">/</span>
                  <span
                    class="min-w-0 truncate px-1 py-0.5 text-neutral-500"
                    :title="selectedBreadcrumbLabel"
                    aria-current="false"
                  >
                    {{ selectedBreadcrumbLabel }}
                  </span>
                </template>
              </nav>

              <template v-if="!selectedItem">
                <div class="flex items-center gap-1 shrink-0">
                  <div class="flex items-center rounded-md bg-neutral-100 p-0.5">
                    <button
                      class="group/action relative flex items-center justify-center rounded px-1.5 py-1 transition-all"
                      :class="viewMode === 'icon' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
                      :aria-label="t('storage.toolbar.iconView')"
                      @click="viewMode = 'icon'"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.iconView') }}</span>
                    </button>
                    <button
                      class="group/action relative flex items-center justify-center rounded px-1.5 py-1 transition-all"
                      :class="viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
                      :aria-label="t('storage.toolbar.listView')"
                      @click="viewMode = 'list'"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.listView') }}</span>
                    </button>
                  </div>

                  <div class="group/action relative">
                    <button
                      data-testid="storage-new-folder-button"
                      class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="pendingNewFolder ? 'bg-neutral-100 text-neutral-950' : ''"
                      :aria-label="t('storage.toolbar.newFolder')"
                      @click="startNewFolder"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                    </button>
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.newFolder') }}</span>
                  </div>

                  <div class="group/action relative">
                    <button
                      data-testid="storage-upload-button"
                      class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="isUploading ? 'opacity-50 pointer-events-none' : ''"
                      :aria-label="t('storage.toolbar.upload')"
                      @click="triggerUpload"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </button>
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.upload') }}</span>
                  </div>

                  <input
                    ref="fileInputRef"
                    name="file-upload"
                    type="file"
                    multiple
                    class="hidden"
                    @change="handleFileUpload"
                  >

                  <div ref="filterRef" class="group/action relative">
                    <button
                      class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="activeFilter !== 'all' ? 'text-neutral-950 bg-neutral-100' : ''"
                      :aria-label="t('storage.toolbar.filterFiles')"
                      @click="toggleFilter"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                    </button>
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.filter') }}</span>

                    <div
                      v-if="isFilterOpen"
                      class="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg bg-white shadow-lg border border-neutral-300 overflow-hidden"
                    >
                      <button
                        v-for="item in filterItems"
                        :key="item.id"
                        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-body-md hover:bg-neutral-100 transition-colors cursor-pointer"
                        :class="activeFilter === item.id ? 'text-neutral-950 font-medium' : 'text-neutral-700'"
                        @click="setFilter(item.id)"
                      >
                        <span>{{ t(`storage.filters.${item.id}`) }}</span>
                        <svg
                          v-if="activeFilter === item.id"
                          class="size-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  class="group/action relative shrink-0 transition-all duration-200"
                  :class="searchExpanded ? 'w-1/4' : 'w-[30px]'"
                >
                  <div
                    ref="searchRef"
                    class="w-full flex items-center h-[30px] rounded-md border transition"
                    :class="[
                      searchExpanded
                        ? (searchFocused
                            ? 'border-neutral-400 bg-white'
                            : 'border-neutral-200 bg-neutral-50/50')
                        : 'border-transparent',
                    ]"
                  >
                    <button
                      class="shrink-0 flex items-center justify-center px-1.5 py-1.5 rounded-md transition-colors"
                      :class="searchExpanded ? 'text-neutral-500' : 'text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100'"
                      :aria-label="t('storage.toolbar.searchFiles')"
                      @click="toggleSearch"
                    >
                      <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </button>
                    <div
                      class="overflow-hidden transition-all duration-200"
                      :class="searchExpanded ? 'flex-1 min-w-0 opacity-100' : 'w-0 opacity-0'"
                    >
                      <input
                        ref="searchInputRef"
                        v-model="searchQuery"
                        name="storage-search"
                        type="text"
                        :placeholder="t('storage.toolbar.searchPlaceholder')"
                        class="w-full min-w-0 bg-transparent text-body-sm text-neutral-950 placeholder:text-neutral-400 outline-none pr-2"
                        @focus="searchFocused = true"
                        @blur="searchFocused = false"
                        @keydown.escape="toggleSearch"
                      >
                    </div>
                  </div>
                  <span v-if="!searchExpanded" class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('storage.toolbar.search') }}</span>
                </div>

              </template>
              <div v-else ref="selectionActionsRef" class="flex items-center gap-1 shrink-0">
                <span
                  v-if="isMultiSelection"
                  class="mr-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700"
                >
                  {{ t('storage.toolbar.selectedCount', { n: selectedItemIds.size }) }}
                </span>
                <!-- Share -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isShareModalOpen = true"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.share') }}</span>
                </div>
                <!-- Manage access (permissions) -->
                <div v-if="canManageAccess" class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isPermissionsModalOpen = true"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('workspaceMenu.manageAccess') }}</span>
                </div>
                <!-- Rename (single-select only) -->
                <div v-if="!isMultiSelection" class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    :disabled="isRenaming"
                    @click="startRename"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" />
                      <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.rename') }}</span>
                </div>
                <!-- Move -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="openMoveModal"
                  >
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
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="startDuplicate"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.duplicate') }}</span>
                </div>
                <!-- Download (single file only) -->
                <div v-if="!isMultiSelection && selectedItem?.kind === 'file'" class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="handleDownload"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.download') }}</span>
                </div>
                <!-- Info (single-select only) -->
                <div v-if="!isMultiSelection" class="group/action relative">
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isInfoModalOpen = true"
                  >
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
                  <button
                    class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    @click="handleDelete"
                  >
                    <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">{{ t('common.delete') }}</span>
                </div>
                <div class="w-px h-5 bg-neutral-200 shrink-0 mx-0.5" />
                <button
                  class="flex items-center justify-center px-1.5 py-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                  @click="deselectItem"
                >
                  <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <p
              v-if="folderOpMessage"
              class="shrink-0 border-b border-red-100 bg-red-50/95 px-4 py-2 text-body-sm text-red-700"
              role="alert"
            >
              {{ folderOpMessage }}
            </p>
            <!-- Initial directory fetch: skeleton that mirrors the active view so the
                 panel fills in place instead of flashing blank then popping. Only shows
                 on a cold load (no cached rows to paint); listing uses `listingLoading`,
                 not upload/move `isLoading`. -->
            <div
              v-if="listingLoading && filteredFiles.length === 0 && !pendingNewFolder"
              class="flex min-h-0 min-w-0 flex-1 flex-col"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <span class="sr-only">{{ t('common.loading') }}</span>

              <!-- Icon view skeleton: same auto-fill grid + 88px cards as the real grid -->
              <div
                v-if="viewMode === 'icon'"
                class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3.5 pt-3 pb-4 sm:px-4 sm:pb-4"
              >
                <div class="grid gap-0.5" style="grid-template-columns: repeat(auto-fill, minmax(96px, 1fr))">
                  <div v-for="n in 18" :key="n" class="flex items-start justify-center">
                    <div class="flex w-full flex-col items-center gap-1.5 px-1.5 pt-2 pb-1.5">
                      <div class="size-10 rounded-lg bg-neutral-200 animate-pulse" />
                      <div
                        class="h-2.5 rounded bg-neutral-200 animate-pulse"
                        :style="{ width: `${55 + (n * 17) % 35}%` }"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- List view skeleton: same flush table + zebra rows as the real list -->
              <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col pb-4 sm:pb-4">
                <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <!-- Real column headers (static labels, not data — fine to show while loading) -->
                  <div
                    class="grid shrink-0 items-center border-b border-neutral-200 px-3.5 py-1 text-[11px] font-medium text-neutral-500 sm:px-4"
                    style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                  >
                    <div class="truncate">{{ t('storage.listColumns.name') }}</div>
                    <div class="truncate text-right">{{ t('storage.listColumns.size') }}</div>
                    <div class="truncate">{{ t('storage.listColumns.kind') }}</div>
                    <div class="truncate">{{ t('storage.listColumns.dateModified') }}</div>
                  </div>
                  <div
                    v-for="n in 12"
                    :key="n"
                    class="grid items-center px-3.5 py-1.5 sm:px-4"
                    :class="n % 2 === 0 ? 'bg-neutral-50' : ''"
                    style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="size-4.5 shrink-0 rounded bg-neutral-200 animate-pulse" />
                      <div
                        class="h-3 rounded bg-neutral-200 animate-pulse"
                        :style="{ width: `${45 + (n * 23) % 45}%` }"
                      />
                    </div>
                    <div class="h-3 w-10 justify-self-end rounded bg-neutral-200 animate-pulse" />
                    <div class="h-3 w-16 rounded bg-neutral-200 animate-pulse" />
                    <div class="h-3 w-24 rounded bg-neutral-200 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Error state -->
            <div v-else-if="storageError" class="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-5 text-center">
              <p class="text-body-md text-red-500 font-medium">{{ storageError }}</p>
              <button
                class="mt-2 text-body-md text-neutral-700 hover:text-neutral-950 font-medium underline"
                @click="refreshFiles(true)"
              >
                Retry
              </button>
            </div>

            <!-- Empty: visual is full-panel overlay above; keep flow height for layout -->
            <div v-else-if="listItemsForView.length === 0" class="min-h-0 flex-1" />

            <!-- Icon view: padded grid with outer scroll -->
            <div
              v-else-if="viewMode === 'icon'"
              ref="marqueeContainer"
              class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3.5 pt-3 pb-4 sm:px-4 sm:pb-4"
              @pointerdown="onMarqueePointerDown"
              @click.capture="onMarqueeClick"
            >
            <div
              v-draggable="[displayItems, sortableCommon]"
              class="grid gap-0.5"
              style="grid-template-columns: repeat(auto-fill, minmax(96px, 1fr))"
            >
              <div
                v-for="file in displayItems"
                :key="file.id"
                data-file-item
                :data-id="file.id"
                :data-kind="file.kind"
                :data-item="JSON.stringify({ kind: file.kind, name: file.name, path: file.path, provider: file.provider })"
                class="flex justify-center items-start"
                :class="isPendingRow(file) ? 'fb-pending-row' : ''"
              >
                <div
                  data-fb-handle
                  class="w-fit max-w-[80px] flex flex-col items-center gap-1.5 px-1.5 pt-2 pb-1.5 rounded-md transition-colors text-left group cursor-pointer"
                  :class="[
                    isSelected(file.id) ? 'bg-neutral-50 shadow-sm' : '',
                    multiDragActive && isSelected(file.id) ? 'opacity-0' : '',
                  ]"
                  @click="handleRowClick(file)"
                  @dblclick="handleRowDblClick(file)"
                >
                <svg class="size-10 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <!-- Non-empty folders render filled; empty folders stay a plain outline -->
                    <path v-if="file.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" :fill="file.empty ? undefined : 'currentColor'" />

                    <path v-if="file.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    <rect v-if="file.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle v-if="file.icon === 'image'" cx="9" cy="9" r="2" />
                    <path v-if="file.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

                    <rect v-if="file.icon === 'calendar'" x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line v-if="file.icon === 'calendar'" x1="16" y1="2" x2="16" y2="6" />
                    <line v-if="file.icon === 'calendar'" x1="8" y1="2" x2="8" y2="6" />
                    <line v-if="file.icon === 'calendar'" x1="3" y1="10" x2="21" y2="10" />

                    <path v-if="file.icon === 'file-code'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'file-code'" points="14 2 14 8 20 8" />
                    <polyline v-if="file.icon === 'file-code'" points="10 13 8 15 10 17" />
                    <polyline v-if="file.icon === 'file-code'" points="14 13 16 15 14 17" />

                    <path v-if="file.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
                    <rect v-if="file.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

                    <path v-if="file.icon === 'file-text'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'file-text'" points="14 2 14 8 20 8" />
                    <line v-if="file.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
                    <line v-if="file.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
                    <line v-if="file.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />

                    <path v-if="file.icon === 'audio'" d="M9 18V5l12-2v13" />
                    <circle v-if="file.icon === 'audio'" cx="6" cy="18" r="3" />
                    <circle v-if="file.icon === 'audio'" cx="18" cy="16" r="3" />

                    <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3" />
                    <path v-if="file.icon === 'key'" d="m17 6 1 1" />
                    <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
                    <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />

                    <path v-if="file.icon === 'archive'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'archive'" points="14 2 14 8 20 8" />
                    <path v-if="file.icon === 'archive'" d="M11 2v3" />
                    <path v-if="file.icon === 'archive'" d="M11 8h2" />
                    <path v-if="file.icon === 'archive'" d="M11 11h2" />
                    <path v-if="file.icon === 'archive'" d="M11 14h2" />
                    <path v-if="file.icon === 'archive'" d="M12 5v12" />
                    <rect v-if="file.icon === 'archive'" x="10" y="17" width="4" height="3" rx="0.75" />

                    <rect v-if="file.icon === 'spreadsheet'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line v-if="file.icon === 'spreadsheet'" x1="3" y1="9" x2="21" y2="9" />
                    <line v-if="file.icon === 'spreadsheet'" x1="3" y1="15" x2="21" y2="15" />
                    <line v-if="file.icon === 'spreadsheet'" x1="9" y1="3" x2="9" y2="21" />
                    <line v-if="file.icon === 'spreadsheet'" x1="15" y1="3" x2="15" y2="21" />

                    <rect v-if="file.icon === 'presentation'" x="3" y="4" width="18" height="12" rx="2" />
                    <path v-if="file.icon === 'presentation'" d="M12 16v5" />
                    <path v-if="file.icon === 'presentation'" d="M8 21h8" />
                    <path v-if="file.icon === 'presentation'" d="M8 12l2.5-2.5 2 2L16 8" />
                    <path v-if="file.icon === 'presentation'" d="M7 19l5-3 5 3" />

                    <ellipse v-if="file.icon === 'database'" cx="12" cy="5" rx="9" ry="3" />
                    <line v-if="file.icon === 'database'" x1="3" y1="5" x2="3" y2="19" />
                    <line v-if="file.icon === 'database'" x1="21" y1="5" x2="21" y2="19" />
                    <path v-if="file.icon === 'database'" d="M3 12a9 3 0 0 0 18 0" />
                    <path v-if="file.icon === 'database'" d="M3 19a9 3 0 0 0 18 0" />

                    <path v-if="file.icon === 'font'" d="M4 20h16" />
                    <path v-if="file.icon === 'font'" d="m6 16 6-12 6 12" />
                    <line v-if="file.icon === 'font'" x1="8" y1="12" x2="16" y2="12" />

                    <path
                      v-if="file.icon === 'config'"
                      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 0 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.354-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 0 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.354.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                    />
                    <circle v-if="file.icon === 'config'" cx="12" cy="12" r="3" />

                    <path v-if="file.icon === 'executable'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'executable'" points="14 2 14 8 20 8" />
                    <g v-if="file.icon === 'executable'" transform="translate(12 14) scale(0.5) translate(-12 -12)">
                      <path vector-effect="non-scaling-stroke" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 0 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.354-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 0 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.354.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <circle vector-effect="non-scaling-stroke" cx="12" cy="12" r="3" />
                    </g>

                    <path v-if="file.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'file'" points="14 2 14 8 20 8" />
                  </svg>
                <!-- Duplicate inline name -->
                <input
                  v-if="isPendingRow(file) && pendingDuplicate"
                  :ref="bindDuplicateInputRef"
                  v-model="pendingDuplicate.draftName"
                  name="duplicate-name"
                  type="text"
                  class="w-[68px] max-w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
                  @focus="onDuplicateInputFocus"
                  @keydown.enter.prevent="commitPendingDuplicate"
                  @keydown.escape.prevent="cancelPendingDuplicate"
                  @blur="commitPendingDuplicate"
                >
                <!-- New folder inline name (macOS-style) -->
                <input
                  v-if="isPendingRow(file) && pendingNewFolder"
                  :ref="bindNewFolderInputRef"
                  v-model="pendingNewFolder.draftName"
                  name="new-folder-name"
                  type="text"
                  class="w-[68px] max-w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
                  @focus="onNewFolderInputFocus"
                  @keydown.enter.prevent="commitPendingNewFolder"
                  @keydown.escape.prevent="cancelPendingNewFolder"
                  @blur="commitPendingNewFolder"
                >
                <!-- Rename inline -->
                <input
                  v-else-if="isRenaming && selectedItemId === file.id"
                  ref="renameInputRef"
                  v-model="renameInput"
                  name="file-rename"
                  type="text"
                  class="w-[68px] max-w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
                  @focus="onRenameInputFocus"
                  @keydown.enter="confirmRename"
                  @keydown.escape="cancelRename"
                  @blur="confirmRename"
                >
                <!-- Name wraps up to 2 lines, centered, ellipsised past that.
                     The provider icon flows inline as the last token of the name,
                     so it sits right after the filename text (a hair of spacing) —
                     on line 1 for short names, at the end of line 2 when wrapped. -->
                <div v-else class="max-w-full min-w-0 px-0.5">
                  <span
                    :title="file.name"
                    class="line-clamp-2 mx-auto w-fit max-w-[68px] text-center break-words text-meta text-neutral-950 leading-tight font-medium"
                  >{{ file.name }}<StorageProviderIcon
                    v-if="file.provider !== 'local'"
                    :provider="file.provider as StorageProvider"
                    inline
                    class="ml-0.5 inline align-text-bottom"
                  /></span>
                </div>
                </div>
              </div>
            </div>
            <div
              v-if="marqueeBoxStyle"
              class="pointer-events-none absolute z-10 rounded-sm border border-neutral-950/50 bg-neutral-950/10"
              :style="marqueeBoxStyle"
            />
            </div>

            <!-- List view: flush Finder-style table (no panel chrome); zebra rows -->
            <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col pb-4 sm:pb-4">
              <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <!-- Column headers (subtle, stays fixed above the scrolling rows) -->
                <div
                  class="grid shrink-0 items-center border-b border-neutral-200 px-3.5 py-1 text-[11px] font-medium text-neutral-500 sm:px-4"
                  style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                >
                  <div class="truncate">{{ t('storage.listColumns.name') }}</div>
                  <div class="truncate text-right">{{ t('storage.listColumns.size') }}</div>
                  <div class="truncate">{{ t('storage.listColumns.kind') }}</div>
                  <div class="truncate">{{ t('storage.listColumns.dateModified') }}</div>
                </div>

                <!-- Scrollable rows -->
                <div
                  ref="marqueeContainer"
                  class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
                  @pointerdown="onMarqueePointerDown"
                  @click.capture="onMarqueeClick"
                >
                  <div v-draggable="[displayItems, sortableCommon]" class="flex flex-col">
                  <div
                    v-for="(file, index) in displayItems"
                    :key="file.id"
                    data-file-item
                    :data-id="file.id"
                    :data-kind="file.kind"
                    :data-item="JSON.stringify({ kind: file.kind, name: file.name, path: file.path, provider: file.provider })"
                    :class="isPendingRow(file) ? 'fb-pending-row' : ''"
                  >
                  <div
                    data-fb-handle
                    class="grid items-center px-3.5 py-1.5 transition-colors cursor-pointer sm:px-4"
                    :class="[
                      isSelected(file.id) ? 'bg-neutral-100' : (index % 2 === 1 ? 'bg-neutral-50' : ''),
                      multiDragActive && isSelected(file.id) ? 'opacity-0' : '',
                    ]"
                    style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                    @click="handleRowClick(file)"
                    @dblclick="handleRowDblClick(file)"
                  >
                    <!-- Name column: icon + name bunched left -->
                    <div class="flex min-w-0 items-center gap-2">
                      <svg class="size-4.5 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <!-- Non-empty folders render filled; empty folders stay a plain outline -->
                        <path v-if="file.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" :fill="file.empty ? undefined : 'currentColor'" />

                        <path v-if="file.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        <rect v-if="file.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle v-if="file.icon === 'image'" cx="9" cy="9" r="2" />
                        <path v-if="file.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />

                        <rect v-if="file.icon === 'calendar'" x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line v-if="file.icon === 'calendar'" x1="16" y1="2" x2="16" y2="6" />
                        <line v-if="file.icon === 'calendar'" x1="8" y1="2" x2="8" y2="6" />
                        <line v-if="file.icon === 'calendar'" x1="3" y1="10" x2="21" y2="10" />

                        <path v-if="file.icon === 'file-code'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'file-code'" points="14 2 14 8 20 8" />
                        <polyline v-if="file.icon === 'file-code'" points="10 13 8 15 10 17" />
                        <polyline v-if="file.icon === 'file-code'" points="14 13 16 15 14 17" />

                        <path v-if="file.icon === 'video'" d="m22 8-6 4 6 4V8Z" />
                        <rect v-if="file.icon === 'video'" x="2" y="6" width="14" height="12" rx="2" />

                        <path v-if="file.icon === 'file-text'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'file-text'" points="14 2 14 8 20 8" />
                        <line v-if="file.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
                        <line v-if="file.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
                        <line v-if="file.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />

                        <path v-if="file.icon === 'audio'" d="M9 18V5l12-2v13" />
                        <circle v-if="file.icon === 'audio'" cx="6" cy="18" r="3" />
                        <circle v-if="file.icon === 'audio'" cx="18" cy="16" r="3" />

                        <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3" />
                        <path v-if="file.icon === 'key'" d="m17 6 1 1" />
                        <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
                        <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />

                        <path v-if="file.icon === 'archive'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'archive'" points="14 2 14 8 20 8" />
                        <path v-if="file.icon === 'archive'" d="M11 2v3" />
                        <path v-if="file.icon === 'archive'" d="M11 8h2" />
                        <path v-if="file.icon === 'archive'" d="M11 11h2" />
                        <path v-if="file.icon === 'archive'" d="M11 14h2" />
                        <path v-if="file.icon === 'archive'" d="M12 5v12" />
                        <rect v-if="file.icon === 'archive'" x="10" y="17" width="4" height="3" rx="0.75" />

                        <rect v-if="file.icon === 'spreadsheet'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line v-if="file.icon === 'spreadsheet'" x1="3" y1="9" x2="21" y2="9" />
                        <line v-if="file.icon === 'spreadsheet'" x1="3" y1="15" x2="21" y2="15" />
                        <line v-if="file.icon === 'spreadsheet'" x1="9" y1="3" x2="9" y2="21" />
                        <line v-if="file.icon === 'spreadsheet'" x1="15" y1="3" x2="15" y2="21" />

                        <rect v-if="file.icon === 'presentation'" x="3" y="4" width="18" height="12" rx="2" />
                        <path v-if="file.icon === 'presentation'" d="M12 16v5" />
                        <path v-if="file.icon === 'presentation'" d="M8 21h8" />
                        <path v-if="file.icon === 'presentation'" d="M8 12l2.5-2.5 2 2L16 8" />
                        <path v-if="file.icon === 'presentation'" d="M7 19l5-3 5 3" />

                        <ellipse v-if="file.icon === 'database'" cx="12" cy="5" rx="9" ry="3" />
                        <line v-if="file.icon === 'database'" x1="3" y1="5" x2="3" y2="19" />
                        <line v-if="file.icon === 'database'" x1="21" y1="5" x2="21" y2="19" />
                        <path v-if="file.icon === 'database'" d="M3 12a9 3 0 0 0 18 0" />
                        <path v-if="file.icon === 'database'" d="M3 19a9 3 0 0 0 18 0" />

                        <path v-if="file.icon === 'font'" d="M4 20h16" />
                        <path v-if="file.icon === 'font'" d="m6 16 6-12 6 12" />
                        <line v-if="file.icon === 'font'" x1="8" y1="12" x2="16" y2="12" />

                        <path
                          v-if="file.icon === 'config'"
                          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 0 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.354-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 0 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.354.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                        />
                        <circle v-if="file.icon === 'config'" cx="12" cy="12" r="3" />

                        <path v-if="file.icon === 'executable'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'executable'" points="14 2 14 8 20 8" />
                        <g v-if="file.icon === 'executable'" transform="translate(12 14) scale(0.5) translate(-12 -12)">
                          <path vector-effect="non-scaling-stroke" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 0 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.354-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 0 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.354.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                          <circle vector-effect="non-scaling-stroke" cx="12" cy="12" r="3" />
                        </g>

                        <path v-if="file.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'file'" points="14 2 14 8 20 8" />
                      </svg>

                      <!-- Duplicate inline name -->
                      <input
                        v-if="isPendingRow(file) && pendingDuplicate"
                        :ref="bindDuplicateInputRef"
                        v-model="pendingDuplicate.draftName"
                        name="duplicate-name"
                        type="text"
                        class="flex-1 min-w-0 text-sm text-neutral-950 bg-neutral-100 border border-neutral-400 rounded px-2 py-0.5 outline-none focus:border-neutral-950 font-medium"
                        @focus="onDuplicateInputFocus"
                        @keydown.enter.prevent="commitPendingDuplicate"
                        @keydown.escape.prevent="cancelPendingDuplicate"
                        @blur="commitPendingDuplicate"
                      >
                      <!-- New folder inline name -->
                      <input
                        v-if="isPendingRow(file) && pendingNewFolder"
                        :ref="bindNewFolderInputRef"
                        v-model="pendingNewFolder.draftName"
                        name="new-folder-name"
                        type="text"
                        class="flex-1 min-w-0 text-sm text-neutral-950 bg-neutral-100 border border-neutral-400 rounded px-2 py-0.5 outline-none focus:border-neutral-950 font-medium"
                        @focus="onNewFolderInputFocus"
                        @keydown.enter.prevent="commitPendingNewFolder"
                        @keydown.escape.prevent="cancelPendingNewFolder"
                        @blur="commitPendingNewFolder"
                      >
                      <!-- Rename inline -->
                      <input
                        v-else-if="isRenaming && selectedItemId === file.id"
                        ref="renameInputRef"
                        v-model="renameInput"
                        name="file-rename"
                        type="text"
                        class="flex-1 min-w-0 text-sm text-neutral-950 bg-neutral-100 border border-neutral-400 rounded px-2 py-0.5 outline-none focus:border-neutral-950 font-medium"
                        @focus="onRenameInputFocus"
                        @keydown.enter="confirmRename"
                        @keydown.escape="cancelRename"
                        @blur="confirmRename"
                      >
                      <template v-else>
                        <span :title="file.name" class="truncate text-sm text-neutral-950 font-medium min-w-0">{{ file.name }}</span>
                        <StorageProviderIcon
                          v-if="file.provider !== 'local'"
                          :provider="file.provider as StorageProvider"
                          inline
                        />
                      </template>
                    </div>

                    <!-- Size column (folders show their recursive total) -->
                    <div class="truncate text-right text-xs tabular-nums text-neutral-500">
                      {{ 'size' in file ? formatSize(file.size as number) : '—' }}
                    </div>

                    <!-- Kind column -->
                    <div class="truncate text-xs text-neutral-500">
                      {{ kindLabel(file.icon as FileIconName) }}
                    </div>

                    <!-- Date Modified column -->
                    <div class="truncate text-xs text-neutral-500">
                      {{ 'createdAt' in file && file.createdAt ? formatListDate(file.createdAt as string) : '—' }}
                    </div>
                  </div>
                  </div>
                  </div>
                  <div
                    v-if="marqueeBoxStyle"
                    class="pointer-events-none absolute z-10 rounded-sm border border-neutral-950/50 bg-neutral-950/10"
                    :style="marqueeBoxStyle"
                  />
                </div>
              </div>
            </div>
        </div>
        </div>
      </div>
    </div>

    <!-- File Preview Modal -->
    <FilePreviewModal
      v-if="isPreviewOpen && typedPreviewFile"
      :item="typedPreviewFile"
      :can-manage-access="canManageAccess"
      @close="closePreview()"
      @download="handleDownload"
      @share="() => { closePreview(false); isShareModalOpen = true }"
      @permissions="() => { closePreview(false); isPermissionsModalOpen = true }"
      @rename="() => { closePreview(false); nextTick(() => startRename()) }"
      @move="() => { closePreview(false); openMoveModal() }"
      @duplicate="() => { closePreview(false); startDuplicate() }"
      @info="() => { closePreview(false); isInfoModalOpen = true }"
      @delete="async () => { await handleDelete(); closePreview(false) }"
    />

    <!-- Share Modal -->
    <ShareModal
      v-if="isShareModalOpen && selectedItemsArray.length > 0"
      :items="selectedItemsArray"
      @close="isShareModalOpen = false"
    />

    <!-- Permissions Modal -->
    <ManageMemberAccessModal
      v-if="isPermissionsModalOpen && selectedItemsArray.length > 0 && currentWorkspace"
      :items="selectedItemsArray"
      :workspace-id="currentWorkspace.id"
      @close="isPermissionsModalOpen = false"
    />

    <!-- Info Modal -->
    <FileInfoModal
      v-if="isInfoModalOpen && selectedItem"
      :item="selectedItem"
      :size="selectedFileExtra?.size"
      :created-at="selectedFileExtra?.createdAt"
      @close="isInfoModalOpen = false"
    />

    <!-- Cross-provider migration confirmation -->
    <MigrateConfirmModal
      v-if="pendingMigration"
      :groups="migrationGroups"
      :target-provider="pendingMigration.targetProvider"
      :target-parent-name="pendingMigration.targetParentName"
      :is-migrating="isMigrationRunning"
      @close="cancelMigration"
      @confirm="confirmMigration"
    />

    <!-- Move Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="isMoveModalOpen" data-modal class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" @click.self="cancelMove">
        <div class="w-full max-w-xl mx-4 rounded-xl bg-white border border-neutral-200 shadow-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-neutral-200">
            <h3 class="text-headline-md font-semibold text-neutral-950">{{ t('storage.moveModalTitle') }}</h3>
          </div>
          <div class="p-2 max-h-96 overflow-y-auto">
            <div class="flex flex-col">
              <div
                v-for="{ node, depth } in visibleMoveNodes"
                :key="moveNodeKey(node)"
                class="flex items-center rounded-lg transition-colors"
                :class="isMoveDestinationSelected(node) ? 'bg-neutral-100' : 'hover:bg-neutral-50'"
              >
                <div :style="{ paddingLeft: `${depth * 16}px` }" class="flex items-center shrink-0">
                  <button
                    type="button"
                    class="size-6 flex items-center justify-center shrink-0 rounded hover:bg-neutral-200 transition-colors"
                    :class="node.children !== null && node.children.length === 0 ? 'invisible' : ''"
                    :aria-label="node.expanded ? t('storage.toolbar.collapse') : t('storage.toolbar.expand')"
                    @click.stop="toggleMoveNodeExpand(node)"
                  >
                    <svg
                      v-if="node.loadingPromise !== null"
                      class="size-3 shrink-0 rounded-full bg-neutral-200 text-neutral-200"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    <svg
                      v-else
                      class="size-3 text-neutral-500 transition-transform"
                      :class="node.expanded ? 'rotate-90' : ''"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  class="flex items-center gap-2 px-2 py-1.5 flex-1 min-w-0 text-left"
                  @click="selectMoveDestination(node)"
                >
                  <svg class="size-4 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span class="text-body-md text-neutral-950 font-medium truncate">
                    {{ depth === 0 ? rootLabel : node.name }}
                  </span>
                </button>
              </div>
            </div>
            <div
              v-if="moveTreeRoot.children !== null && moveTreeRoot.children.length === 0 && moveTreeRoot.loadingPromise === null"
              class="py-4 text-center text-body-md text-neutral-500"
            >
              No subfolders
            </div>
          </div>
          <!-- Storage provider picker -->
          <div class="px-4 py-3 border-t border-neutral-200">
            <span class="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Storage provider
            </span>
            <div ref="moveProviderMenuRef" class="relative mt-1.5">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800 transition-colors"
                :class="moveProviderInteractive ? 'hover:bg-neutral-100 cursor-pointer' : 'cursor-default'"
                :aria-haspopup="moveProviderInteractive"
                :aria-expanded="moveProviderMenuOpen"
                :disabled="!moveProviderInteractive"
                @click.stop="toggleMoveProviderMenu"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-white">
                    <StorageProviderIcon :provider="effectiveMoveTargetProvider" tile />
                  </span>
                  <span class="truncate">{{ moveProviderLabel(effectiveMoveTargetProvider) }}</span>
                </span>
                <svg
                  v-if="moveProviderInteractive"
                  class="size-4 shrink-0 text-neutral-400 transition-transform"
                  :class="moveProviderMenuOpen ? 'rotate-180' : ''"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <Menu :open="moveProviderMenuOpen && moveProviderInteractive" align="left" width="w-full">
                <button
                  v-for="p in availableMoveProviders"
                  :key="p"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-neutral-100"
                  :class="p === effectiveMoveTargetProvider ? 'font-medium text-neutral-950' : 'text-neutral-700'"
                  @click.stop="selectMoveProvider(p)"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                      <StorageProviderIcon :provider="p" tile />
                    </span>
                    <span class="truncate">{{ moveProviderLabel(p) }}</span>
                  </span>
                </button>
              </Menu>
            </div>
          </div>
          <div class="px-4 py-3 border-t border-neutral-200 flex items-center justify-end gap-2">
            <button
              class="px-3 py-1.5 rounded-lg text-body-md text-neutral-700 hover:bg-neutral-100 transition-colors font-medium"
              @click="cancelMove"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-body-md bg-neutral-950 text-white hover:bg-neutral-800 transition-colors font-medium"
              @click="confirmMove"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <div
        v-if="multiDragActive && multiDragHasMoved && multiDragCursor"
        class="pointer-events-none fixed z-[100]"
        :style="{ left: `${multiDragCursor.x}px`, top: `${multiDragCursor.y}px` }"
      >
        <div class="relative -translate-x-1/2 -translate-y-1/2">
          <!-- Back layers to suggest a stack. Rotated/offset, rendered below the top card. -->
          <div
            v-if="multiDragItems.length >= 3"
            class="absolute left-0 top-0 flex size-14 items-center justify-center rounded-lg border border-neutral-300 bg-white shadow-md"
            style="transform: translate(6px, 6px) rotate(6deg);"
          />
          <div
            v-if="multiDragItems.length >= 2"
            class="absolute left-0 top-0 flex size-14 items-center justify-center rounded-lg border border-neutral-300 bg-white shadow-md"
            style="transform: translate(-4px, 4px) rotate(-5deg);"
          />
          <!-- Front card: shows the primary item's icon. -->
          <div class="relative flex size-14 items-center justify-center rounded-lg border border-neutral-300 bg-white shadow-md">
            <svg class="size-8 text-neutral-700" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="multiDragItems[0]?.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <template v-else>
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </template>
            </svg>
          </div>
          <!-- Count badge, top-right of the stack. -->
          <div class="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-neutral-950 px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm">
            {{ multiDragItems.length }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Drag-and-drop visual states, mirrored from Sidebar's workflow reorder. */
[data-file-item] {
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
}
.fb-chosen {
  cursor: grabbing;
}
.fb-ghost {
  opacity: 0;
}
/* Floating clone that follows the cursor. The drag class lands on the grid
   cell (104–250px wide) — wider than the 88px icon it contains — so any
   box-shadow on it drew a halo around the cell's bounds and read as a
   framed "box" around the icon. Keep the clone unadorned, mirroring
   Sidebar's wf-drag. */
.fb-drag {
  opacity: 0.95;
  box-shadow: none;
  background: transparent;
}
.fb-drop-into > * {
  outline: 2px solid var(--color-neutral-950);
  outline-offset: -2px;
  background-color: var(--color-neutral-100) !important;
}
/* List view: drop the bottom border on the last row's inner handle so it
   doesn't double up against the scroll container's border. */
[data-file-item]:last-child > [data-fb-handle] {
  border-bottom-width: 0;
}
</style>

<style>
/* SortableJS clones the dragged row into <body> (`fallbackOnBody: true`), so
   the clone is outside this component's scoped-CSS reach. When multi-drag is
   active the clone would otherwise float over the stacked ghost showing a
   single-item drag visual. A watcher on `multiDragActive` toggles
   `.fb-multi-dragging` on <body>; this unscoped rule hides the clone so only
   the stacked ghost is visible. */
body.fb-multi-dragging .fb-drag {
  opacity: 0 !important;
}
</style>
