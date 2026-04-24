<script setup lang="ts">
import { vDraggable } from 'vue-draggable-plus'
import type { StorageFile, StorageFolder, SharedFileReference } from '~/composables/useStorage'
import type { SelectedItem } from '~/components/ContextualActionBar.vue'
import type { FileIconName } from '~/composables/useFileIcons'
import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

const props = withDefaults(defineProps<{
  storageName?: string
}>(), {
  storageName: 'Workspace',
})

const { listFiles, uploadFile, deleteFiles, renameFile, renameFolder, moveFile, reorderFiles, createFolder, copyStorageFile, copyStorageFolder, downloadFile, stripUserPrefix, listSharedWithMe, validateSubdirectoryShare, shareDirectory, unshareDirectory, provider: storageProvider, isLoading, error: storageError, folderOpMessage } = useStorage()
const { getIconForFile, getIconForFolder } = useFileIcons()
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

// Check if this is shared files view
const isSharedMode = computed(() => props.storageName === 'Shared')

type ViewMode = 'icon' | 'list'
const viewMode = ref<ViewMode>('icon')
const searchQuery = ref('')
const searchExpanded = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

const currentPath = ref<string[]>([])
const pathHistory = ref<string[][]>([[]])
const historyIndex = ref(0)

const folders = ref<StorageFolder[]>([])
const files = ref<StorageFile[]>([])
const currentOrder = ref<string[]>([])

// Shared files grouped by source workspace
interface SharedFileGroup {
  workspaceId: string
  workspaceName: string
  files: Array<StorageFile & { permissionLevel: 'viewer' | 'editor' }>
}
const sharedFileGroups = ref<SharedFileGroup[]>([])

const selectedItemId = ref<string | null>(null)
const selectedItem = ref<SelectedItem | null>(null)
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

const isMoveModalOpen = ref(false)
const movePath = ref<string[]>([])
const moveFolders = ref<StorageFolder[]>([])

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

const currentDirName = computed(() => {
  if (currentPath.value.length === 0) return props.storageName
  return currentPath.value[currentPath.value.length - 1]!
})

const breadcrumbSegments = computed(() => {
  return [props.storageName, ...currentPath.value]
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

async function refreshFiles() {
  if (isSharedMode.value) {
    // Load shared files grouped by source workspace
    const sharedRefs = await listSharedWithMe()
    const grouped = new Map<string, SharedFileGroup>()
    
    for (const ref of sharedRefs) {
      if (!grouped.has(ref.workspace_id)) {
        // Extract workspace name from file_path (format: workspace_id/main/{source_workspace_name}/{files})
        const pathParts = ref.file_path.split('/')
        const sourceWorkspaceName = pathParts[2] || 'Unknown'
        grouped.set(ref.workspace_id, {
          workspaceId: ref.workspace_id,
          workspaceName: sourceWorkspaceName,
          files: [],
        })
      }
      
      const group = grouped.get(ref.workspace_id)!
      group.files.push({
        id: `${ref.workspace_id}-${ref.file_path}`,
        name: ref.file_path.split('/').pop() || '',
        path: ref.file_path,
        size: 0, // Would need to fetch from storage if needed
        createdAt: ref.created_at,
        provider: 'supabase',
        permissionLevel: ref.permission_level,
      })
    }
    
    sharedFileGroups.value = Array.from(grouped.values())
    folders.value = []
    files.value = []
  } else {
    // Load workspace main files
    const result = await listFiles(currentPath.value)
    folders.value = result.folders
    files.value = result.files
    currentOrder.value = result.order ?? []
    sharedFileGroups.value = []
  }
}

// Also watch the active workspace id: `listFiles` silently returns an empty
// directory when the workspace isn't loaded yet, and workspaces arrive
// asynchronously from the sidebar's fetch. Without this dependency, a cold
// load can race and leave the browser permanently empty until remount.
watch(
  [currentPath, () => currentWorkspace.value?.id],
  ([, wsId]) => {
    if (!wsId) return
    refreshFiles()
  },
  { immediate: true },
)

// Refresh when a Drive migration finishes so provider icons reflect the
// new backend without requiring a manual reload.
const { state: driveMigrationState } = useDriveMigration()
watch(() => driveMigrationState.status, (status, prev) => {
  if (prev === 'running' && (status === 'done' || status === 'failed')) {
    refreshFiles()
  }
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
const activeFilter = ref('All files')

function toggleFilter() {
  isFilterOpen.value = !isFilterOpen.value
}

function closeFilter() {
  isFilterOpen.value = false
}

function setFilter(label: string) {
  activeFilter.value = label
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
  // In shared mode, return grouped files differently
  if (isSharedMode.value) {
    const allItems: any[] = []
    
    for (const group of sharedFileGroups.value) {
      // Add workspace header as a special item
      allItems.push({
        kind: 'workspace-header' as const,
        id: `workspace-header-${group.workspaceId}`,
        workspaceName: group.workspaceName,
      })
      
      // Add files from this workspace
      for (const file of group.files) {
        const icon = getIconForFile(file.name)
        allItems.push({
          kind: 'file' as const,
          name: file.name,
          path: file.path,
          provider: file.provider,
          icon: icon as FileIconName,
          id: file.id,
          size: file.size,
          createdAt: file.createdAt,
          permissionLevel: file.permissionLevel,
          sourceWorkspace: group.workspaceName,
        })
      }
    }
    
    return allItems
  }
  
  // Normal workspace file mode
  let resultFolders = folders.value.filter(f => !f.name.startsWith('.'))
  let resultFiles = files.value.filter(f => !f.name.startsWith('.'))

  if (activeFilter.value !== 'All files') {
    const typeMap: Record<string, string[]> = {
      'Images': ['image'],
      'Documents': ['document', 'calendar', 'spreadsheet', 'presentation', 'file-text', 'file-code'],
      'Videos': ['video'],
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
    ...resultFolders.map(f => ({ kind: 'folder' as const, name: f.name, path: f.path, provider: f.provider, icon: getIconForFolder() as FileIconName, id: `folder-${f.name}` })),
    ...resultFiles.map(f => ({ kind: 'file' as const, name: f.name, path: f.path, provider: f.provider, icon: getIconForFile(f.name) as FileIconName, id: f.id, size: f.size, createdAt: f.createdAt })),
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
        icon: getIconForFolder() as FileIconName,
      },
      ...base,
    ]
  }
  return base
})

/** Icon + copy centred in the whole white panel (behind the toolbar), not only below it */
const showEmptyFolderOverlay = computed(() => {
  if (isLoading.value && filteredFiles.value.length === 0 && !pendingNewFolder.value && !pendingDuplicate.value) return false
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

function isPendingRow(item: { isPendingNew?: boolean; isPendingDuplicate?: boolean }): boolean {
  return item.isPendingNew === true || item.isPendingDuplicate === true
}

function selectItem(item: typeof filteredFiles.value[number]) {
  // Skip workspace headers
  if ('kind' in item && item.kind === 'workspace-header') {
    return
  }
  
  if (selectedItemId.value === item.id) {
    deselectItem()
    return
  }
  selectedItemId.value = item.id
  selectedItem.value = {
    kind: item.kind,
    name: item.name,
    path: item.path,
    icon: item.icon,
    provider: item.provider as StorageProvider,
    permissionLevel: 'permissionLevel' in item ? item.permissionLevel : undefined,
  }
  selectedFileExtra.value = 'size' in item
    ? { size: item.size as number, createdAt: item.createdAt as string }
    : null
  searchExpanded.value = false
  searchQuery.value = ''
}

function deselectItem() {
  selectedItemId.value = null
  selectedItem.value = null
  selectedFileExtra.value = null
  isRenaming.value = false
}

function handleItemClick(item: typeof filteredFiles.value[number]) {
  if ('kind' in item && item.kind === 'workspace-header') return
  if (item.kind === 'folder') {
    openFolder(item.name)
  } else {
    selectItem(item)
  }
}

function handleFolderClick(item: typeof filteredFiles.value[number]) {
  if ('kind' in item && item.kind === 'workspace-header') return
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
    }
    toast.update(toastId, {
      message: t('storage.uploadProgress', { done: i + 1, total, files: filesLabel }),
    })
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
  if (stillOnTarget()) await refreshFiles()
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
  }
  const alreadyExists = folders.value.some(f => f.name === finalName)
  if (!alreadyExists) folders.value = [...folders.value, optimisticFolder]
  pendingNewFolder.value = null

  void (async () => {
    const ok = await createFolder(currentPath.value, finalName)
    if (!ok) {
      if (!alreadyExists) {
        folders.value = folders.value.filter(f => f.path !== optimisticPath)
      }
      return
    }
    await refreshFiles()
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
  if (!selectedItem.value) return
  if (pendingDuplicate.value) return
  if (pendingNewFolder.value) cancelPendingNewFolder()
  folderOpMessage.value = null
  pendingDuplicate.value = {
    draftName: nextDuplicateName(selectedItem.value.name, selectedItem.value.kind),
    sourceKind: selectedItem.value.kind,
    sourceName: selectedItem.value.name,
    sourceIcon: selectedItem.value.icon,
  }
  deselectItem()
  focusDuplicateInput()
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
      await refreshFiles()
    }
  } else {
    const sourceSegments = [...currentPath.value, state.sourceName]
    const ok = await copyStorageFolder(sourceSegments, finalName)
    if (ok) {
      pendingDuplicate.value = null
      await refreshFiles()
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
  // to the tail on next refresh.
  const oldRankIdx = currentOrder.value.indexOf(item.name)
  let renamedOrder: string[] | null = null
  if (oldRankIdx >= 0) {
    renamedOrder = [...currentOrder.value]
    renamedOrder[oldRankIdx] = newName
    currentOrder.value = renamedOrder
  }
  isRenaming.value = false
  deselectItem()

  void (async () => {
    const ok = item.kind === 'folder'
      ? await renameFolder(relativePath, newName)
      : await renameFile(relativePath, newName)
    if (!ok) {
      toast.show(t('storage.renameFailed'), 'error')
      await refreshFiles()
      return
    }
    if (renamedOrder) {
      // Fire-and-forget: persist the updated rank so a fresh page load keeps
      // the user's manual position for the renamed item.
      const parentPath = currentPath.value.join('/')
      void reorderFiles(parentPath, renamedOrder)
    }
    await refreshFiles()
  })()
}

function cancelRename() {
  isRenaming.value = false
  renameInput.value = ''
}

async function handleDelete() {
  if (!selectedItem.value) return
  const item = selectedItem.value
  const relativePath = stripUserPrefix(item.path)

  // Optimistic UI: drop the item from view immediately rather than waiting on
  // the backend. refreshFiles() reconciles (and restores the row) on failure.
  if (item.kind === 'folder') {
    folders.value = folders.value.filter(f => f.path !== item.path)
  } else {
    files.value = files.value.filter(f => f.path !== item.path)
    if (isSharedMode.value) {
      sharedFileGroups.value = sharedFileGroups.value
        .map(g => ({ ...g, files: g.files.filter(f => f.path !== item.path) }))
        .filter(g => g.files.length > 0)
    }
  }
  deselectItem()

  void (async () => {
    const ok = await deleteFiles([relativePath], item.kind)
    if (!ok) {
      toast.show(t('storage.deleteFailed'), 'error')
      await refreshFiles()
    }
  })()
}

async function openMoveModal() {
  if (!selectedItem.value) return
  movePath.value = [...currentPath.value]
  isMoveModalOpen.value = true
  await loadMoveFolders()
}

async function loadMoveFolders() {
  const result = await listFiles(movePath.value)
  moveFolders.value = result.folders.filter(f => {
    const folderName = f.name
    if (selectedItem.value?.kind === 'folder' && folderName === selectedItem.value.name) return false
    return true
  })
}

function navigateMoveFolder(folderName: string) {
  movePath.value = [...movePath.value, folderName]
  loadMoveFolders()
}

function navigateMoveBreadcrumb(index: number) {
  if (index === 0) {
    movePath.value = []
  } else {
    movePath.value = movePath.value.slice(0, index)
  }
  loadMoveFolders()
}

async function confirmMove() {
  if (!selectedItem.value) return
  const itemRelativePath = stripUserPrefix(selectedItem.value.path)
  const itemName = selectedItem.value.name
  const destinationPath = movePath.value.length > 0
    ? `${movePath.value.join('/')}/${itemName}`
    : itemName
  await moveFile(itemRelativePath, destinationPath, selectedItem.value.kind)
  isMoveModalOpen.value = false
  deselectItem()
  await refreshFiles()
}

function cancelMove() {
  isMoveModalOpen.value = false
  movePath.value = []
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
let pendingDropInto: { name: string; path: string; element: HTMLElement } | null = null

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

function parseRowData(el: HTMLElement | null | undefined): { kind: 'file' | 'folder'; name: string; path: string } | null {
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

function onSortableMove(evt: any, originalEvent?: Event): boolean {
  clearDropIntoHighlight()
  pendingDropInto = null

  const related = evt.related as HTMLElement | null
  const dragged = parseRowData(evt.dragged as HTMLElement | null)
  const target = parseRowData(related)
  if (!dragged || !target) return true

  // Never drop onto self.
  if (target.path === dragged.path) return false
  // Never drop a folder into its own descendant.
  if (dragged.kind === 'folder' && target.path.startsWith(`${dragged.path}/`)) return false

  // Drop-into-folder zone. In LIST view the middle ~30% of a row's height is
  // the trigger; top/bottom edges pass through to a reorder swap. In ICON
  // (grid) view we need BOTH axes: otherwise dragging horizontally across a
  // row puts the cursor at the vertical midline of every cell it passes, so
  // every folder along the way returned `false` from onMove and blocked the
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
    const inMidY = y >= rect.top + rect.height * 0.35 && y <= rect.bottom - rect.height * 0.35
    const inMidX = x >= rect.left + rect.width * 0.35 && x <= rect.right - rect.width * 0.35
    const inMid = viewMode.value === 'icon' ? (inMidX && inMidY) : inMidY
    if (inMid) {
      related.classList.add('fb-drop-into')
      pendingDropInto = { name: target.name, path: target.path, element: related }
      return false
    }
  }
  return true
}

// SortableJS's onMove only fires while the cursor is over another sortable
// row, so moving into empty space (or back onto the dragged item) leaves
// `pendingDropInto` stuck on the last folder that was hovered. This listener
// runs during the whole drag and clears the pending target as soon as the
// cursor leaves the stored folder's drop-into zone, so the highlight lets go
// in real time and the drop doesn't fall into the wrong folder.
function onDragPointerMove(ev: PointerEvent) {
  if (!pendingDropInto) return
  const rect = pendingDropInto.element.getBoundingClientRect()
  const inMidY = ev.clientY >= rect.top + rect.height * 0.35 &&
                 ev.clientY <= rect.bottom - rect.height * 0.35
  const inMidX = ev.clientX >= rect.left + rect.width * 0.35 &&
                 ev.clientX <= rect.right - rect.width * 0.35
  // Mirror onSortableMove's zone: 2D in grid view, Y-only in list view.
  const inside = viewMode.value === 'icon'
    ? (inMidX && inMidY)
    : (inMidY && ev.clientX >= rect.left && ev.clientX <= rect.right)
  if (!inside) {
    pendingDropInto.element.classList.remove('fb-drop-into')
    pendingDropInto = null
  }
}

function onSortableStart() {
  document.addEventListener('pointermove', onDragPointerMove, true)
}

async function onSortableEnd(evt: any) {
  document.removeEventListener('pointermove', onDragPointerMove, true)
  const dropTarget = pendingDropInto
  pendingDropInto = null
  clearDropIntoHighlight()

  if (dropTarget) {
    const dragged = parseRowData(evt.item as HTMLElement)
    if (!dragged) {
      suppressRebuild = true
      displayItems.value = [...listItemsForView.value]
      return
    }

    // Optimistic UI: the item is now (conceptually) inside the target folder,
    // so drop it from the current view immediately instead of snapping it back
    // and waiting on the backend. Filter from listItemsForView so the order
    // reflects source-of-truth rather than SortableJS's mid-drag mutation.
    suppressRebuild = true
    displayItems.value = listItemsForView.value.filter((item) => {
      const p = (item as { path?: unknown }).path
      return typeof p !== 'string' || p !== dragged.path
    })
    deselectItem()

    const relativePath = stripUserPrefix(dragged.path)
    const destPath = `${dropTarget.path}/${dragged.name}`

    // Fire-and-forget backend sync. refreshFiles reconciles with real state
    // (including reverting the optimistic removal if the move failed).
    void (async () => {
      const ok = await moveFile(relativePath, destPath, dragged.kind)
      if (!ok) toast.show(t('storage.orderSaveFailed'), 'error')
      await refreshFiles()
    })()
    return
  }

  // Pure reorder — persist the new order. Pending rows and shared-mode
  // workspace headers are excluded from the persisted list.
  const parentPath = currentPath.value.join('/')
  const orderedNames = displayItems.value
    .filter(item => !isPendingRow(item) && !('workspaceName' in item))
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
    await refreshFiles()
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
  ghostClass: 'fb-ghost',
  chosenClass: 'fb-chosen',
  dragClass: 'fb-drag',
  onStart: onSortableStart,
  onMove: onSortableMove,
  onEnd: onSortableEnd,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col relative">
    <div class="ghost-panel flex min-h-0 min-w-0 flex-1 flex-col rounded-[1.25rem] bg-white">
      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.25rem]">
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
                {{ searchQuery.trim() ? 'No files match your search.' : 'This folder is empty.' }}
              </p>
            </div>
          </div>

        <div class="relative z-20 shrink-0 bg-white">
          <div class="px-5 pt-5 pb-2.5 sm:px-6 sm:pt-6 sm:pb-3">
            <div class="flex items-center gap-2">
              <div v-if="currentPath.length > 0" class="shrink-0">
                <button
                  class="flex items-center justify-center size-8 rounded-lg text-neutral-700 hover:text-black transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  :disabled="!canGoBack"
                  aria-label="Go back"
                  @click="goBack"
                >
                  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              </div>

              <div class="min-w-0 flex-1 flex flex-col">
                <h2 class="truncate text-headline-md font-semibold text-neutral-950 pl-2">
                  {{ currentDirName }}
                </h2>
              </div>

              <template v-if="!selectedItem">
                <div class="flex items-center gap-2 shrink-0">
                  <div class="flex items-center rounded-lg bg-neutral-100 p-1">
                    <button
                      class="relative flex items-center justify-center rounded-md px-2 py-1.5 transition-all"
                      :class="viewMode === 'icon' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
                      aria-label="Icon view"
                      @click="viewMode = 'icon'"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                    </button>
                    <button
                      class="relative flex items-center justify-center rounded-md px-2 py-1.5 transition-all"
                      :class="viewMode === 'list' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'"
                      aria-label="List view"
                      @click="viewMode = 'list'"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div class="group/action relative">
                    <button
                      class="flex items-center justify-center size-8 rounded-lg text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="pendingNewFolder ? 'bg-neutral-100 text-neutral-950' : ''"
                      aria-label="New folder"
                      @click="startNewFolder"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                      </svg>
                    </button>
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">New folder</span>
                  </div>

                  <div class="group/action relative">
                    <button
                      class="flex items-center justify-center size-8 rounded-lg text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="isUploading ? 'opacity-50 pointer-events-none' : ''"
                      aria-label="Upload"
                      @click="triggerUpload"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </button>
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Upload</span>
                  </div>

                  <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    class="hidden"
                    @change="handleFileUpload"
                  >

                  <div ref="filterRef" class="group/action relative">
                    <button
                      class="flex items-center justify-center size-8 rounded-lg text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                      :class="activeFilter !== 'All files' ? 'text-neutral-950 bg-neutral-100' : ''"
                      aria-label="Filter files"
                      @click="toggleFilter"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                    <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Filter</span>

                    <div
                      v-if="isFilterOpen"
                      class="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg bg-white py-1 shadow-lg border border-neutral-300 overflow-hidden"
                    >
                      <button
                        v-for="item in filterItems"
                        :key="item.icon"
                        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-body-md hover:bg-neutral-100 transition-colors cursor-pointer"
                        :class="activeFilter === item.label ? 'text-neutral-950 font-medium' : 'text-neutral-700'"
                        @click="setFilter(item.label)"
                      >
                        <span>{{ item.label }}</span>
                        <svg
                          v-if="activeFilter === item.label"
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
                  :class="searchExpanded ? 'w-1/4' : 'w-8'"
                >
                  <div
                    ref="searchRef"
                    class="w-full flex items-center h-8 rounded-lg border overflow-hidden"
                    :class="searchExpanded ? 'bg-neutral-100 border-neutral-300' : 'border-transparent'"
                  >
                    <button
                      class="shrink-0 flex items-center justify-center size-8 text-neutral-700 hover:text-neutral-950 transition-colors"
                      :class="!searchExpanded ? 'hover:bg-neutral-200' : ''"
                      aria-label="Search files"
                      @click="toggleSearch"
                    >
                      <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                        type="text"
                        placeholder="Search..."
                        class="w-full min-w-0 bg-transparent text-body-md text-neutral-950 placeholder:text-neutral-600 outline-none pr-2"
                        @keydown.escape="toggleSearch"
                      >
                    </div>
                  </div>
                  <span v-if="!searchExpanded" class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Search</span>
                </div>
              </template>
              <div v-else ref="selectionActionsRef" class="flex items-center gap-1 shrink-0">
                <!-- Share -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isShareModalOpen = true"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Share</span>
                </div>
                <!-- Manage access (permissions) -->
                <div v-if="canManageAccess" class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isPermissionsModalOpen = true"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Manage access</span>
                </div>
                <!-- Rename -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    :disabled="isRenaming"
                    @click="startRename"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" />
                      <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Rename</span>
                </div>
                <!-- Move -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="openMoveModal"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <path d="M8 13h8" />
                      <path d="m13 10 3 3-3 3" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Move</span>
                </div>
                <!-- Duplicate -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="startDuplicate"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Duplicate</span>
                </div>
                <!-- Download (files only) -->
                <div v-if="selectedItem?.kind === 'file'" class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="handleDownload"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Download</span>
                </div>
                <!-- Info -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                    @click="isInfoModalOpen = true"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Info</span>
                </div>
                <!-- Delete -->
                <div class="group/action relative">
                  <button
                    class="flex items-center justify-center size-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    @click="handleDelete"
                  >
                    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                  <span class="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/action:opacity-100 z-10">Delete</span>
                </div>
                <div class="w-px h-5 bg-neutral-200 shrink-0 mx-1" />
                <button
                  class="flex items-center justify-center size-8 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                  @click="deselectItem"
                >
                  <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <!-- Loading state: fill area below toolbar, centred -->
            <div v-if="isLoading && filteredFiles.length === 0 && !pendingNewFolder" class="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-5">
              <svg class="size-5 text-neutral-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>

            <!-- Error state -->
            <div v-else-if="storageError" class="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-5 text-center">
              <p class="text-body-md text-red-500 font-medium">{{ storageError }}</p>
              <button
                class="mt-2 text-body-md text-neutral-700 hover:text-neutral-950 font-medium underline"
                @click="refreshFiles"
              >
                Retry
              </button>
            </div>

            <!-- Empty: visual is full-panel overlay above; keep flow height for layout -->
            <div v-else-if="listItemsForView.length === 0" class="min-h-0 flex-1" />

            <!-- Icon view: padded grid with outer scroll -->
            <div v-else-if="viewMode === 'icon'" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6">
            <div
              v-if="!isSharedMode"
              v-draggable="[displayItems, sortableCommon]"
              class="grid"
              style="grid-template-columns: repeat(auto-fill, minmax(104px, 1fr))"
            >
              <div
                v-for="file in displayItems"
                :key="file.id"
                data-file-item
                :data-kind="file.kind"
                :data-item="JSON.stringify({ kind: file.kind, name: file.name, path: file.path })"
                class="flex justify-center items-start py-2"
                :class="isPendingRow(file) ? 'fb-pending-row' : ''"
                @click="handleRowClick(file)"
                @dblclick="handleRowDblClick(file)"
              >
                <div
                  class="w-[88px] flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-neutral-100 transition-colors text-left group cursor-pointer"
                  :class="selectedItemId === file.id ? 'bg-neutral-50 shadow-sm' : ''"
                >
                <svg class="size-14 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="file.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />

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
                    <path v-if="file.icon === 'file-code'" d="m9 13 2 2 4-4" />

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

                    <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />
                    <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
                    <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3L22 7l-3-3" />

                    <path v-if="file.icon === 'archive'" d="M21 8v13H3V8" />
                    <path v-if="file.icon === 'archive'" d="M1 3h22v5H1z" />
                    <path v-if="file.icon === 'archive'" d="M10 12h4" />

                    <rect v-if="file.icon === 'spreadsheet'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line v-if="file.icon === 'spreadsheet'" x1="3" y1="9" x2="21" y2="9" />
                    <line v-if="file.icon === 'spreadsheet'" x1="3" y1="15" x2="21" y2="15" />
                    <line v-if="file.icon === 'spreadsheet'" x1="9" y1="3" x2="9" y2="21" />
                    <line v-if="file.icon === 'spreadsheet'" x1="15" y1="3" x2="15" y2="21" />

                    <rect v-if="file.icon === 'presentation'" x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line v-if="file.icon === 'presentation'" x1="8" y1="21" x2="16" y2="21" />
                    <line v-if="file.icon === 'presentation'" x1="12" y1="17" x2="12" y2="21" />

                    <ellipse v-if="file.icon === 'database'" cx="12" cy="5" rx="9" ry="3" />
                    <path v-if="file.icon === 'database'" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path v-if="file.icon === 'database'" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />

                    <path v-if="file.icon === 'font'" d="M4 20h16" />
                    <path v-if="file.icon === 'font'" d="m6 16 6-12 6 12" />
                    <line v-if="file.icon === 'font'" x1="8" y1="12" x2="16" y2="12" />

                    <circle v-if="file.icon === 'config'" cx="12" cy="12" r="3" />
                    <path v-if="file.icon === 'config'" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />

                    <path v-if="file.icon === 'executable'" d="M4 4h16v16H4z" />
                    <path v-if="file.icon === 'executable'" d="M9 9h6v6H9z" />

                    <path v-if="file.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="file.icon === 'file'" points="14 2 14 8 20 8" />
                  </svg>
                <!-- Duplicate inline name -->
                <input
                  v-if="isPendingRow(file) && pendingDuplicate"
                  :ref="bindDuplicateInputRef"
                  v-model="pendingDuplicate.draftName"
                  type="text"
                  class="w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
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
                  type="text"
                  class="w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
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
                  type="text"
                  class="w-full text-meta text-neutral-950 text-center bg-neutral-100 border border-neutral-400 rounded px-1 py-0.5 outline-none focus:border-neutral-950"
                  @focus="onRenameInputFocus"
                  @keydown.enter="confirmRename"
                  @keydown.escape="cancelRename"
                  @blur="confirmRename"
                >
                <div v-else class="flex items-center justify-center gap-1 w-full min-w-0">
                  <span :title="file.name" class="text-meta text-neutral-950 leading-tight font-medium min-w-0 truncate">{{ file.name }}</span>
                  <StorageProviderIcon :provider="file.provider as StorageProvider" inline />
                </div>
                <!-- Permission badge for shared files -->
                <span v-if="'permissionLevel' in file" class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                  {{ file.permissionLevel === 'viewer' ? 'View' : 'Edit' }}
                </span>
                </div>
              </div>
            </div>
            <!-- Shared mode: non-draggable grid grouped by source workspace -->
            <div v-else class="grid" style="grid-template-columns: repeat(auto-fill, minmax(104px, 1fr))">
              <template v-for="item in listItemsForView" :key="item.id">
                <div v-if="'workspaceName' in item" class="col-span-full py-2 px-2 mb-2">
                  <p class="text-sm font-semibold text-neutral-600">{{ item.workspaceName }}</p>
                </div>
                <div
                  v-else
                  data-file-item
                  class="flex justify-center items-start py-2"
                  @click="handleRowClick(item)"
                  @dblclick="handleRowDblClick(item)"
                >
                  <div
                    class="w-[88px] flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-neutral-100 transition-colors text-left group cursor-pointer"
                    :class="selectedItemId === item.id ? 'bg-neutral-50 shadow-sm' : ''"
                  >
                  <svg class="size-14 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="item.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <path v-if="item.icon === 'image'" d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    <rect v-if="item.icon === 'image'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle v-if="item.icon === 'image'" cx="9" cy="9" r="2" />
                    <path v-if="item.icon === 'image'" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    <path v-if="item.icon === 'file-code'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="item.icon === 'file-code'" points="14 2 14 8 20 8" />
                    <path v-if="item.icon === 'file-code'" d="m9 13 2 2 4-4" />
                    <path v-if="item.icon === 'file-text'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="item.icon === 'file-text'" points="14 2 14 8 20 8" />
                    <line v-if="item.icon === 'file-text'" x1="16" y1="13" x2="8" y2="13" />
                    <line v-if="item.icon === 'file-text'" x1="16" y1="17" x2="8" y2="17" />
                    <line v-if="item.icon === 'file-text'" x1="10" y1="9" x2="8" y2="9" />
                    <path v-if="item.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline v-if="item.icon === 'file'" points="14 2 14 8 20 8" />
                  </svg>
                  <div class="flex items-center justify-center gap-1 w-full min-w-0">
                    <span :title="item.name" class="text-meta text-neutral-950 leading-tight font-medium min-w-0 truncate">{{ item.name }}</span>
                    <StorageProviderIcon :provider="item.provider as StorageProvider" inline />
                  </div>
                  <span v-if="'permissionLevel' in item" class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                    {{ item.permissionLevel === 'viewer' ? 'View' : 'Edit' }}
                  </span>
                  </div>
                </div>
              </template>
            </div>
            </div>

            <!-- List view: Finder-style table with column headers -->
            <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6">
              <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <!-- Column headers -->
                <div
                  class="grid shrink-0 items-center border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5 text-[11px] font-medium text-neutral-500"
                  style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                >
                  <div class="truncate">{{ t('storage.listColumns.name') }}</div>
                  <div class="truncate text-right">{{ t('storage.listColumns.size') }}</div>
                  <div class="truncate">{{ t('storage.listColumns.kind') }}</div>
                  <div class="truncate">{{ t('storage.listColumns.dateModified') }}</div>
                </div>

                <!-- Scrollable rows -->
                <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  <!-- Shared file workspace headers (in shared mode only) -->
                  <template v-if="isSharedMode">
                    <template v-for="item in displayItems" :key="item.id">
                      <div v-if="'workspaceName' in item" class="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5">
                        <p class="text-xs font-semibold text-neutral-600">{{ item.workspaceName }}</p>
                      </div>
                    </template>
                  </template>

                  <!-- Regular file rows (draggable in non-shared mode) -->
                  <div v-draggable="[displayItems, { ...sortableCommon, disabled: isSharedMode }]" class="flex flex-col">
                  <div
                    v-for="file in displayItems"
                    v-show="!('workspaceName' in file)"
                    :key="file.id"
                    data-file-item
                    :data-kind="file.kind"
                    :data-item="JSON.stringify({ kind: file.kind, name: file.name, path: file.path })"
                    class="grid items-center border-b border-neutral-100 px-3 py-1.5 hover:bg-neutral-100 transition-colors cursor-pointer last:border-b-0"
                    :class="[selectedItemId === file.id ? 'bg-neutral-50' : '', isPendingRow(file) ? 'fb-pending-row' : '']"
                    style="grid-template-columns: minmax(200px, 1fr) 96px 128px 172px; column-gap: 16px;"
                    @click="handleRowClick(file)"
                    @dblclick="handleRowDblClick(file)"
                  >
                    <!-- Name column: icon + name bunched left -->
                    <div class="flex min-w-0 items-center gap-2">
                      <svg class="size-4 text-neutral-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path v-if="file.icon === 'folder'" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />

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
                        <path v-if="file.icon === 'file-code'" d="m9 13 2 2 4-4" />

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

                        <circle v-if="file.icon === 'key'" cx="7.5" cy="15.5" r="5.5" />
                        <path v-if="file.icon === 'key'" d="m21 2-9.6 9.6" />
                        <path v-if="file.icon === 'key'" d="m15.5 7.5 3 3L22 7l-3-3" />

                        <path v-if="file.icon === 'archive'" d="M21 8v13H3V8" />
                        <path v-if="file.icon === 'archive'" d="M1 3h22v5H1z" />
                        <path v-if="file.icon === 'archive'" d="M10 12h4" />

                        <rect v-if="file.icon === 'spreadsheet'" x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line v-if="file.icon === 'spreadsheet'" x1="3" y1="9" x2="21" y2="9" />
                        <line v-if="file.icon === 'spreadsheet'" x1="3" y1="15" x2="21" y2="15" />
                        <line v-if="file.icon === 'spreadsheet'" x1="9" y1="3" x2="9" y2="21" />
                        <line v-if="file.icon === 'spreadsheet'" x1="15" y1="3" x2="15" y2="21" />

                        <rect v-if="file.icon === 'presentation'" x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line v-if="file.icon === 'presentation'" x1="8" y1="21" x2="16" y2="21" />
                        <line v-if="file.icon === 'presentation'" x1="12" y1="17" x2="12" y2="21" />

                        <ellipse v-if="file.icon === 'database'" cx="12" cy="5" rx="9" ry="3" />
                        <path v-if="file.icon === 'database'" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path v-if="file.icon === 'database'" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />

                        <path v-if="file.icon === 'font'" d="M4 20h16" />
                        <path v-if="file.icon === 'font'" d="m6 16 6-12 6 12" />
                        <line v-if="file.icon === 'font'" x1="8" y1="12" x2="16" y2="12" />

                        <circle v-if="file.icon === 'config'" cx="12" cy="12" r="3" />
                        <path v-if="file.icon === 'config'" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />

                        <path v-if="file.icon === 'executable'" d="M4 4h16v16H4z" />
                        <path v-if="file.icon === 'executable'" d="M9 9h6v6H9z" />

                        <path v-if="file.icon === 'file'" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline v-if="file.icon === 'file'" points="14 2 14 8 20 8" />
                      </svg>

                      <!-- Duplicate inline name -->
                      <input
                        v-if="isPendingRow(file) && pendingDuplicate"
                        :ref="bindDuplicateInputRef"
                        v-model="pendingDuplicate.draftName"
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
                        type="text"
                        class="flex-1 min-w-0 text-sm text-neutral-950 bg-neutral-100 border border-neutral-400 rounded px-2 py-0.5 outline-none focus:border-neutral-950 font-medium"
                        @focus="onRenameInputFocus"
                        @keydown.enter="confirmRename"
                        @keydown.escape="cancelRename"
                        @blur="confirmRename"
                      >
                      <template v-else>
                        <span :title="file.name" class="truncate text-sm text-neutral-950 font-medium min-w-0">{{ file.name }}</span>
                        <StorageProviderIcon :provider="file.provider as StorageProvider" inline />
                        <span v-if="'permissionLevel' in file" class="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          {{ file.permissionLevel === 'viewer' ? 'View' : 'Edit' }}
                        </span>
                      </template>
                    </div>

                    <!-- Size column -->
                    <div class="truncate text-right text-xs tabular-nums text-neutral-500">
                      {{ file.kind === 'file' && 'size' in file ? formatFileSize(file.size as number) : '—' }}
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
      @close="closePreview()"
      @download="handleDownload"
      @share="() => { closePreview(false); isShareModalOpen = true }"
      @rename="() => { closePreview(false); nextTick(() => startRename()) }"
      @move="() => { closePreview(false); openMoveModal() }"
      @info="() => { closePreview(false); isInfoModalOpen = true }"
      @delete="async () => { await handleDelete(); closePreview(false) }"
    />

    <!-- Share Modal -->
    <ShareModal
      v-if="isShareModalOpen && selectedItem"
      :item="selectedItem"
      @close="isShareModalOpen = false"
    />

    <!-- Permissions Modal -->
    <FilePermissionsModal
      v-if="isPermissionsModalOpen && selectedItem && currentWorkspace"
      :item="selectedItem"
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
        <div class="w-full max-w-md mx-4 rounded-xl bg-white border border-neutral-200 shadow-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-neutral-200">
            <h3 class="text-headline-md font-semibold text-neutral-950">Move to...</h3>
          </div>
          <div class="p-4 max-h-64 overflow-y-auto">
            <!-- Breadcrumbs for move -->
            <div class="flex items-center gap-1 mb-3 flex-wrap">
              <button
                class="text-body-md text-neutral-500 hover:text-neutral-950 transition-colors font-medium"
                @click="navigateMoveBreadcrumb(0)"
              >
                {{ storageName }}
              </button>
              <template v-for="(seg, i) in movePath" :key="i">
                <svg class="size-3 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <button
                  class="text-body-md text-neutral-500 hover:text-neutral-950 transition-colors font-medium"
                  @click="navigateMoveBreadcrumb(i + 1)"
                >
                  {{ seg }}
                </button>
              </template>
            </div>
            <div v-if="moveFolders.length === 0" class="py-4 text-center text-body-md text-neutral-500">
              No subfolders
            </div>
            <div v-else class="flex flex-col gap-1">
              <button
                v-for="folder in moveFolders"
                :key="folder.name"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors text-left w-full"
                @click="navigateMoveFolder(folder.name)"
              >
                <svg class="size-4 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span class="text-body-md text-neutral-950 font-medium">{{ folder.name }}</span>
                <svg class="size-3 text-neutral-400 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
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
  </div>
</template>

<style scoped>
/* Drag-and-drop visual states, mirrored from SidePanel's workflow reorder. */
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
   SidePanel's wf-drag. */
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
</style>
