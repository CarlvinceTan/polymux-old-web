<script setup lang="ts">
import { ref, nextTick, computed, watch, onBeforeUnmount } from 'vue'
import { vDraggable } from 'vue-draggable-plus'
import FlowFolderIcon from '~/components/FlowFolderIcon.vue'
import { DRAFT_WORKFLOW_ID, type WorkflowSummary } from '~/composables/workflows/useWorkflowList'

const { t, locale, locales, setLocale } = useI18n()

const route = useRoute()

// Collapse the whole sidebar. State is shared with the layout (which drives
// the .is-collapsed width transition and the collapsed restore handle that
// expands it again), so from here we only ever need to flip the flag.
const { toggle: toggleSidebar } = useSidebar()

// Profile dropdown state
const user = useSupabaseUser()

const {
  workspaces,
  currentWorkspace,
  currentWorkspaceDisplayName,
  currentWorkspaceId,
  currentMemberCount,
  switchWorkspace,
  fetchWorkspaces,
  fetchMembers: fetchWorkspaceMembers,
} = useWorkspaces()

useWorkspaceEvents()

// Warms Vue Query caches for likely-next surfaces (vault, wallet, storage,
// integrations, members) during the bootstrap loading window so they paint
// last-known data instead of flashing empty. Captured at setup; fired below.
const { prefetchWorkspaceCache } = usePrefetchWorkspaceCache()

const { navigateToPricing } = usePlanUpgradeNavigation()

const {
  sessions,
  realSessions,
  draft,
  runningOverrides,
  fetchSessions,
  createDraft,
  renameSession,
  reorderWorkflowScope,
  deleteSession,
} = useWorkflowList()

const {
  folders: flowFolders,
  assignments: flowFolderAssignments,
  pendingDraftFolder,
  ensureFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  reorderFolders,
  assignFlow,
  restorePendingDraftFolder,
  setPendingDraftFolder,
  clearPendingDraftFolder,
} = useFlowFolders()

// While a folder POST is in flight, keep the list projection pinned to the
// folders that existed when naming began. The confirmed folder is revealed in
// the same render that replaces the input row, preventing a duplicate row from
// briefly appearing below it.
const creatingFlowFolderSaving = ref(false)
let flowFolderCreationBaselineIds: Set<string> | null = null
const projectedFlowFolders = computed(() => {
  if (!creatingFlowFolderSaving.value || !flowFolderCreationBaselineIds) return flowFolders.value
  return flowFolders.value.filter(folder => flowFolderCreationBaselineIds?.has(folder.id))
})
const suppressFlowFolderCommitAnimation = ref(false)
// Keep SortableJS's final DOM order on screen while a cross-folder move is
// persisted. Assignment and ordering both update reactive stores; projecting
// between those two writes would briefly jump the moved flow to the top.
const committingWorkflowDrag = ref(false)

// Writable list bound to the draggable directive. Derived from `realSessions`
// (source of truth, already sorted server-side by workflows.position desc).
// SortableJS mutates this in place during drag; on drop
// we persist the new order within that row's folder scope. IMPORTANT: always mutate
// this array in place (splice) — `vue-draggable-plus` captures the array
// reference at mount time and has no `updated` hook, so reassigning
// `.value = newArray` leaves the library pointing at a stale reference and
// drag reorders silently fail.
interface SidebarWorkflowRow extends WorkflowSummary {
  flow_folder_placeholder_id?: string
  flow_unfiled_placeholder?: boolean
}

const displaySessions = ref<SidebarWorkflowRow[]>([])

watch(
  [realSessions, currentWorkspaceId, runningOverrides, projectedFlowFolders, flowFolderAssignments, committingWorkflowDrag],
  () => {
    if (committingWorkflowDrag.value) return
    // The row's v-for key is `session.id` (a stable workflow uuid).
    //
    // Merge runningOverrides over server data when projecting rows for the
    // template. The override map is the workflow page's authoritative read of
    // which engine is driving the row (chat vs. workflow_run); without it,
    // server `/sessions` refreshes would wipe `running_kind` back to undefined
    // and the indicator would default to the workflow_run progress arc even
    // for plain chat-driven activity.
    const overrides = runningOverrides.value
    const project = (s: WorkflowSummary): WorkflowSummary => {
      const o = overrides[s.id]
      return o ? { ...s, is_running: o.is_running, running_kind: o.running_kind } : s
    }

    // realSessions already comes back ordered by workflows.position desc, so
    // the server is the only source of order — no client-side resort and no
    // localStorage layer to reconcile.
    //
    // Only persisted workflows render as list rows — the in-flight "New
    // Workflow" draft (created via the New Workflow button) is intentionally not
    // shown here; it joins this list once its first prompt commits it into the
    // workflows table.
    const grouped = new Map<string, WorkflowSummary[]>()
    const unfiled: WorkflowSummary[] = []
    for (const session of realSessions.value.map(project)) {
      const folderId = flowFolderAssignments.value[session.id] ?? null
      if (!folderId) unfiled.push(session)
      else grouped.set(folderId, [...(grouped.get(folderId) ?? []), session])
    }
    const runningFirst = (a: WorkflowSummary, b: WorkflowSummary) => {
      if (!!a.is_running !== !!b.is_running) return a.is_running ? -1 : 1
      return 0
    }
    const next: SidebarWorkflowRow[] = []
    for (const folder of projectedFlowFolders.value) {
      const children = grouped.get(folder.id) ?? []
      // Keep the folder header in its own non-workflow row. Previously the
      // header lived inside the first child workflow's <li>, so dragging that
      // child also moved the folder header and effectively changed the
      // folder's position. A stable header row lets folder and workflow drags
      // remain completely independent.
      next.push({
        id: `flow-folder:${folder.id}`,
        title: folder.name,
        user_id: '',
        workspace_id: folder.workspace_id,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
        flow_folder_placeholder_id: folder.id,
      })
      next.push(...children.sort(runningFirst))
    }
    next.push(...unfiled.sort(runningFirst))
    // If every persisted flow is foldered, keep a zero-height sentinel in the
    // Sortable model. It expands only during a drag and provides an explicit
    // root-level target, so users can still move a flow out when there is no
    // existing unfiled row to drop beside.
    if (unfiled.length === 0 && realSessions.value.length > 0) {
      next.push({
        id: `flow-unfiled:${currentWorkspaceId.value ?? 'workspace'}`,
        title: 'No folder',
        user_id: '',
        workspace_id: currentWorkspaceId.value ?? '',
        created_at: '',
        updated_at: '',
        flow_unfiled_placeholder: true,
      })
    }
    displaySessions.value.splice(0, displaySessions.value.length, ...next)
  },
  { deep: true, immediate: true },
)

const FLOW_FOLDER_DRAG_HOVER_EXPAND_MS = 450
let workflowFolderHoverExpandTimer: ReturnType<typeof setTimeout> | null = null
let workflowFolderHoverExpandTargetId: string | null = null

function clearWorkflowFolderHoverExpand() {
  if (workflowFolderHoverExpandTimer) clearTimeout(workflowFolderHoverExpandTimer)
  workflowFolderHoverExpandTimer = null
  workflowFolderHoverExpandTargetId = null
}

function setWorkflowDragTargetScope(scope: string) {
  draggingWorkflowTargetScope = scope
  if (scope === 'unfiled' || !collapsedFlowFolders.value[scope]) {
    clearWorkflowFolderHoverExpand()
    return
  }
  if (workflowFolderHoverExpandTargetId === scope) return
  clearWorkflowFolderHoverExpand()
  workflowFolderHoverExpandTargetId = scope
  workflowFolderHoverExpandTimer = setTimeout(() => {
    setFlowFolderCollapsed(scope, false)
    workflowFolderHoverExpandTimer = null
    workflowFolderHoverExpandTargetId = null
  }, FLOW_FOLDER_DRAG_HOVER_EXPAND_MS)
}

function onDragMove(evt: { related?: HTMLElement, willInsertAfter?: boolean }): boolean {
  const relatedScope = evt.related?.dataset.flowFolderScope
  if (!relatedScope) return false
  // Crossing upward over the source folder's own header means "move out of
  // this folder", not "put the flow back at the top of the folder". Moving
  // downward onto an unfiled row/sentinel already resolves to the same root
  // scope through its data attribute.
  if (
    relatedScope === draggingWorkflowScope
    && evt.related?.classList.contains('wf-folder-placeholder')
    && evt.willInsertAfter === false
  ) {
    setWorkflowDragTargetScope('unfiled')
    return true
  }
  setWorkflowDragTargetScope(relatedScope)
  return true
}

// SortableJS rewrites the clone's transform as `matrix(...)` on every pointer
// move and sets inline `opacity: 0.8`. Each frame we force opacity to 1, lock
// X to 0 (column-only), and clamp Y to the first/last real row.
//
// `naturalY` tracks the unclamped cursor offset since drag start (by summing
// the deltas SortableJS applies each frame). When the cursor is past a bound,
// we hold the clone at the clamp; the clone only starts following again once
// the cursor re-enters the valid range — rather than tracking the cursor
// step-for-step from the clamped position.
let dragRaf: number | null = null
let listEl: HTMLElement | null = null
let draggingWorkflowScope: string | null = null
let draggingWorkflowTargetScope: string | null = null
let draggingWorkflowId: string | null = null
let dragPreviewRootPadding = '10px'
let dragPreviewFolderPadding = '36px'
let naturalY = 0
let lastClampedY = 0
// Drag-in-progress flag. Suppresses per-row hover affordances (e.g. the
// 3-dot menu trigger) on rows the cursor passes over during drag.
const isDragging = ref(false)
// True for the one render that commits a drop, so `move-class` swaps to the
// no-transition variant — see `onDragEnd` for why a swap is needed.
const isDropping = ref(false)

function constrainDragPreview() {
  const el = document.querySelector<HTMLElement>('.wf-drag')
  if (el && listEl) {
    if (el.style.opacity !== '1') el.style.opacity = '1'
    const previewRow = el.querySelector<HTMLElement>('[data-testid^="wf-row-"]')
    if (previewRow) {
      const targetPadding = draggingWorkflowTargetScope === 'unfiled'
        ? dragPreviewRootPadding
        : dragPreviewFolderPadding
      if (previewRow.style.paddingLeft !== targetPadding) previewRow.style.paddingLeft = targetPadding
      if (previewRow.style.transition !== 'padding-left 140ms ease') previewRow.style.transition = 'padding-left 140ms ease'
    }

    let currentY = lastClampedY
    const tf = el.style.transform
    if (tf) {
      try { currentY = new DOMMatrix(tf).f } catch {}
    }
    // SortableJS added cursor delta to our last-written Y.
    naturalY += currentY - lastClampedY

    // Exclude the draft row (pinned at top) and the clone itself (appended
    // inside the <ul> when `fallbackOnBody: false`). That leaves the real
    // rows + invisible ghost — the slot span the clone is allowed to cover.
    const rows = listEl.querySelectorAll<HTMLElement>('li:not(.wf-draft):not(.wf-drag)')
    const first = rows[0]
    const last = rows[rows.length - 1]

    if (first && last) {
      const cloneRect = el.getBoundingClientRect()
      // Where the clone rect would sit if we applied `naturalY` instead of
      // whatever SortableJS currently has in the DOM.
      const shift = naturalY - currentY
      const naturalTop = cloneRect.top + shift
      const naturalBottom = cloneRect.bottom + shift
      // Use offsetTop, not getBoundingClientRect, for first/last row bounds.
      // During sibling reorder, SortableJS applies temporary CSS transforms to
      // animate the rows — getBoundingClientRect returns the animating visual
      // position, which lags the final layout. offsetTop reflects the new
      // layout immediately, so the clamp doesn't lurch during the 200ms swap.
      const listRect = listEl.getBoundingClientRect()
      const topBound = listRect.top + first.offsetTop - listEl.scrollTop
      const bottomBound = listRect.top + last.offsetTop + last.offsetHeight - listEl.scrollTop

      let clampedY = naturalY
      if (naturalTop < topBound) clampedY = naturalY + (topBound - naturalTop)
      else if (naturalBottom > bottomBound) clampedY = naturalY - (naturalBottom - bottomBound)

      const locked = `translate3d(0px, ${clampedY}px, 0px)`
      if (el.style.transform !== locked) el.style.transform = locked
      lastClampedY = clampedY
    }
  }
  dragRaf = requestAnimationFrame(constrainDragPreview)
}

function onDragStart(evt: { from: HTMLElement, item: HTMLElement }) {
  listEl = evt.from
  draggingWorkflowScope = evt.item.dataset.flowFolderScope ?? null
  draggingWorkflowTargetScope = draggingWorkflowScope
  draggingWorkflowId = evt.item.dataset.workflowId ?? null
  clearWorkflowFolderHoverExpand()
  const sourceRow = evt.item.querySelector<HTMLElement>('[data-testid^="wf-row-"]')
  const rootRow = evt.from.querySelector<HTMLElement>('li[data-flow-folder-scope="unfiled"] [data-testid^="wf-row-"]')
  const folderRow = evt.from.querySelector<HTMLElement>('li[data-flow-folder-scope]:not([data-flow-folder-scope="unfiled"]):not(.wf-folder-placeholder) [data-testid^="wf-row-"]')
  const sourcePadding = sourceRow ? getComputedStyle(sourceRow).paddingLeft : null
  dragPreviewRootPadding = rootRow
    ? getComputedStyle(rootRow).paddingLeft
    : (draggingWorkflowScope === 'unfiled' && sourcePadding ? sourcePadding : '10px')
  dragPreviewFolderPadding = folderRow
    ? getComputedStyle(folderRow).paddingLeft
    : (draggingWorkflowScope !== 'unfiled' && sourcePadding ? sourcePadding : '36px')
  naturalY = 0
  lastClampedY = 0
  isDragging.value = true
  if (dragRaf != null) cancelAnimationFrame(dragRaf)
  dragRaf = requestAnimationFrame(constrainDragPreview)
}

async function persistWorkflowDrop(flowId: string, sourceScope: string, targetScope: string) {
  // The directive applies its array splice before calling our onEnd handler.
  // Wait for that model write so the scoped orders below reflect the actual
  // drop slot rather than the pre-drag list.
  await nextTick()

  const scopedIds = (scope: string) => displaySessions.value.flatMap((session) => {
    if (session.flow_folder_placeholder_id || session.flow_unfiled_placeholder) return []
    const projectedScope = session.id === flowId ? targetScope : flowFolderScope(session)
    return projectedScope === scope ? [session.id] : []
  })

  const sourceIds = scopedIds(sourceScope)
  const targetIds = sourceScope === targetScope ? sourceIds : scopedIds(targetScope)

  try {
    if (sourceScope === targetScope) {
      await reorderWorkflowScope(sourceScope === 'unfiled' ? null : sourceScope, sourceIds)
      return
    }

    committingWorkflowDrag.value = true
    await assignFlow(flowId, targetScope === 'unfiled' ? null : targetScope)

    const orderingWrites: Promise<void>[] = []
    if (sourceIds.length) {
      orderingWrites.push(reorderWorkflowScope(sourceScope === 'unfiled' ? null : sourceScope, sourceIds))
    }
    if (targetIds.length) {
      orderingWrites.push(reorderWorkflowScope(targetScope === 'unfiled' ? null : targetScope, targetIds))
    }
    await Promise.all(orderingWrites)

    if (targetScope !== 'unfiled') {
      collapsedFlowFolders.value = { ...collapsedFlowFolders.value, [targetScope]: false }
    }
  }
  catch (error) {
    console.error('[Sidebar] failed to move workflow between folder scopes', error)
  }
  finally {
    committingWorkflowDrag.value = false
    await nextTick()
    isDropping.value = false
  }
}

function onDragEnd() {
  if (dragRaf != null) {
    cancelAnimationFrame(dragRaf)
    dragRaf = null
  }
  listEl = null
  isDragging.value = false
  clearWorkflowFolderHoverExpand()

  // Suppress the post-drop FLIP tween until persistence finishes. This also
  // keeps a cross-folder move visually stationary while its assignment and
  // the two affected scoped orders settle.
  isDropping.value = true

  const sourceScope = draggingWorkflowScope
  const targetScope = draggingWorkflowTargetScope ?? sourceScope
  const flowId = draggingWorkflowId
  draggingWorkflowScope = null
  draggingWorkflowTargetScope = null
  draggingWorkflowId = null

  if (!flowId || !sourceScope || !targetScope) {
    nextTick(() => { isDropping.value = false })
    return
  }
  void persistWorkflowDrop(flowId, sourceScope, targetScope)
}

onBeforeUnmount(() => {
  if (dragRaf != null) cancelAnimationFrame(dragRaf)
  clearWorkflowFolderHoverExpand()
})

const draggableOptions = {
  // SortableJS animation duration for sibling shifts as the cursor passes
  // over rows during the drag. The post-drop tween is suppressed in
  // `onDragEnd` — see `isDropping`.
  animation: 220,
  easing: 'ease',
  direction: 'vertical',
  filter: '.wf-draft, .wf-folder-placeholder, .wf-unfiled-placeholder, .flow-folder-drag-handle',
  preventOnFilter: false,
  forceFallback: true,
  fallbackOnBody: false,
  fallbackTolerance: 3,
  scroll: true,
  scrollSensitivity: 30,
  scrollSpeed: 10,
  ghostClass: 'wf-ghost',
  chosenClass: 'wf-chosen',
  dragClass: 'wf-drag',
  onStart: onDragStart,
  onMove: onDragMove,
  onEnd: onDragEnd,
}

const bootstrapping = ref(true)

async function bootstrapData() {
  // For returning users currentWorkspaceId hydrates from localStorage, so the
  // session list can fetch in parallel with the workspace metadata. If the
  // cached id no longer matches one of the user's workspaces, fetchWorkspaces
  // resets it and the watch on currentWorkspaceId re-fetches sessions for the
  // new id. First-time users have no cached id and would otherwise issue an
  // unfiltered /sessions request, so wait for the workspace list in that case.
  try {
    if (currentWorkspaceId.value) {
      await Promise.all([fetchWorkspaces(), fetchSessions(), ensureFolders()])
    }
    else {
      await fetchWorkspaces()
      await Promise.all([fetchSessions(), ensureFolders()])
    }
    // Fire-and-forget: warm downstream caches while the user lands on the
    // sidebar. Not awaited so it never holds the bootstrap spinner open.
    void prefetchWorkspaceCache(currentWorkspaceId.value)
  }
  finally {
    bootstrapping.value = false
  }
}

// Initial data fetch
onMounted(async () => {
  // Capture phase: fires before any element can stopPropagation in the bubble
  // phase, so an outside click on a control that stops propagation (e.g. the
  // prompt-input OPTIONS button) still closes the open menus.
  document.addEventListener('click', handleClickOutside, true)
  restorePendingDraftFolder()
  workflowsCollapsed.value = localStorage.getItem(WORKFLOWS_COLLAPSE_KEY) === '1'
  lastBrowseRoute.value = normalizeStoredSidebarRoute(
    localStorage.getItem(SIDEBAR_LAST_BROWSE_ROUTE_KEY),
    'browse',
  ) ?? lastBrowseRoute.value
  lastChatRoute.value = normalizeStoredSidebarRoute(
    localStorage.getItem(SIDEBAR_LAST_CHAT_ROUTE_KEY),
    'chat',
  )
  void fetchGeneralChats()
  await bootstrapData()
})

// Re-bootstrap when the server comes back online — without this, fetches that
// failed during downtime never retry, leaving the sidebar stuck in its empty
// state.
useOnReconnect(bootstrapData)



// User data
const userEmail = computed(() => user.value?.email ?? 'user@example.com')
const userName = computed(() => {
  locale.value
  const meta = user.value?.user_metadata
  return (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || user.value?.email?.split('@')[0]
    || ''
})
const userPlan = computed(() => {
  locale.value
  const raw = (currentWorkspace.value?.plan as string | undefined) || 'free'
  const normalised = raw.toLowerCase().trim()
  if (normalised === 'pro') return t('settings.proPlan')
  if (normalised === 'max') return t('settings.maxPlan')
  if (normalised === 'enterprise') return t('settings.enterprisePlan')
  return t('settings.freePlan')
})
const userRole = computed(() => {
  locale.value
  const role = currentWorkspace.value?.role
  if (role === 'owner') return t('workspace.roleOwner')
  if (role === 'admin') return t('workspace.roleAdmin')
  return t('workspace.roleMember')
})
const avatarUrl = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.avatar_url as string | undefined) || (meta?.picture as string | undefined) || null
})
const avatarFailed = ref(false)
watch(avatarUrl, () => { avatarFailed.value = false })

const navItems = computed(() => {
  locale.value // explicit reactive dependency so labels update on locale switch
  return [
    { to: '/connections', label: t('nav.connections'), key: 'integrations' },
    { to: '/files', label: t('vault.tabs.files'), key: 'files' },
    { to: '/credentials', label: t('vault.tabs.credentials'), key: 'credentials' },
    { to: '/wallet', label: t('vault.tabs.wallet'), key: 'wallet' },
  ]
})

// Search modal state
const isSearchOpen = ref(false)

// Collapsible Workflows section. Persisted to localStorage so the choice
// survives a full reload. The value is read in onMounted (not at setup) so the
// SSR render always matches the client's first paint — reading localStorage
// during setup would diverge from the server's `false` default and trip a
// hydration mismatch on the collapse classes.
const WORKFLOWS_COLLAPSE_KEY = 'polymux_sidebar_workflows_collapsed'
const workflowsCollapsed = ref(false)
watch(workflowsCollapsed, (v) => { if (import.meta.client) localStorage.setItem(WORKFLOWS_COLLAPSE_KEY, v ? '1' : '0') })

const collapsedFlowFolders = ref<Record<string, boolean>>({})
const suppressFolderToggleListMoveAnimation = ref(false)
let folderToggleListMoveTimer: ReturnType<typeof setTimeout> | null = null
const flowFolderClickTimers = new Map<string, ReturnType<typeof setTimeout>>()
const creatingFlowFolder = ref(false)
const newFlowFolderName = ref('')
const editingFlowFolderId = ref<string | null>(null)
const editingFlowFolderName = ref('')
const activeFlowFolderMenuId = ref<string | null>(null)
const draggingFlowFolderId = ref<string | null>(null)
const flowFolderDropIndicator = ref<{ id: string, edge: 'before' | 'after' } | null>(null)
const suppressFlowFolderClickId = ref<string | null>(null)

// Empty folders are represented by placeholder rows in displaySessions so
// they share the exact same ordered list as folders that contain flows. This
// legacy fallback only renders a folder if projection has not produced either
// a placeholder or a child row yet (normally the result is empty).
const emptyFlowFolders = computed(() => projectedFlowFolders.value.filter(folder =>
  !displaySessions.value.some(session =>
    session.flow_folder_placeholder_id === folder.id
    || flowFolderAssignments.value[session.id] === folder.id,
  ),
))

function placeholderFolder(session: SidebarWorkflowRow) {
  return session.flow_folder_placeholder_id
    ? flowFolders.value.find(folder => folder.id === session.flow_folder_placeholder_id) ?? null
    : null
}

function flowFolderScope(session: SidebarWorkflowRow) {
  if (session.flow_unfiled_placeholder) return 'unfiled'
  return session.flow_folder_placeholder_id ?? flowFolderAssignments.value[session.id] ?? 'unfiled'
}

function folderForFlow(flowId: string) {
  const folderId = flowFolderAssignments.value[flowId]
  return folderId ? flowFolders.value.find(folder => folder.id === folderId) ?? null : null
}

function folderFlowTransitionStyle(flowId: string) {
  const folderId = flowFolderAssignments.value[flowId]
  if (!folderId) return undefined
  const siblings = displaySessions.value.filter(session =>
    !session.flow_folder_placeholder_id
    && !session.flow_unfiled_placeholder
    && flowFolderAssignments.value[session.id] === folderId,
  )
  const index = siblings.findIndex(session => session.id === flowId)
  if (index < 0) return undefined
  // Preserve the top-to-bottom cascade without allowing a large folder to
  // turn into a multi-second animation. The stagger spans at most 220ms.
  const step = siblings.length > 1 ? Math.min(28, 220 / (siblings.length - 1)) : 0
  return {
    '--folder-flow-enter-delay': `${Math.round(index * step)}ms`,
    '--folder-flow-leave-delay': `${Math.round((siblings.length - 1 - index) * step)}ms`,
  }
}

// Folder headers now always have their own placeholder row. Keep the legacy
// child-header branch disabled even while Sortable temporarily moves a child
// above its header during an upward drag.
function isFirstFlowInFolder() {
  return false
}

function setFlowFolderCollapsed(id: string, collapsed: boolean) {
  // The child rows already have their own clipped accordion transition. Keep
  // TransitionGroup's list-level FLIP animation off until that reveal settles,
  // otherwise it translates the newly visible rows from above the folder.
  suppressFolderToggleListMoveAnimation.value = true
  if (folderToggleListMoveTimer) clearTimeout(folderToggleListMoveTimer)
  folderToggleListMoveTimer = setTimeout(() => {
    suppressFolderToggleListMoveAnimation.value = false
    folderToggleListMoveTimer = null
  }, 460)
  collapsedFlowFolders.value = { ...collapsedFlowFolders.value, [id]: collapsed }
}

function toggleFlowFolder(id: string) {
  setFlowFolderCollapsed(id, !collapsedFlowFolders.value[id])
}

function handleFlowFolderClick(id: string) {
  if (suppressFlowFolderClickId.value === id) return
  const pending = flowFolderClickTimers.get(id)
  if (pending) clearTimeout(pending)
  flowFolderClickTimers.set(id, setTimeout(() => {
    flowFolderClickTimers.delete(id)
    toggleFlowFolder(id)
  }, 220))
}

function handleFlowFolderDoubleClick(id: string, name: string) {
  const pending = flowFolderClickTimers.get(id)
  if (pending) clearTimeout(pending)
  flowFolderClickTimers.delete(id)
  startRenameFlowFolder(id, name)
}

onBeforeUnmount(() => {
  for (const timer of flowFolderClickTimers.values()) clearTimeout(timer)
  flowFolderClickTimers.clear()
  if (folderToggleListMoveTimer) clearTimeout(folderToggleListMoveTimer)
})

function startCreateFlowFolder() {
  workflowsCollapsed.value = false
  creatingFlowFolder.value = true
  newFlowFolderName.value = ''
  nextTick(() => document.querySelector<HTMLInputElement>('[data-new-flow-folder]')?.focus())
}

async function confirmCreateFlowFolder() {
  if (creatingFlowFolderSaving.value) return
  const name = newFlowFolderName.value.trim()
  if (!name) {
    creatingFlowFolder.value = false
    newFlowFolderName.value = ''
    return
  }
  flowFolderCreationBaselineIds = new Set(flowFolders.value.map(folder => folder.id))
  creatingFlowFolderSaving.value = true
  try {
    const folder = await createFolder(name)
    if (!folder) return
    suppressFlowFolderCommitAnimation.value = true
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    creatingFlowFolder.value = false
    newFlowFolderName.value = ''
  }
  finally {
    creatingFlowFolderSaving.value = false
    flowFolderCreationBaselineIds = null
    await nextTick()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressFlowFolderCommitAnimation.value = false
      })
    })
  }
}

function startRenameFlowFolder(id: string, name: string) {
  activeFlowFolderMenuId.value = null
  editingFlowFolderId.value = id
  editingFlowFolderName.value = name
  nextTick(() => document.querySelector<HTMLInputElement>(`[data-flow-folder-rename="${id}"]`)?.select())
}

async function confirmRenameFlowFolder(id: string) {
  const name = editingFlowFolderName.value.trim()
  if (name) await renameFolder(id, name)
  editingFlowFolderId.value = null
}

function toggleFlowFolderMenu(id: string) {
  const pending = flowFolderClickTimers.get(id)
  if (pending) clearTimeout(pending)
  flowFolderClickTimers.delete(id)
  activeFlowFolderMenuId.value = activeFlowFolderMenuId.value === id ? null : id
}

function getFlowFolderMenuPosition(id: string) {
  const trigger = document.querySelector(`.flow-folder-menu-trigger[data-id="${id}"]`)
  if (!trigger) return { top: 0, left: 0 }
  const rect = trigger.getBoundingClientRect()
  return { top: rect.bottom, left: rect.right - 144 }
}

async function deleteFlowFolder(id: string) {
  activeFlowFolderMenuId.value = null
  await deleteFolder(id)
}

function startFlowFolderDrag(event: DragEvent, id: string) {
  const pending = flowFolderClickTimers.get(id)
  if (pending) clearTimeout(pending)
  flowFolderClickTimers.delete(id)
  draggingFlowFolderId.value = id
  activeFlowFolderMenuId.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

function updateFlowFolderDropIndicator(event: DragEvent, id: string) {
  if (!draggingFlowFolderId.value || draggingFlowFolderId.value === id) {
    flowFolderDropIndicator.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  flowFolderDropIndicator.value = { id, edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function suppressFlowFolderClick(id: string | null) {
  if (!id) return
  suppressFlowFolderClickId.value = id
  setTimeout(() => {
    if (suppressFlowFolderClickId.value === id) suppressFlowFolderClickId.value = null
  }, 0)
}

async function dropFlowFolder(event: DragEvent, targetId: string) {
  const sourceId = draggingFlowFolderId.value
  const edge = flowFolderDropIndicator.value?.id === targetId ? flowFolderDropIndicator.value.edge : 'before'
  suppressFlowFolderClick(sourceId)
  draggingFlowFolderId.value = null
  flowFolderDropIndicator.value = null
  if (!sourceId || sourceId === targetId) return
  const orderedIds = flowFolders.value.map(folder => folder.id)
  const sourceIndex = orderedIds.indexOf(sourceId)
  if (sourceIndex < 0) return
  orderedIds.splice(sourceIndex, 1)
  const targetIndex = orderedIds.indexOf(targetId)
  if (targetIndex < 0) return
  orderedIds.splice(targetIndex + (edge === 'after' ? 1 : 0), 0, sourceId)
  await reorderFolders(orderedIds)
}

function endFlowFolderDrag() {
  const sourceId = draggingFlowFolderId.value
  draggingFlowFolderId.value = null
  flowFolderDropIndicator.value = null
  suppressFlowFolderClick(sourceId)
}

async function moveFlowToFolder(flowId: string, folderId: string | null) {
  activeDropdownIndex.value = null
  await assignFlow(flowId, folderId)
  if (folderId) collapsedFlowFolders.value = { ...collapsedFlowFolders.value, [folderId]: false }
}

// Top-level Build / Chat switch. Build = the tool/integration/workflow nav;
// Chat = the general-assistant conversation list. Persisted like the collapse
// prefs and restored in onMounted to avoid a hydration mismatch.
const SIDEBAR_TAB_KEY = 'polymux_sidebar_tab'
const SIDEBAR_LAST_BROWSE_ROUTE_KEY = 'polymux_sidebar_last_browse_route'
const SIDEBAR_LAST_CHAT_ROUTE_KEY = 'polymux_sidebar_last_chat_route'
const DEFAULT_BROWSE_ROUTE = '/workflow/new'
const activeTab = ref<'browse' | 'chat'>('browse')
const lastBrowseRoute = ref(DEFAULT_BROWSE_ROUTE)
const lastChatRoute = ref<string | null>(null)
watch(activeTab, (v) => { if (import.meta.client) localStorage.setItem(SIDEBAR_TAB_KEY, v) })

function isChatPath(path: string): boolean {
  return path.startsWith('/chat/')
}

function pathFromRouteTarget(target: string): string {
  return target.split(/[?#]/, 1)[0] || '/'
}

function normalizeStoredSidebarRoute(raw: string | null, kind: 'browse' | 'chat'): string | null {
  if (!raw || !raw.startsWith('/')) return null
  const path = pathFromRouteTarget(raw)
  if (kind === 'chat') return isChatPath(path) ? raw : null
  return isChatPath(path) ? null : raw
}

function rememberSidebarRoute(fullPath: string, path: string) {
  if (!import.meta.client) return
  if (isChatPath(path)) {
    lastChatRoute.value = fullPath
    localStorage.setItem(SIDEBAR_LAST_CHAT_ROUTE_KEY, fullPath)
    return
  }
  lastBrowseRoute.value = fullPath || DEFAULT_BROWSE_ROUTE
  localStorage.setItem(SIDEBAR_LAST_BROWSE_ROUTE_KEY, lastBrowseRoute.value)
}

watch(
  () => route.fullPath,
  (fullPath) => {
    if (isChatPath(route.path)) activeTab.value = 'chat'
    else activeTab.value = 'browse'
    rememberSidebarRoute(fullPath, route.path)
  },
  { immediate: true },
)

// General chats (the Chat tab). Standalone conversations with the workspace's
// general assistant — see useWorkspaceChatList + the dedicated `chats` table.
const {
  chats: generalChats,
  chatsLoading,
  fetchChats: fetchGeneralChats,
  createChat: createGeneralChat,
  renameChat: renameGeneralChat,
  archiveChat: archiveGeneralChat,
  deleteChat: deleteGeneralChat,
  archivedChats,
  fetchArchivedChats,
  unarchiveChat,
  clearArchive,
} = useWorkspaceChatList()

const chatSearch = ref('')
const filteredChats = computed(() => {
  const q = chatSearch.value.trim().toLowerCase()
  if (!q) return generalChats.value
  return generalChats.value.filter(c => (c.title || t('chats.untitled')).toLowerCase().includes(q))
})

// Archive: an inline panel that expands UPWARD from the Archive row (replaces the
// old modal). Click the row to toggle; drag the resize handle at the TOP of the
// expanded panel to resize; the archived list scrolls inside.
const isArchiveOpen = ref(false)
const archiveHeight = ref(240)
const archiveDragging = ref(false)
const archiveConfirmingClear = ref(false)
const ARCHIVE_MIN_HEIGHT = 140
const ARCHIVE_MAX_HEIGHT = 460

function clampArchiveHeight(h: number) {
  return Math.min(ARCHIVE_MAX_HEIGHT, Math.max(ARCHIVE_MIN_HEIGHT, h))
}
async function openArchive() {
  isArchiveOpen.value = true
  archiveConfirmingClear.value = false
  await fetchArchivedChats()
}
function toggleArchive() {
  if (isArchiveOpen.value) isArchiveOpen.value = false
  else void openArchive()
}
// Resize by dragging the handle at the top edge of the expanded panel (drag up =
// grow). It lives on the panel, not the Archive row, so the row stays a clean
// click-to-toggle target.
function onArchiveResizePointerDown(e: PointerEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startHeight = archiveHeight.value
  archiveDragging.value = true
  const onMove = (ev: PointerEvent) => {
    const dy = startY - ev.clientY // drag up = grow
    archiveHeight.value = clampArchiveHeight(startHeight + dy)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    archiveDragging.value = false
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
async function onClearArchiveInline() {
  if (!archiveConfirmingClear.value) { archiveConfirmingClear.value = true; return }
  await clearArchive()
  archiveConfirmingClear.value = false
}

const activeChatId = computed(() => (route.path.startsWith('/chat/') ? (route.params.id as string) ?? null : null))
const hoveredChatId = ref<string | null>(null)
const activeChatMenuId = ref<string | null>(null)
const editingChatId = ref<string | null>(null)
const editingChatValue = ref('')

async function onNewChat() {
  const c = await createGeneralChat()
  if (c) navigateTo(`/chat/${c.id}`)
}
function openChat(id: string) {
  navigateTo(`/chat/${id}`)
}
function chatIdFromRouteTarget(target: string | null): string | null {
  if (!target) return null
  return pathFromRouteTarget(target).match(/^\/chat\/([^/]+)/)?.[1] ?? null
}

async function resolveLastChatRoute(): Promise<string | null> {
  const remembered = lastChatRoute.value
  if (!generalChats.value.length) await fetchGeneralChats()
  const rememberedId = chatIdFromRouteTarget(remembered)
  if (remembered && (!generalChats.value.length || generalChats.value.some(c => c.id === rememberedId))) {
    return remembered
  }
  const fallbackId = generalChats.value[0]?.id
  return fallbackId ? `/chat/${fallbackId}` : null
}

async function selectBrowseTab() {
  activeTab.value = 'browse'
  const target = lastBrowseRoute.value || DEFAULT_BROWSE_ROUTE
  if (route.fullPath !== target) await navigateTo(target)
}

async function selectChatTab() {
  activeTab.value = 'chat'
  const target = await resolveLastChatRoute()
  if (target && route.fullPath !== target) await navigateTo(target)
}
function getChatMenuPosition(id: string) {
  const trigger = document.querySelector(`.chat-list-trigger[data-id="${id}"]`)
  if (!trigger) return { top: 0, left: 0 }
  const rect = trigger.getBoundingClientRect()
  return { top: rect.bottom, left: rect.left }
}
function startChatRename(id: string, title: string) {
  editingChatId.value = id
  editingChatValue.value = title
  activeChatMenuId.value = null
  nextTick(() => {
    const input = document.querySelector('input[data-chat-rename]') as HTMLInputElement | null
    input?.focus()
    input?.select()
  })
}
async function confirmChatRename(id: string) {
  const title = editingChatValue.value.trim()
  if (title) await renameGeneralChat(id, title)
  editingChatId.value = null
}
function cancelChatRename() {
  editingChatId.value = null
  editingChatValue.value = ''
}
async function onArchiveChat(id: string) {
  activeChatMenuId.value = null
  await archiveGeneralChat(id)
  if (isArchiveOpen.value) await fetchArchivedChats()
}
async function onDeleteChat(id: string) {
  activeChatMenuId.value = null
  await deleteGeneralChat(id)
}

const isProfileDropdownOpen = ref(false)
const profileDropdownRef = ref<{ dropdownRef: HTMLElement | null } | null>(null)
const isLanguageOpen = ref(false)
const isHelpOpen = ref(false)
const isBugReportOpen = ref(false)
const languageBtnRef = ref<HTMLElement | null>(null)
const helpBtnRef = ref<HTMLElement | null>(null)
const languagePanelRef = ref<HTMLElement | null>(null)
const helpPanelRef = ref<HTMLElement | null>(null)
const languagePanelStyle = ref<Record<string, string>>({})
const helpPanelStyle = ref<Record<string, string>>({})

const availableLocales = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map(l => ({
    code: l.code,
    name: l.name,
  }))
)

const helpMenuItems = computed(() => [
  { key: 'terms', label: t('common.termsAndConditions') },
  { key: 'privacy', label: t('common.privacyPolicy') },
  { key: 'cookies', label: t('common.cookiesPolicy') },
  { key: 'bug', label: t('common.reportBug') },
])

function isActive(path: string) {
  if (path === '/dashboard') {
    return route.path.startsWith('/dashboard')
  }
  if (path === '/connections') {
    // Connections covers the flattened /connections page plus the rest of the
    // (still-nested) integrations area — publish flow, custom layouts, and the
    // legacy /integrations/* + /workspace redirects.
    return route.path === '/connections'
      || route.path.startsWith('/connections/')
      || route.path.startsWith('/integrations')
      || route.path.startsWith('/workspace')
  }
  if (path === '/files') {
    // The "Files" item covers the file browser + storage settings + custom
    // locations (and the legacy /storage/* custom pages). Credentials and Wallet
    // are now their own top-level nav items, so they must NOT light up Files —
    // they fall through to the exact/prefix match below.
    return route.path === '/files'
      || route.path.startsWith('/files/')
      || route.path.startsWith('/storage')
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}

function isMainNavItemActive(path: string): boolean {
  const p = route.path
  if (p === '/config' || p.startsWith('/config/')) return false
  return isActive(path)
}

// Derive the active workflow id from the path so the matching list row
// highlights on any /workflow/{id}/* sub-route.
const activeWorkflowId = computed(() => {
  const m = route.path.match(/^\/workflow\/([^/]+)/)
  return m?.[1]
})
const isWorkflowListItemActive = (id: string) => {
  return activeWorkflowId.value === id
}

// "New Workflow" — allocates (or reuses) the in-flight draft and opens
// /workflow/new, where the first prompt commits it into a real workflow with
// its own orchestrator. The draft never renders as a list row; this button is
// its only sidebar affordance.
async function createWorkflow() {
  const nextDraft = draft.value ?? await createDraft()
  if (!nextDraft) return
  clearPendingDraftFolder(nextDraft.id)
  await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
}

async function createWorkflowInFolder(folderId: string) {
  const pending = flowFolderClickTimers.get(folderId)
  if (pending) clearTimeout(pending)
  flowFolderClickTimers.delete(folderId)
  collapsedFlowFolders.value = { ...collapsedFlowFolders.value, [folderId]: false }
  const nextDraft = draft.value ?? await createDraft()
  if (!nextDraft) return
  setPendingDraftFolder(nextDraft.id, folderId)
  await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
}

// Highlights the "New Workflow" button while the user is on /workflow/new.
const isNewWorkflowActive = computed(() => activeWorkflowId.value === DRAFT_WORKFLOW_ID && !pendingDraftFolder.value)

function openWorkflow(id: string) {
  navigateTo(`/workflow/${id}`)
}

const activeDropdownIndex = ref<string | null>(null)
const hoveredWorkflowId = ref<string | null>(null)
const workflowTitleClickTimers = new Map<string, ReturnType<typeof setTimeout>>()

function handleWorkflowTitleClick(id: string) {
  const pending = workflowTitleClickTimers.get(id)
  if (pending) clearTimeout(pending)
  workflowTitleClickTimers.set(id, setTimeout(() => {
    workflowTitleClickTimers.delete(id)
    openWorkflow(id)
  }, 220))
}

function handleWorkflowTitleDoubleClick(id: string, title: string) {
  const pending = workflowTitleClickTimers.get(id)
  if (pending) clearTimeout(pending)
  workflowTitleClickTimers.delete(id)
  startRename(id, title)
}

onBeforeUnmount(() => {
  for (const timer of workflowTitleClickTimers.values()) clearTimeout(timer)
  workflowTitleClickTimers.clear()
})

// Workspace dropdown state
const isWorkspaceDropdownOpen = ref(false)
const isCreateWorkspaceOpen = ref(false)
const isManageMembersOpen = ref(false)
const workspaceDropdownRef = ref<{ dropdownRef: HTMLElement | null } | null>(null)

const otherWorkspaces = computed(() =>
  workspaces.value.filter(w => w.id !== currentWorkspace.value?.id),
)

const memberCountText = computed(() => {
  // Cache-aware count (live → localStorage-seeded → 0) so the sidebar shows the
  // last-known value immediately instead of flashing "0 members" before the
  // dropdown's members fetch resolves.
  const count = currentMemberCount.value
  return count === 1 ? t('workspaceMenu.memberCountOne') : t('workspaceMenu.memberCountMany', { n: count })
})

// Member data is only visible inside the workspace dropdown — defer the
// fetch to when the dropdown actually opens (handled by the
// isWorkspaceDropdownOpen watcher below) to avoid a blocking request
// during bootstrap.

watch(isWorkspaceDropdownOpen, async (open) => {
  if (open && currentWorkspaceId.value) {
    await fetchWorkspaceMembers(currentWorkspaceId.value)
  }
})


async function openWorkspaceSettings() {
  isWorkspaceDropdownOpen.value = false
  await navigateTo('/settings/workspace')
}

function openManageMembers() {
  isManageMembersOpen.value = true
  isWorkspaceDropdownOpen.value = false
}

function toggleWorkspaceDropdown() {
  isWorkspaceDropdownOpen.value = !isWorkspaceDropdownOpen.value
}

function closeWorkspaceDropdown() {
  isWorkspaceDropdownOpen.value = false
}

function canDeleteWorkflow(_id: string): boolean {
  // Every persisted workflow row is deletable — an empty list is a valid state
  // (workflows are created from the New Workflow entry point).
  return true
}

function requestDeleteWorkflow(id: string) {
  if (!canDeleteWorkflow(id)) return
  activeDropdownIndex.value = null
  void runDeleteWorkflow(id)
}

async function runDeleteWorkflow(id: string) {
  const wasActive = id === activeWorkflowId.value
  const idx = sessions.value.findIndex(s => s.id === id)
  const siblings = sessions.value.filter(s => s.id !== id)
  const fallback = siblings[Math.min(Math.max(idx, 0), siblings.length - 1)] ?? null

  await deleteSession(id)
  activeDropdownIndex.value = null

  if (sessions.value.length === 0) {
    // Deleted the last workflow — an empty list is fine. "New Workflow" is the
    // way back in, so send the user there (its onMounted re-creates the draft)
    // if they were viewing the row that just vanished.
    if (wasActive) await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
    return
  }
  if (wasActive && fallback) {
    await navigateTo(`/workflow/${fallback.id}`)
  }
}

const editingId = ref<string | null>(null)
const editingValue = ref('')

function canRenameWorkflow(_id: string): boolean {
  // Every persisted workflow row is renameable.
  return true
}

function startRename(id: string, title: string) {
  if (!canRenameWorkflow(id)) {
    activeDropdownIndex.value = null
    return
  }
  editingId.value = id
  editingValue.value = title
  activeDropdownIndex.value = null

  nextTick(() => {
    const input = document.querySelector('input[autofocus]') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function confirmRename(id: string) {
  if (editingValue.value.trim()) {
    await renameSession(id, editingValue.value.trim())
  }
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
  editingValue.value = ''
}

function closeDropdown() {
  activeDropdownIndex.value = null
}

function getDropdownPosition(id: string) {
  const trigger = document.querySelector(`.workflow-list-trigger[data-id="${id}"]`)
  if (!trigger) return { top: 0, left: 0 }
  const rect = trigger.getBoundingClientRect()
  return {
    top: rect.bottom,
    left: rect.left,
  }
}

const ROW_HEIGHT = 36 // pill row: py-1.5 (6+6) + 20px line-height (32px) + my-0.5 (2+2)
const PANEL_PADDING = 4 // py-1 = 4px
const LANGUAGE_PANEL_HEIGHT = 8 * ROW_HEIGHT + PANEL_PADDING * 2 // 296px
const HELP_PANEL_HEIGHT = 4 * ROW_HEIGHT + PANEL_PADDING * 2 // 152px

function positionSubmenu(
  triggerEl: HTMLElement,
  panelHeight: number,
  anchorRow?: number, // 0-based: align this row's centre with the trigger mid
): Record<string, string> {
  const rect = triggerEl.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  // if anchorRow given, offset so that row's centre aligns with midY
  const anchorOffset = anchorRow !== undefined
    ? PANEL_PADDING + anchorRow * ROW_HEIGHT + ROW_HEIGHT / 2
    : panelHeight / 2
  const rawTop = midY - anchorOffset
  // clamp so the panel stays within the viewport
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - panelHeight - 8))
  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${rect.right + 8}px`,
  }
}

function handleWorkspaceSwitch(id: string) {
  switchWorkspace(id)
  // Warm the new workspace's caches so its surfaces don't flash empty.
  void prefetchWorkspaceCache(id)
  isWorkspaceDropdownOpen.value = false
}

async function selectLocale(code: string) {
  void setLocale(code as typeof locale.value)
  // Keeping menus open as requested
}

function openLanguagePanel() {
  if (!languageBtnRef.value) return
  // anchor row 2 (third row, 0-based) aligns its centre with the Language trigger
  languagePanelStyle.value = positionSubmenu(languageBtnRef.value, LANGUAGE_PANEL_HEIGHT, 2)
  isLanguageOpen.value = true
  isHelpOpen.value = false
}

function openHelpPanel() {
  if (!helpBtnRef.value) return
  // anchor row 3 (last of 4 items, 0-based) aligns its text centre with the Help trigger
  helpPanelStyle.value = positionSubmenu(helpBtnRef.value, HELP_PANEL_HEIGHT, 3)
  isHelpOpen.value = true
  isLanguageOpen.value = false
}

function selectHelpItem(key: string) {
  if (key === 'privacy') {
    navigateTo('/privacy-policy')
  } else if (key === 'terms') {
    navigateTo('/terms-of-service')
  } else if (key === 'cookies') {
    navigateTo('/cookie-policy')
  } else if (key === 'bug') {
    isBugReportOpen.value = true
  }
  isHelpOpen.value = false
  closeProfileDropdown()
}

function closeProfileDropdown() {
  isProfileDropdownOpen.value = false
  isLanguageOpen.value = false
  isHelpOpen.value = false
}

function handleSettings() {
  closeProfileDropdown()
  void navigateTo('/settings/preferences')
}

function handleInstallApp() {
  closeProfileDropdown()
  navigateTo('/install-apps')
}

function handleUpgradePlan() {
  closeProfileDropdown()
  void navigateToPricing()
}

async function handleLogout() {
  const { signOut } = useSignOut()
  await signOut()
}

function handleClickOutside(event: MouseEvent) {
  if (activeFlowFolderMenuId.value) {
    const folderMenu = document.querySelector('.flow-folder-dropdown')
    const folderTrigger = document.querySelector('.flow-folder-menu-trigger')
    const inMenu = folderMenu?.contains(event.target as Node)
    const inTrigger = folderTrigger?.contains(event.target as Node)
    if (!inMenu && !inTrigger) activeFlowFolderMenuId.value = null
  }

  // Close workflow list dropdown
  const dropdown = document.querySelector('.workflow-list-dropdown')
  if (dropdown && !dropdown.contains(event.target as Node)) {
    const trigger = document.querySelector('.workflow-list-trigger')
    if (trigger && !trigger.contains(event.target as Node)) {
      closeDropdown()
    }
  }

  // Close chat list dropdown
  if (activeChatMenuId.value) {
    const chatMenu = document.querySelector('.chat-list-dropdown')
    const chatTrigger = document.querySelector('.chat-list-trigger')
    const inMenu = chatMenu?.contains(event.target as Node)
    const inTrigger = chatTrigger?.contains(event.target as Node)
    if (!inMenu && !inTrigger) activeChatMenuId.value = null
  }

  // Close workspace dropdown
  const dropdownEl = workspaceDropdownRef.value?.dropdownRef
  if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
    const workspaceTrigger = document.querySelector('.workspace-dropdown-trigger')
    if (workspaceTrigger && !workspaceTrigger.contains(event.target as Node)) {
      closeWorkspaceDropdown()
    }
  }

  // Close profile dropdown
  const profileDropdown = profileDropdownRef.value?.dropdownRef
  const isInsideProfile = profileDropdown && profileDropdown.contains(event.target as Node)
  const isInsideLanguage = languagePanelRef.value && languagePanelRef.value.contains(event.target as Node)
  const isInsideHelp = helpPanelRef.value && helpPanelRef.value.contains(event.target as Node)
  const isInsideTrigger = document.querySelector('.profile-trigger')?.contains(event.target as Node)

  if (!isInsideProfile && !isInsideLanguage && !isInsideHelp && !isInsideTrigger) {
    closeProfileDropdown()
  }
}

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<template>
  <!-- Right padding (pr-1, 4px) is reduced so that left padding (pl-2, 8px) =
       right padding (4px) + the content card's left gap (lg:ml-1, 4px) — the
       sidebar content sits symmetrically within the visible gutters. -->
  <aside class="group/side flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden bg-neutral-100 py-2 pl-2 pr-1 lg:w-[var(--sidebar-w)]"
    :aria-label="t('nav.mainSidebar')">
    <!-- Logo & CTA -->
    <div class="shrink-0 space-y-4">
      <div class="relative">
        <!-- Workspace row: [avatar + name] switcher button + an always-visible
             collapse («) button, like the PostHog nav header. -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="workspace-dropdown-trigger group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 pr-2 transition-colors"
            :class="isWorkspaceDropdownOpen ? 'bg-neutral-300/60' : 'hover:bg-neutral-300/60'"
            @click="toggleWorkspaceDropdown"
          >
            <!-- Logo Icon — 20px (small, thin row, PostHog-style) -->
            <div v-if="currentWorkspace?.avatar_url" class="h-[20px] w-[20px] shrink-0 overflow-hidden rounded-md">
              <img :src="currentWorkspace.avatar_url" alt="" class="h-full w-full object-cover" />
            </div>
            <AccountIcon v-else :initials="currentWorkspace?.name?.trim().charAt(0).toUpperCase() || 'W'" size-class="h-[20px] w-[20px] text-[10px]" />
            <span class="min-w-0 flex-1 truncate text-left text-[14px] font-semibold leading-tight text-neutral-950">{{ currentWorkspaceDisplayName || currentWorkspace?.name || t('common.loading') }}</span>
          </button>
          <!-- Collapse the sidebar — its own button, always visible. -->
          <button
            type="button"
            class="flex size-[28px] shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-300/60 hover:text-neutral-900"
            :aria-label="t('nav.toggleSidebar')"
            @click="toggleSidebar"
          >
            <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m11 17-5-5 5-5" />
              <path d="m18 17-5-5 5-5" />
            </svg>
          </button>
        </div>

        <!-- Workspace Dropdown -->
        <Menu v-if="isWorkspaceDropdownOpen" ref="workspaceDropdownRef" :open="isWorkspaceDropdownOpen" width="w-full" inset>
          <!-- Current workspace header -->
          <div class="min-w-0 px-3 pb-2 pt-2">
            <p class="truncate text-sm font-semibold text-neutral-950">
              {{ currentWorkspace?.name || t('common.workspace') }}
            </p>
            <p class="truncate text-[11px] text-neutral-500">
              {{ userPlan }} · {{ memberCountText }}
            </p>
          </div>
          <div class="my-0.5 mx-2 h-px bg-neutral-200" />

          <!-- Settings -->
          <MenuItem :text="t('common.settings')" @click="openWorkspaceSettings">
            <template #icon>
              <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </template>
          </MenuItem>

          <!-- Manage members (icon mirrors FileBrowser's "Manage access") -->
          <MenuItem :text="t('workspaceMenu.manageMembers')" @click="openManageMembers">
            <template #icon>
              <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </template>
          </MenuItem>

          <!-- Other workspaces (only when there are any) -->
          <template v-if="otherWorkspaces.length > 0">
            <div class="my-0.5 mx-2 h-px bg-neutral-200" />
            <p class="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {{ t('workspaceMenu.otherWorkspaces') }}
            </p>
            <MenuItem
              v-for="ws in otherWorkspaces"
              :key="ws.id"
              :text="ws.name"
              @click="handleWorkspaceSwitch(ws.id)"
            >
              <template #icon>
                <div v-if="ws.avatar_url" class="h-4 w-4 shrink-0 overflow-hidden rounded-md">
                  <img :src="ws.avatar_url" alt="" class="h-full w-full object-cover" />
                </div>
                <AccountIcon v-else :initials="ws.name.trim().charAt(0).toUpperCase()" size="sm" color="bg-neutral-800" />
              </template>
            </MenuItem>
          </template>

          <MenuItem
            :text="t('nav.addWorkspace')"
            @click="isCreateWorkspaceOpen = true; isWorkspaceDropdownOpen = false"
          >
            <template #icon>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </template>
          </MenuItem>
        </Menu>
      </div>
    </div>

    <!-- Build / Chat switch — Build shows the tool/integration/workflow nav,
         Chat shows the general-assistant conversation list. -->
    <div class="mt-3 shrink-0">
      <div role="tablist" class="flex items-center gap-1 rounded-lg bg-neutral-300/70 p-1">
        <button type="button" role="tab" :aria-selected="activeTab === 'browse'" @click="selectBrowseTab"
          class="flex w-1/2 items-center justify-center gap-1 rounded-md py-0.5 text-meta font-medium transition-colors"
          :class="activeTab === 'browse' ? 'bg-white text-neutral-950' : 'text-neutral-500 hover:text-neutral-800'">
          <!-- Browse: three-square grid + magnifier (PostHog-style browse glyph) -->
          <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M10.25 3.75H11a.75.75 0 0 0-.75-.75v.75Zm0 6.5V11a.75.75 0 0 0 .75-.75h-.75Zm-6.5 0H3c0 .414.336.75.75.75v-.75Zm.546-6.391.34.668-.34-.668Zm-.437.437.668.34-.668-.34Zm9.891-.546V3a.75.75 0 0 0-.75.75h.75Zm6.5 6.5V11a.75.75 0 0 0 .75-.75h-.75Zm-6.5 0H13c0 .414.336.75.75.75v-.75Zm5.954-6.391-.34.668.34-.668Zm.437.437-.668.34.668-.34ZM3.75 13.75V13a.75.75 0 0 0-.75.75h.75Zm6.5 0H11a.75.75 0 0 0-.75-.75v.75Zm0 6.5V21a.75.75 0 0 0 .75-.75h-.75Zm-5.954-.109.34-.668-.34.668Zm-.437-.437.668-.34-.668.34Zm16.74 1.955a.75.75 0 0 0 1.06-1.06l-1.06 1.06Zm-1.297-2.357-.531-.53.531.53ZM5.35 4.5h4.9V3h-4.9v1.5Zm4.15-.75v6.5H11v-6.5H9.5Zm.75 5.75h-6.5V11h6.5V9.5Zm-5.75.75v-4.9H3v4.9h1.5ZM5.35 3c-.268 0-.513 0-.718.016a1.774 1.774 0 0 0-.676.175l.68 1.336c-.016.009-.002-.006.118-.016.13-.01.304-.011.596-.011V3ZM4.5 5.35c0-.292 0-.467.011-.596.01-.12.025-.134.016-.117l-1.336-.681a1.77 1.77 0 0 0-.175.676C3 4.837 3 5.082 3 5.35h1.5Zm-.544-2.16a1.75 1.75 0 0 0-.765.766l1.336.68a.25.25 0 0 1 .11-.109l-.681-1.336ZM13.75 4.5h4.9V3h-4.9v1.5Zm5.75.85v4.9H21v-4.9h-1.5Zm.75 4.15h-6.5V11h6.5V9.5Zm-5.75.75v-6.5H13v6.5h1.5Zm4.15-5.75c.292 0 .467 0 .596.011.12.01.134.025.117.016l.681-1.336a1.774 1.774 0 0 0-.676-.175C19.164 3 18.918 3 18.65 3v1.5Zm2.35.85c0-.268 0-.513-.016-.718a1.775 1.775 0 0 0-.175-.676l-1.336.68c-.009-.016.006-.002.016.118.01.13.011.304.011.596H21Zm-1.637-.823a.25.25 0 0 1 .11.11l1.336-.681a1.75 1.75 0 0 0-.765-.765l-.68 1.336ZM3.75 14.5h6.5V13h-6.5v1.5Zm5.75-.75v6.5H11v-6.5H9.5Zm.75 5.75h-4.9V21h4.9v-1.5Zm-5.75-.85v-4.9H3v4.9h1.5Zm.85.85c-.292 0-.467 0-.596-.011-.12-.01-.134-.025-.117-.016l-.681 1.336c.23.118.463.157.676.175.205.017.45.016.718.016v-1.5ZM3 18.65c0 .268 0 .514.016.718.018.213.057.446.175.677l1.336-.682c.009.017-.006.003-.016-.117a8.337 8.337 0 0 1-.011-.596H3Zm1.636.823a.25.25 0 0 1-.109-.11l-1.336.681c.168.33.435.598.765.765l.68-1.336ZM17 19.508a2.5 2.5 0 0 1-2.5-2.5H13a4 4 0 0 0 4 4v-1.5Zm-2.5-2.5a2.5 2.5 0 0 1 2.5-2.5v-1.5a4 4 0 0 0-4 4h1.5Zm2.5-2.5a2.5 2.5 0 0 1 2.5 2.5H21a4 4 0 0 0-4-4v1.5Zm1.772 5.324 1.826 1.827 1.061-1.06-1.827-1.827-1.06 1.06Zm.728-2.824a2.49 2.49 0 0 1-.73 1.765l1.063 1.058A3.99 3.99 0 0 0 21 17.008h-1.5Zm-.73 1.765a2.49 2.49 0 0 1-1.77.735v1.5a3.99 3.99 0 0 0 2.833-1.177l-1.062-1.058Z" />
          </svg>
          <span>{{ t('sidebar.browse') }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'chat'" @click="selectChatTab"
          class="flex w-1/2 items-center justify-center gap-1 rounded-md py-0.5 text-meta font-medium transition-colors"
          :class="activeTab === 'chat' ? 'bg-white text-neutral-950' : 'text-neutral-500 hover:text-neutral-800'">
          <!-- Chat: speech bubble -->
          <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{{ t('sidebar.chat') }}</span>
        </button>
      </div>
    </div>

    <!-- Navigation (scrollable) · Build tab -->
    <nav v-show="activeTab === 'browse'" class="mt-3 flex-1 flex flex-col min-h-0 overflow-hidden" :aria-label="t('nav.main')">
      <!-- Tools — New Workflow, Search, Schedule (no section heading) -->
      <div class="shrink-0">
        <ul class="flex flex-col gap-0">
        <!-- New Workflow — opens /workflow/new (draft → the first prompt commits
             it into a real workflow with its own orchestrator). -->
        <li>
          <button type="button" @click="createWorkflow"
            class="relative flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="(!isSearchOpen && isNewWorkflowActive) ? 'bg-neutral-300' : 'hover:bg-neutral-300/60'">
            <!-- New Workflow: square + pencil (edit pad) -->
            <svg class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
            </svg>
            <span>{{ t('nav.newWorkflow') }}</span>
          </button>
        </li>

        <!-- Search - Between Dashboard and Workspace -->
        <li>
          <button type="button" @click="isSearchOpen = true"
            class="relative flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="isSearchOpen ? 'bg-neutral-300' : 'hover:bg-neutral-300/60'">
            <svg class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>{{ t('common.search') }}</span>
          </button>
        </li>

        <!-- Schedule — workspace overview of scheduled workflows. -->
        <li>
          <NuxtLink to="/schedule"
            class="relative flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="(!isSearchOpen && isMainNavItemActive('/schedule')) ? 'bg-neutral-300' : 'hover:bg-neutral-300/60'">
            <!-- Schedule: calendar -->
            <svg class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span>{{ t('workflow.tabs.schedule') }}</span>
          </NuxtLink>
        </li>

        <!-- Connections / Files / Credentials / Wallet — merged into the main
             Tools list (no separate "Integrations" heading or collapse). -->
        <li v-for="item in navItems" :key="item.key">
          <NuxtLink :to="item.to"
            class="relative flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="(!isSearchOpen && isMainNavItemActive(item.to))
              ? 'bg-neutral-300'
              : 'hover:bg-neutral-300/60'
              ">
            <!-- Connections: link/chain (stroke-width 2 to match the other nav glyphs) -->
            <svg v-if="item.key === 'integrations'" class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <!-- Files: folder -->
            <svg v-else-if="item.key === 'files'" class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <!-- Credentials: key -->
            <svg v-else-if="item.key === 'credentials'" class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>
            <!-- Wallet: wallet -->
            <svg v-else-if="item.key === 'wallet'" class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
            <span>
              {{ item.label }}
            </span>
          </NuxtLink>
        </li>
        </ul>
      </div>

      <!-- Workflows (collapsible — click the header to toggle, chevron on the
           right rotates). Unlike a fixed list, the body is a bounded flex-1
           scroll area, so it toggles via v-show (the section drops to shrink-0
           when collapsed) rather than a content-height grid animation. -->
      <div class="mt-3 flex flex-col relative" :class="workflowsCollapsed ? 'shrink-0' : 'min-h-0 flex-1'">
        <div class="mb-2 flex w-full shrink-0 items-center pl-2.5 pr-2 text-meta font-semibold uppercase tracking-wide text-neutral-500">
          <button type="button" class="min-w-0 flex-1 text-left outline-none transition-colors hover:text-neutral-700" @click="workflowsCollapsed = !workflowsCollapsed">
            {{ t('nav.workflows') }}
          </button>
          <button type="button" class="flex size-4 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
            :title="t('storage.newFolder')" @click="startCreateFlowFolder">
            <UIcon name="i-heroicons-folder-plus" class="size-3.5" />
          </button>
          <button type="button" class="group/sec flex size-4 items-center justify-center outline-none" :aria-expanded="!workflowsCollapsed"
            :aria-label="t('nav.workflows')" @click="workflowsCollapsed = !workflowsCollapsed">
            <svg class="relative top-px size-3.5 shrink-0 text-neutral-400 transition-transform duration-200 group-hover/sec:text-neutral-600"
              :class="workflowsCollapsed ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        <div v-show="!workflowsCollapsed" class="relative flex min-h-0 flex-1 flex-col">

        <ul v-if="creatingFlowFolder || emptyFlowFolders.length" class="flex shrink-0 flex-col gap-0.5" :class="creatingFlowFolder ? 'pb-0.5' : ''">
          <li v-if="creatingFlowFolder" class="flex h-[28px] items-center gap-1 rounded-md pl-1 pr-2 text-nav text-neutral-950">
            <FlowFolderIcon :open="true" />
            <input v-model="newFlowFolderName" data-new-flow-folder type="text" :placeholder="t('storage.folderName')"
              class="min-w-0 flex-1 bg-transparent outline-none" @keydown.enter.prevent="confirmCreateFlowFolder" @keyup.esc="creatingFlowFolder = false" @blur="confirmCreateFlowFolder">
          </li>
          <li v-for="folder in emptyFlowFolders" :key="folder.id" class="group/folder relative"
            :class="draggingFlowFolderId === folder.id ? 'opacity-50' : ''"
            @dragover.prevent="updateFlowFolderDropIndicator($event, folder.id)" @drop.prevent.stop="dropFlowFolder($event, folder.id)">
            <span v-if="flowFolderDropIndicator?.id === folder.id" class="pointer-events-none absolute left-1 right-1 z-10 h-0.5 bg-neutral-950"
              :class="flowFolderDropIndicator.edge === 'before' ? 'top-0' : 'bottom-0'" />
            <div v-if="editingFlowFolderId !== folder.id" class="relative">
              <button type="button" draggable="true"
                class="flow-folder-drag-handle flex h-[28px] w-full cursor-grab items-center gap-1 rounded-md pl-1 pr-[40px] text-left text-nav font-normal text-neutral-950 transition-colors hover:bg-neutral-300/60 active:cursor-grabbing"
                :class="pendingDraftFolder?.folderId === folder.id ? 'bg-neutral-300' : ''"
                @dragstart.stop="startFlowFolderDrag($event, folder.id)" @dragend="endFlowFolderDrag"
                @click="handleFlowFolderClick(folder.id)" @dblclick.stop.prevent="handleFlowFolderDoubleClick(folder.id, folder.name)">
                <FlowFolderIcon :open="!collapsedFlowFolders[folder.id]" />
                <span class="flex h-[20px] min-w-0 items-center gap-1">
                  <span class="min-w-0 truncate leading-[20px]">{{ folder.name }}</span>
                  <svg class="relative top-px size-3.5 shrink-0 self-center text-neutral-400 transition-transform duration-200"
                    :class="collapsedFlowFolders[folder.id] ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1" />
              </button>
              <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 transition-opacity"
                :class="activeFlowFolderMenuId === folder.id ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100 focus-within:opacity-100'">
                <button type="button" class="flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                  :title="`${t('nav.newWorkflow')} · ${folder.name}`" :aria-label="`${t('nav.newWorkflow')} · ${folder.name}`"
                  @click.stop="createWorkflowInFolder(folder.id)" @dblclick.stop>
                  <svg class="size-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                  </svg>
                </button>
                <button type="button" class="flow-folder-menu-trigger flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                  :data-id="folder.id" :aria-label="`More actions · ${folder.name}`" @click.stop="toggleFlowFolderMenu(folder.id)" @dblclick.stop>
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" />
                  </svg>
                </button>
              </div>
              <Teleport to="body">
                <div v-if="activeFlowFolderMenuId === folder.id" class="flow-folder-dropdown fixed z-9999 w-36 overflow-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200"
                  :style="{ top: `${getFlowFolderMenuPosition(folder.id).top}px`, left: `${getFlowFolderMenuPosition(folder.id).left}px` }">
                  <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-200" @click.stop="startRenameFlowFolder(folder.id, folder.name)">{{ t('common.rename') }}</button>
                  <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-red-600 hover:bg-red-50" @click.stop="deleteFlowFolder(folder.id)">{{ t('common.delete') }}</button>
                </div>
              </Teleport>
            </div>
            <div v-else class="flex h-[28px] items-center gap-1 pl-1 pr-2 text-nav">
              <FlowFolderIcon :open="true" />
              <input v-model="editingFlowFolderName" :data-flow-folder-rename="folder.id" class="min-w-0 flex-1 bg-transparent outline-none"
                @keyup.enter="confirmRenameFlowFolder(folder.id)" @keyup.esc="editingFlowFolderId = null" @blur="confirmRenameFlowFolder(folder.id)">
            </div>
          </li>
        </ul>

        <!-- Skeleton rows while bootstrapping with no cached data yet -->
        <ul v-if="bootstrapping && !realSessions.length" class="flex flex-col gap-0.5 flex-1 overflow-hidden pb-4" aria-busy="true">
          <li v-for="n in 5" :key="n" class="flex items-center rounded-md py-1 pl-2.5 pr-2">
            <span class="h-3.5 rounded bg-neutral-200 animate-pulse" :style="{ width: `${50 + (n * 13) % 40}%` }" />
          </li>
        </ul>

        <TransitionGroup
          v-else
          v-draggable="[displaySessions, draggableOptions]"
          tag="ul"
          name="wf"
          :move-class="isDropping || suppressFolderToggleListMoveAnimation ? 'wf-move-static' : 'wf-move'"
          class="flex flex-col gap-0.5 flex-1 overflow-y-auto scrollbar-hide relative pb-4"
          :class="suppressFlowFolderCommitAnimation ? 'wf-folder-commit-static' : ''"
        >
          <li
            v-for="(session, sessionIndex) in displaySessions"
            :key="session.id"
            class="relative wf-item"
            :class="[session.flow_folder_placeholder_id ? 'wf-folder-placeholder' : '', session.flow_unfiled_placeholder ? 'wf-unfiled-placeholder' : '']"
            :data-flow-folder-scope="flowFolderScope(session)"
            :data-workflow-id="session.flow_folder_placeholder_id || session.flow_unfiled_placeholder ? undefined : session.id"
          >
            <template v-if="session.flow_unfiled_placeholder">
              <div class="overflow-hidden transition-[height,opacity] duration-150"
                :class="isDragging ? 'h-[28px] opacity-100' : 'h-0 opacity-0'">
                <div class="flex h-[28px] items-center rounded-md border border-dashed border-neutral-300 pl-2.5 text-meta text-neutral-400">
                  {{ t('nav.noFolder') }}
                </div>
              </div>
            </template>
            <template v-else-if="placeholderFolder(session)">
              <div v-if="editingFlowFolderId !== placeholderFolder(session)!.id"
                class="group/folder relative" :class="draggingFlowFolderId === placeholderFolder(session)!.id ? 'opacity-50' : ''"
                @dragover.prevent="updateFlowFolderDropIndicator($event, placeholderFolder(session)!.id)"
                @drop.prevent.stop="dropFlowFolder($event, placeholderFolder(session)!.id)">
                <span v-if="flowFolderDropIndicator?.id === placeholderFolder(session)!.id"
                  class="pointer-events-none absolute left-1 right-1 z-10 h-0.5 bg-neutral-950"
                  :class="flowFolderDropIndicator.edge === 'before' ? 'top-0' : 'bottom-0'" />
                <button type="button" draggable="true"
                  class="flow-folder-drag-handle flex h-[28px] w-full cursor-grab items-center gap-1 rounded-md pl-1 pr-[40px] text-left text-nav font-normal text-neutral-950 transition-colors hover:bg-neutral-300/60 active:cursor-grabbing"
                  :class="pendingDraftFolder?.folderId === placeholderFolder(session)!.id ? 'bg-neutral-300' : ''"
                  @dragstart.stop="startFlowFolderDrag($event, placeholderFolder(session)!.id)" @dragend="endFlowFolderDrag"
                  @click="handleFlowFolderClick(placeholderFolder(session)!.id)"
                  @dblclick.stop.prevent="handleFlowFolderDoubleClick(placeholderFolder(session)!.id, placeholderFolder(session)!.name)">
                  <FlowFolderIcon :open="!collapsedFlowFolders[placeholderFolder(session)!.id]" />
                  <span class="flex h-[20px] min-w-0 items-center gap-1">
                    <span class="min-w-0 truncate leading-[20px]">{{ placeholderFolder(session)!.name }}</span>
                    <svg class="relative top-px size-3.5 shrink-0 self-center text-neutral-400 transition-transform duration-200"
                      :class="collapsedFlowFolders[placeholderFolder(session)!.id] ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                  <span class="min-w-0 flex-1" />
                </button>
                <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 transition-opacity"
                  :class="activeFlowFolderMenuId === placeholderFolder(session)!.id ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100 focus-within:opacity-100'">
                  <button type="button" class="flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                    :title="`${t('nav.newWorkflow')} · ${placeholderFolder(session)!.name}`" :aria-label="`${t('nav.newWorkflow')} · ${placeholderFolder(session)!.name}`"
                    @click.stop="createWorkflowInFolder(placeholderFolder(session)!.id)" @dblclick.stop>
                    <svg class="size-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                    </svg>
                  </button>
                  <button type="button" class="flow-folder-menu-trigger flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                    :data-id="placeholderFolder(session)!.id" :aria-label="`More actions · ${placeholderFolder(session)!.name}`"
                    @click.stop="toggleFlowFolderMenu(placeholderFolder(session)!.id)" @dblclick.stop>
                    <svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" />
                    </svg>
                  </button>
                </div>
                <Teleport to="body">
                  <div v-if="activeFlowFolderMenuId === placeholderFolder(session)!.id"
                    class="flow-folder-dropdown fixed z-9999 w-36 overflow-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200"
                    :style="{ top: `${getFlowFolderMenuPosition(placeholderFolder(session)!.id).top}px`, left: `${getFlowFolderMenuPosition(placeholderFolder(session)!.id).left}px` }">
                    <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-200"
                      @click.stop="startRenameFlowFolder(placeholderFolder(session)!.id, placeholderFolder(session)!.name)">{{ t('common.rename') }}</button>
                    <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-red-600 hover:bg-red-50"
                      @click.stop="deleteFlowFolder(placeholderFolder(session)!.id)">{{ t('common.delete') }}</button>
                  </div>
                </Teleport>
              </div>
              <div v-else class="flex h-[28px] items-center gap-1 pl-1 pr-2 text-nav">
                <FlowFolderIcon :open="true" />
                <input v-model="editingFlowFolderName" :data-flow-folder-rename="placeholderFolder(session)!.id" class="min-w-0 flex-1 bg-transparent outline-none"
                  @keyup.enter="confirmRenameFlowFolder(placeholderFolder(session)!.id)" @keyup.esc="editingFlowFolderId = null"
                  @blur="confirmRenameFlowFolder(placeholderFolder(session)!.id)">
              </div>
            </template>
            <template v-else>
            <div v-if="folderForFlow(session.id) && isFirstFlowInFolder(session, sessionIndex) && editingFlowFolderId !== folderForFlow(session.id)!.id"
              class="group/folder relative" :class="draggingFlowFolderId === folderForFlow(session.id)!.id ? 'opacity-50' : ''"
              @dragover.prevent="updateFlowFolderDropIndicator($event, folderForFlow(session.id)!.id)" @drop.prevent.stop="dropFlowFolder($event, folderForFlow(session.id)!.id)">
              <span v-if="flowFolderDropIndicator?.id === folderForFlow(session.id)!.id" class="pointer-events-none absolute left-1 right-1 z-10 h-0.5 bg-neutral-950"
                :class="flowFolderDropIndicator.edge === 'before' ? 'top-0' : 'bottom-0'" />
              <button type="button" draggable="true" class="flow-folder-drag-handle flex h-[28px] w-full cursor-grab items-center gap-1 rounded-md pl-1 pr-[40px] text-left text-nav font-normal text-neutral-950 transition-colors hover:bg-neutral-300/60 active:cursor-grabbing"
                :class="pendingDraftFolder?.folderId === folderForFlow(session.id)!.id ? 'bg-neutral-300' : ''"
                @dragstart.stop="startFlowFolderDrag($event, folderForFlow(session.id)!.id)" @dragend="endFlowFolderDrag"
                @click="handleFlowFolderClick(folderForFlow(session.id)!.id)" @dblclick.stop.prevent="handleFlowFolderDoubleClick(folderForFlow(session.id)!.id, folderForFlow(session.id)!.name)">
                <FlowFolderIcon :open="!collapsedFlowFolders[folderForFlow(session.id)!.id]" />
                <span class="flex h-[20px] min-w-0 items-center gap-1">
                  <span class="min-w-0 truncate leading-[20px]">{{ folderForFlow(session.id)!.name }}</span>
                  <svg class="relative top-px size-3.5 shrink-0 self-center text-neutral-400 transition-transform duration-200"
                    :class="collapsedFlowFolders[folderForFlow(session.id)!.id] ? '-rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1" />
              </button>
              <div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 transition-opacity"
                :class="activeFlowFolderMenuId === folderForFlow(session.id)!.id ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100 focus-within:opacity-100'">
                <button type="button" class="flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                  :title="`${t('nav.newWorkflow')} · ${folderForFlow(session.id)!.name}`" :aria-label="`${t('nav.newWorkflow')} · ${folderForFlow(session.id)!.name}`"
                  @click.stop="createWorkflowInFolder(folderForFlow(session.id)!.id)" @dblclick.stop>
                  <svg class="size-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                  </svg>
                </button>
                <button type="button" class="flow-folder-menu-trigger flex h-[20px] w-[16px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-950"
                  :data-id="folderForFlow(session.id)!.id" :aria-label="`More actions · ${folderForFlow(session.id)!.name}`" @click.stop="toggleFlowFolderMenu(folderForFlow(session.id)!.id)" @dblclick.stop>
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" />
                  </svg>
                </button>
              </div>
              <Teleport to="body">
                <div v-if="activeFlowFolderMenuId === folderForFlow(session.id)!.id" class="flow-folder-dropdown fixed z-9999 w-36 overflow-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200"
                  :style="{ top: `${getFlowFolderMenuPosition(folderForFlow(session.id)!.id).top}px`, left: `${getFlowFolderMenuPosition(folderForFlow(session.id)!.id).left}px` }">
                  <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-200" @click.stop="startRenameFlowFolder(folderForFlow(session.id)!.id, folderForFlow(session.id)!.name)">{{ t('common.rename') }}</button>
                  <button type="button" class="flex w-full items-center px-2.5 py-1.5 text-nav text-red-600 hover:bg-red-50" @click.stop="deleteFlowFolder(folderForFlow(session.id)!.id)">{{ t('common.delete') }}</button>
                </div>
              </Teleport>
            </div>
            <div v-else-if="folderForFlow(session.id) && isFirstFlowInFolder(session, sessionIndex)" class="flex h-[28px] items-center gap-1 pl-1 pr-2 text-nav">
              <FlowFolderIcon :open="true" />
              <input v-model="editingFlowFolderName" :data-flow-folder-rename="folderForFlow(session.id)!.id" class="min-w-0 flex-1 bg-transparent outline-none"
                @keyup.enter="confirmRenameFlowFolder(folderForFlow(session.id)!.id)" @keyup.esc="editingFlowFolderId = null" @blur="confirmRenameFlowFolder(folderForFlow(session.id)!.id)">
            </div>
            <Transition name="folder-flow">
            <div v-if="editingId !== session.id && (!folderForFlow(session.id) || !collapsedFlowFolders[folderForFlow(session.id)!.id])" :key="session.id"
              :style="folderFlowTransitionStyle(session.id)" :data-testid="`wf-row-${session.id}`" @click="openWorkflow(session.id)"
              @mouseenter="hoveredWorkflowId = session.id"
              @mouseleave="hoveredWorkflowId = null"
              class="relative flex h-[30px] w-full cursor-pointer items-center rounded-md pr-2 text-left text-nav text-neutral-950 outline-none"
              :class="[folderForFlow(session.id) ? 'pl-[36px]' : 'pl-2.5', isWorkflowListItemActive(session.id) ? 'bg-neutral-300' : (isDragging ? '' : 'hover:bg-neutral-300/60')]">
              <span
                class="min-w-0 flex-1 truncate"
                :title="session.title"
                @click.stop="handleWorkflowTitleClick(session.id)"
                @dblclick.stop.prevent="handleWorkflowTitleDoubleClick(session.id, session.title)"
              >{{ session.title }}</span>
              <div
                class="shrink-0 overflow-hidden"
                :class="(!isDragging && (hoveredWorkflowId === session.id || activeDropdownIndex === session.id || session.is_running)) ? 'w-[16px] ml-1.5' : 'w-0'"
                @click.stop
              >
                <!-- Running indicator: shown only when the row isn't being
                     hovered and its menu isn't open, so the three-dot trigger
                     can take over the slot the moment the user moves a cursor
                     over the row (preserving the existing menu interaction).
                     Two visual modes — they are NOT cosmetic variants of the
                     same state, they signal which engine is driving the row:
                       - `running_kind === 'workflow'` → progress arc. The
                         workflow_run engine is executing the persisted node
                         graph (dock Run or scheduled cron). The definition
                         is read-only for the duration of the run.
                       - `running_kind === 'chat'` (default for any other
                         is_running case) → spinner. Orchestrator/agent
                         activity in service of a chat turn — including
                         background orchestrator-spawned agents on workflows
                         the user is no longer focused on. The workflow
                         definition may be mutating right now.
                     The progress arc is the OPT-IN mode: only render it when
                     the server (or focused-workflow override) explicitly
                     reports 'workflow'. Defaulting unknown is_running rows
                     to the progress arc misrepresents background chat-driven
                     activity as scheduled/run-from-node executions, which is
                     the bug this comment intentionally guards against. See
                     `runningKind` in pages/workflow/[id].vue and
                     Session.RunningKind in the Go server for the
                     authoritative mapping. -->

                <span
                  v-if="session.is_running && !isDragging && hoveredWorkflowId !== session.id && activeDropdownIndex !== session.id"
                  class="flex size-[16px] shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <svg
                    v-if="session.running_kind === 'workflow'"
                    class="size-[14px] -rotate-90"
                    viewBox="0 0 16 16"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      fill="none"
                      stroke="var(--color-gold)"
                      stroke-opacity="0.25"
                      stroke-width="2"
                    />
                    <circle
                      class="wf-progress-arc"
                      cx="8"
                      cy="8"
                      r="6"
                      fill="none"
                      stroke="var(--color-gold)"
                      stroke-width="2"
                      stroke-linecap="butt"
                      pathLength="100"
                      stroke-dasharray="100 100"
                    />
                  </svg>
                  <span
                    v-else
                    class="size-[14px] animate-spin rounded-full border-2 border-gold/25 border-t-gold"
                  />
                </span>
                <svg
                  v-else
                  @click="activeDropdownIndex = activeDropdownIndex === session.id ? null : session.id"
                  class="workflow-list-trigger size-[16px] text-neutral-400 cursor-pointer hover:text-neutral-950"
                  :data-id="session.id"
                  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>

                <Teleport to="body">
                  <div v-if="activeDropdownIndex === session.id"
                    class="fixed z-9999 mt-1 w-44 rounded-md bg-white shadow-lg ring-1 ring-neutral-200 overflow-hidden workflow-list-dropdown"
                    :style="{ top: getDropdownPosition(session.id).top + 'px', left: getDropdownPosition(session.id).left + 'px' }">
                  <button @click.stop
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200 cursor-pointer">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    {{ t('common.share') }}
                  </button>
                  <button @click.stop="startRename(session.id, session.title)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200 cursor-pointer">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {{ t('common.rename') }}
                  </button>
                  <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
                  <div class="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-neutral-400">{{ t('nav.moveToFolder') }}</div>
                  <button v-for="folder in flowFolders" :key="folder.id" type="button" @click.stop="moveFlowToFolder(session.id, folder.id)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200">
                    <UIcon name="i-heroicons-check" class="size-3" :class="flowFolderAssignments[session.id] === folder.id ? 'opacity-100' : 'opacity-0'" />
                    <span class="min-w-0 flex-1 truncate text-left">{{ folder.name }}</span>
                  </button>
                  <button type="button" @click.stop="moveFlowToFolder(session.id, null)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200">
                    <UIcon name="i-heroicons-check" class="size-3" :class="!flowFolderAssignments[session.id] ? 'opacity-100' : 'opacity-0'" />
                    {{ t('nav.noFolder') }}
                  </button>
                  <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
                  <button @click.stop="requestDeleteWorkflow(session.id)"
                    :disabled="!canDeleteWorkflow(session.id)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav transition-colors"
                    :class="canDeleteWorkflow(session.id)
                      ? 'text-red-600 hover:bg-red-50 cursor-pointer'
                      : 'text-neutral-300 cursor-not-allowed'">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    {{ t('common.delete') }}
                  </button>
                  </div>
                </Teleport>
              </div>
            </div>

            <div v-else-if="!folderForFlow(session.id) || !collapsedFlowFolders[folderForFlow(session.id)!.id]" :key="session.id"
              :style="folderFlowTransitionStyle(session.id)"
              class="group relative flex h-[30px] w-full items-center justify-between rounded-md pr-2 text-left text-nav text-neutral-950"
              :class="folderForFlow(session.id) ? 'pl-[36px]' : 'pl-2.5'">
              <input v-model="editingValue" @keyup.enter="confirmRename(session.id)" @keyup.esc="cancelRename"
                @blur="confirmRename(session.id)" type="text" name="session-rename"
                class="m-0 h-full min-w-0 flex-1 border-0 bg-transparent py-0 leading-normal outline-none"
                autofocus />
            </div>
            </Transition>
            </template>
          </li>
        </TransitionGroup>
        <div
          class="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-100 to-transparent pointer-events-none z-10">
        </div>
        </div>
      </div>
    </nav>

    <!-- Chat tab — general-assistant conversation list. -->
    <div v-show="activeTab === 'chat'" class="mt-3 flex flex-1 flex-col min-h-0 overflow-hidden">
      <!-- New Chat — mirrors the Browse tab's New Workflow row. -->
      <div class="shrink-0 pb-2">
        <button type="button" @click="onNewChat"
          class="relative flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none hover:bg-neutral-300/60">
          <svg class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h9" />
            <path d="M19 3v6M16 6h6" />
          </svg>
          <span>{{ t('chats.newChat') }}</span>
        </button>

        <div
          class="relative mt-0.5 flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 transition-colors outline-none focus-within:bg-neutral-300/60 hover:bg-neutral-300/60"
        >
          <svg class="w-[28px] h-[20px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input v-model="chatSearch" type="search" :aria-label="t('chats.searchPlaceholder')" :placeholder="t('chats.searchPlaceholder')"
            class="chat-search-input m-0 h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-nav text-neutral-950 outline-none placeholder:text-neutral-500">
          <button
            v-if="chatSearch"
            type="button"
            :aria-label="t('notifications.clear')"
            class="flex size-[20px] shrink-0 items-center justify-center rounded-sm text-neutral-950 transition-colors hover:bg-neutral-300"
            @click="chatSearch = ''"
          >
            <UIcon name="i-heroicons-x-mark" class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Chat list — plain minimal rows that mirror the Browse "Workflows" list
           (same row paddings, hover/active states, hover-revealed ⋯ menu, skeleton
           loader and bottom fade). No timestamps / preview lines / date groups. -->
      <div class="relative flex min-h-0 flex-1 flex-col">
        <!-- Skeleton rows while loading with no cached chats yet (matches Workflows). -->
        <ul v-if="chatsLoading && !generalChats.length" class="flex flex-col gap-0.5 flex-1 overflow-hidden pb-4" aria-busy="true">
          <li v-for="n in 5" :key="n" class="flex items-center rounded-md py-1 pl-2.5 pr-2">
            <span class="h-3.5 rounded bg-neutral-200 animate-pulse" :style="{ width: `${50 + (n * 13) % 40}%` }" />
          </li>
        </ul>
        <ul v-else-if="filteredChats.length" class="relative flex flex-col gap-0.5 flex-1 overflow-y-auto scrollbar-hide pb-4">
          <li v-for="c in filteredChats" :key="c.id" class="relative">
            <div v-if="editingChatId !== c.id" @click="openChat(c.id)"
              @mouseenter="hoveredChatId = c.id" @mouseleave="hoveredChatId = null"
              class="relative flex w-full cursor-pointer items-center rounded-md py-1 pl-2.5 pr-2 text-left text-nav text-neutral-950 outline-none"
              :class="activeChatId === c.id ? 'bg-neutral-300' : 'hover:bg-neutral-300/60'">
              <span class="min-w-0 flex-1 truncate" :title="c.title"
                @dblclick.stop="startChatRename(c.id, c.title)">{{ c.title || t('chats.untitled') }}</span>
              <div class="shrink-0 overflow-hidden"
                :class="(hoveredChatId === c.id || activeChatMenuId === c.id) ? 'w-[16px] ml-1.5' : 'w-0'"
                @click.stop>
                <svg @click="activeChatMenuId = activeChatMenuId === c.id ? null : c.id"
                  class="chat-list-trigger size-[16px] cursor-pointer text-neutral-400 hover:text-neutral-950"
                  :data-id="c.id" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>
                <Teleport to="body">
                  <div v-if="activeChatMenuId === c.id"
                    class="chat-list-dropdown fixed z-9999 mt-1 w-36 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-neutral-200"
                    :style="{ top: getChatMenuPosition(c.id).top + 'px', left: getChatMenuPosition(c.id).left + 'px' }">
                    <button @click.stop="startChatRename(c.id, c.title)"
                      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200">
                      <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {{ t('common.rename') }}
                    </button>
                    <button @click.stop="onArchiveChat(c.id)"
                      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 transition-colors hover:bg-neutral-200">
                      <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="4" rx="1" />
                        <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
                      </svg>
                      {{ t('chats.archive') }}
                    </button>
                    <div class="my-0.5 mx-2 h-px bg-neutral-200" />
                    <button @click.stop="onDeleteChat(c.id)"
                      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-red-600 transition-colors hover:bg-red-50">
                      <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {{ t('common.delete') }}
                    </button>
                  </div>
                </Teleport>
              </div>
            </div>

            <div v-else class="flex w-full items-center rounded-md py-1 pl-2.5 pr-2 text-left text-nav text-neutral-950">
              <input v-model="editingChatValue" data-chat-rename type="text" name="chat-rename"
                @keyup.enter="confirmChatRename(c.id)" @keyup.esc="cancelChatRename" @blur="confirmChatRename(c.id)"
                class="m-0 h-auto min-w-0 flex-1 border-0 bg-transparent leading-normal outline-none">
            </div>
          </li>
        </ul>
        <div v-else class="flex flex-1 items-center justify-center px-3 text-center">
          <p class="text-meta text-neutral-400">{{ chatSearch ? t('chats.noResults') : t('chats.empty') }}</p>
        </div>
        <div class="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-8 bg-linear-to-t from-neutral-100 to-transparent" />
      </div>
    </div>

    <!-- Archive — Chat tab only; an inline panel that expands UPWARD from the row.
         Click the row to toggle, drag it up/down to resize, scroll the list. -->
    <div v-show="activeTab === 'chat'" class="shrink-0">
      <!-- Reveal panel: height animates open/closed; no transition while dragging. -->
      <div
        class="overflow-hidden"
        :class="archiveDragging ? '' : 'transition-[height] duration-200 ease-out'"
        :style="{ height: (isArchiveOpen ? archiveHeight : 0) + 'px' }"
      >
        <div class="flex h-full flex-col rounded-md bg-neutral-200/40">
          <!-- Resize handle — lives at the TOP of the expanded panel (drag to resize). -->
          <div
            class="group/resize flex h-3.5 shrink-0 cursor-ns-resize items-center justify-center rounded-t-md"
            role="separator"
            aria-orientation="horizontal"
            :aria-label="t('chats.resizeArchive')"
            @pointerdown="onArchiveResizePointerDown"
          >
            <span
              class="h-1 w-8 rounded-full transition-colors"
              :class="archiveDragging ? 'bg-neutral-400/80' : 'bg-neutral-400/40 group-hover/resize:bg-neutral-400/70'"
              aria-hidden="true"
            />
          </div>
          <div class="flex shrink-0 items-center justify-between px-2 pb-1 pt-0.5">
            <span class="text-meta font-medium text-neutral-400">{{ t('chats.archivedTitle') }}</span>
            <button
              v-if="archivedChats.length"
              type="button"
              class="text-meta transition-colors"
              :class="archiveConfirmingClear ? 'font-medium text-red-600' : 'text-neutral-400 hover:text-red-600'"
              @click="onClearArchiveInline"
            >
              {{ archiveConfirmingClear ? t('chats.clearArchiveConfirmButton') : t('chats.clearArchive') }}
            </button>
          </div>

          <ul v-if="archivedChats.length" class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-hide px-1 pb-1">
            <li
              v-for="c in archivedChats"
              :key="c.id"
              class="group flex items-center gap-1 rounded-md py-1 pl-2 pr-1 text-nav text-neutral-800 transition-colors hover:bg-neutral-300/50"
            >
              <span class="min-w-0 flex-1 truncate" :title="c.title">{{ c.title || t('chats.untitled') }}</span>
              <div class="flex shrink-0 items-center gap-0">
                <button
                  type="button"
                  :aria-label="t('chats.unarchive')"
                  class="group/btn relative shrink-0 rounded p-0.5 text-neutral-400 opacity-0 transition hover:text-neutral-900 group-hover:opacity-100"
                  @click="unarchiveChat(c.id)"
                >
                  <svg class="size-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 19V6" />
                    <path d="m6 12 6-6 6 6" />
                  </svg>
                  <span
                    class="pointer-events-none absolute right-full top-1/2 z-20 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/btn:opacity-100 group-focus/btn:opacity-100"
                    role="tooltip"
                  >
                    {{ t('chats.unarchive') }}
                  </span>
                </button>
                <button
                  type="button"
                  :aria-label="t('common.delete')"
                  class="group/btn relative shrink-0 rounded p-0.5 text-neutral-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                  @click="onDeleteChat(c.id)"
                >
                  <svg class="size-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span
                    class="pointer-events-none absolute right-full top-1/2 z-20 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-neutral-200/80 bg-white px-2 py-1 text-[11px] leading-none text-neutral-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover/btn:opacity-100 group-focus/btn:opacity-100"
                    role="tooltip"
                  >
                    {{ t('common.delete') }}
                  </span>
                </button>
              </div>
            </li>
          </ul>
          <div v-else class="flex min-h-0 flex-1 items-center justify-center px-3 text-center">
            <p class="text-meta text-neutral-400">{{ t('chats.archiveEmpty') }}</p>
          </div>
        </div>
      </div>

      <!-- The row: click to toggle. Resizing is handled by the panel's top handle. -->
      <button
        type="button"
        class="relative mb-1 mt-1 flex w-full cursor-pointer select-none items-center gap-1 rounded-md py-1 pl-1 pr-2 text-nav text-neutral-950 outline-none transition-colors hover:bg-neutral-300/60"
        @click="toggleArchive"
      >
        <svg class="h-[20px] w-[28px] shrink-0 px-[6px] py-[2px] text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
        </svg>
        <span class="flex-1 text-left">{{ t('chats.archive') }}</span>
        <svg
          class="size-3.5 shrink-0 text-neutral-400 transition-transform duration-200"
          :class="isArchiveOpen ? 'rotate-180' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
    </div>

    <div class="mt-auto shrink-0 border-t border-neutral-200/80 pt-2 relative">
      <div class="relative flex items-center gap-1">
        <button @click="isProfileDropdownOpen = !isProfileDropdownOpen"
          class="profile-trigger flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 pr-2 text-neutral-950 transition-colors outline-none"
          :class="isProfileDropdownOpen ? 'bg-neutral-300/60' : 'hover:bg-neutral-300/60'">
          <!-- Avatar — 20px, mirroring the workspace row's slim header. -->
          <template v-if="avatarUrl && !avatarFailed">
            <img
              :src="avatarUrl"
              referrerpolicy="no-referrer"
              class="h-[20px] w-[20px] shrink-0 rounded-md object-cover"
              alt=""
              @error="avatarFailed = true"
            />
          </template>
          <AccountIcon v-else :initials="(userName || 'U').trim().charAt(0).toUpperCase()" size-class="h-[20px] w-[20px] text-[10px]" color="bg-neutral-800" role="img" :aria-label="t('nav.userProfile')" />
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-[14px] leading-tight">
              <span class="font-semibold text-neutral-950">{{ userName }}</span>
              <template v-if="userRole">
                <span class="font-semibold text-neutral-700"> · </span>
                <span class="text-neutral-600">{{ userRole }}</span>
              </template>
            </p>
          </div>
        </button>

        <!-- Inbox + notifications. Slim 28px trigger (matches the workspace-row
             chevron) and left-anchored so the popup opens above and on-screen. -->
        <NotificationsInbox class="shrink-0" align="left" compact />

        <Menu v-if="isProfileDropdownOpen" ref="profileDropdownRef" :open="isProfileDropdownOpen" placement="above" width="w-full" inset>
        <div class="px-3 pt-2 pb-1.5 text-xs text-neutral-500 truncate">
          {{ userEmail }}
        </div>
        <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
        <MenuItem :text="t('common.preferences')" @click="handleSettings">
          <template #icon>
            <UIcon name="i-heroicons-user-circle" class="size-[18px]" />
          </template>
        </MenuItem>
        <div ref="languageBtnRef">
          <MenuItem
            :text="t('common.language')"
            :active="isLanguageOpen"
            @click.stop="isLanguageOpen ? isLanguageOpen = false : openLanguagePanel()"
          >
            <template #icon>
              <div class="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                  <path d="M7.27 3.05a7.467 7.467 0 1 1-.018.007l.01-.004zm1.372 11.478a8 8 0 0 0-1.464 1.362 6.53 6.53 0 0 0 3.373.62 6.2 6.2 0 0 1-.969-.835 10 10 0 0 1-.94-1.147m4.515-1.993c-.626.13-1.275.323-1.93.581-.654.258-1.26.56-1.808.892.276.386.555.73.835 1.02.45.468.88.788 1.258.958.376.17.665.178.881.093.218-.085.425-.289.584-.67.16-.383.257-.91.267-1.558a9 9 0 0 0-.087-1.316M3.637 8.52a6.5 6.5 0 0 0 .285 3.876 6.5 6.5 0 0 0 2.433 3.027 9 9 0 0 1 1.772-1.674 16.4 16.4 0 0 1-1.243-2.52 16.5 16.5 0 0 1-.81-2.693 9 9 0 0 1-2.436-.016m12.444 3.864a8 8 0 0 0-2 .003c.07.523.103 1.02.096 1.48a6.2 6.2 0 0 1-.14 1.272 6.53 6.53 0 0 0 2.044-2.755M11.095 6.77c-.607.37-1.271.701-1.98.981s-1.423.49-2.119.633c.165.79.417 1.638.757 2.5s.733 1.653 1.151 2.344c.607-.37 1.272-.701 1.982-.981s1.422-.49 2.117-.634a15.6 15.6 0 0 0-.756-2.499 15.6 15.6 0 0 0-1.152-2.344m2.548-2.194a9 9 0 0 1-1.77 1.674c.457.751.881 1.602 1.243 2.521.362.92.633 1.83.81 2.692a9 9 0 0 1 2.435.016 6.5 6.5 0 0 0-.282-3.875 6.5 6.5 0 0 0-2.436-3.028m-7.681.286a6.53 6.53 0 0 0-2.044 2.753c.603.08 1.279.082 1.999-.002-.07-.523-.1-1.02-.094-1.48a6.2 6.2 0 0 1 .139-1.27m2.526-.85c-.376-.17-.665-.177-.883-.091s-.423.288-.583.669c-.16.383-.256.91-.266 1.557a9 9 0 0 0 .086 1.316c.627-.13 1.276-.321 1.93-.58.655-.257 1.26-.561 1.807-.893a9 9 0 0 0-.833-1.02c-.45-.468-.88-.787-1.258-.957m4.334.096a6.53 6.53 0 0 0-3.372-.62c.328.224.654.506.969.834q.48.5.94 1.147a8 8 0 0 0 1.464-1.362"></path>
                </svg>
              </div>
            </template>
            <template #icon-right>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>
            </template>
          </MenuItem>
        </div>
        <MenuItem :text="t('common.upgradePlan')" @click="handleUpgradePlan">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
              <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m-.354 3.146a.5.5 0 0 1 .63-.064l.078.064 2.5 2.5a.5.5 0 1 1-.707.708L10.5 8.207V13l-.01.1a.5.5 0 0 1-.98 0L9.5 13V8.207L7.854 9.854a.5.5 0 0 1-.707-.708z"></path>
            </svg>
          </template>
        </MenuItem>
        <MenuItem :text="t('common.installApp')" @click="handleInstallApp">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
              <path d="M16.5 13a.5.5 0 0 1 .5.5v2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 1 .5-.5M10 3a.5.5 0 0 1 .5.5v8.686l3.126-3.518a.5.5 0 0 1 .748.664l-4 4.5-.08.071a.5.5 0 0 1-.668-.071l-4-4.5-.059-.082A.5.5 0 0 1 6.3 8.6l.075.068L9.5 12.186V3.5A.5.5 0 0 1 10 3"></path>
            </svg>
          </template>
        </MenuItem>
        <div ref="helpBtnRef">
          <MenuItem
            :text="t('common.help')"
            :active="isHelpOpen"
            @click.stop="isHelpOpen ? isHelpOpen = false : openHelpPanel()"
          >
            <template #icon>
              <div class="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                  <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5m0-7a2.5 2.5 0 0 1 1.34 4.61l-.14.084a1.9 1.9 0 0 0-.522.402c-.126.146-.178.28-.178.404v.25a.5.5 0 0 1-1 0v-.25c0-.428.185-.784.418-1.056.23-.268.525-.475.8-.627l.169-.107A1.5 1.5 0 1 0 8.5 8.5a.5.5 0 0 1-1 0A2.5 2.5 0 0 1 10 6"/>
                </svg>
              </div>
            </template>
            <template #icon-right>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>
            </template>
          </MenuItem>
        </div>
        <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
        <MenuItem :text="t('common.signOut')" destructive @click="handleLogout">
            <template #icon>
              <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                <path d="M9.5 3A1.5 1.5 0 0 1 11 4.5v3l-.01.1a.5.5 0 0 1-.98 0L10 7.5v-3a.5.5 0 0 0-.5-.5h-5l-.1.01a.5.5 0 0 0-.4.49v11a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .49-.4l.01-.1v-3a.5.5 0 0 1 1 0v3l-.008.153A1.5 1.5 0 0 1 9.5 17h-5A1.5 1.5 0 0 1 3 15.5v-11a1.5 1.5 0 0 1 1.347-1.492L4.5 3zm3.12 3.675a.5.5 0 0 1 .705-.055l3.5 3 .074.08a.5.5 0 0 1-.074.68l-3.5 3-.083.057a.5.5 0 0 1-.638-.744l.07-.073 2.474-2.12H7.5a.5.5 0 0 1 0-1h7.648l-2.473-2.12a.5.5 0 0 1-.055-.705"></path>
              </svg>
            </template>
          </MenuItem>
      </Menu>
      </div>

      <!-- Language submenu panel — teleported to body to escape overflow-hidden -->
      <Teleport to="body">
        <div
          v-if="isProfileDropdownOpen && isLanguageOpen"
          ref="languagePanelRef"
          class="fixed w-44 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 z-[9999]"
          :style="languagePanelStyle"
        >
          <button
            v-for="loc in availableLocales"
            :key="loc.code"
            type="button"
            class="flex w-[calc(100%_-_0.75rem)] mx-1.5 my-0.5 items-center justify-between rounded-lg px-2.5 py-1.5 text-sm cursor-pointer transition-colors hover:bg-neutral-200"
            :class="locale === loc.code ? 'font-medium text-neutral-950' : 'text-neutral-700'"
            @click="selectLocale(loc.code)"
          >
            <span>{{ loc.name }}</span>
            <svg v-if="locale === loc.code" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 shrink-0 text-neutral-950" aria-hidden="true">
              <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </Teleport>

      <!-- Help submenu panel — teleported to body to escape overflow-hidden -->
      <Teleport to="body">
        <div
          v-if="isProfileDropdownOpen && isHelpOpen"
          ref="helpPanelRef"
          class="fixed w-52 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 z-[9999]"
          :style="helpPanelStyle"
        >
          <button
            v-for="item in helpMenuItems"
            :key="item.key"
            type="button"
            class="flex w-[calc(100%_-_0.75rem)] mx-1.5 my-0.5 items-center rounded-lg px-2.5 py-1.5 text-sm cursor-pointer transition-colors text-neutral-700 hover:bg-neutral-200"
            @click="selectHelpItem(item.key)"
          >
            <span>{{ item.label }}</span>
          </button>
        </div>
      </Teleport>
    </div>

    <SearchModal v-model:open="isSearchOpen" />
    <BugReportModal v-model:open="isBugReportOpen" />
    <CreateWorkspaceModal v-model:open="isCreateWorkspaceOpen" />
    <ClientOnly>
      <ManageMembersModal v-model:open="isManageMembersOpen" />
    </ClientOnly>
  </aside>
</template>

<style scoped>
/* Workflow-list animations:
   - Add: new row fades in (.wf-enter-active); siblings slide down via FLIP
     (.wf-move).
   - Delete: leaving row drops out of flow and snaps to opacity:0 with no
     transition — it vanishes instantly while siblings slide up via .wf-move.
     Vue sees no transition on leave and removes it from the DOM next frame.
   - Drag-drop commit: .wf-move-static replaces .wf-move for one render so
     the dropped row doesn't tween from origin to slot (see `isDropping`). */
.wf-move {
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.wf-move-static {
  transition: none;
}
.wf-enter-active {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.wf-enter-from {
  opacity: 0;
}
.wf-folder-commit-static :deep(.wf-move),
.wf-folder-commit-static :deep(.wf-enter-active) {
  transition: none !important;
}
.wf-folder-commit-static :deep(.wf-enter-from) {
  opacity: 1 !important;
}
.wf-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  opacity: 0;
}

/* Folder rows cascade out from directly beneath the folder header and retract
   in reverse. Clipping the height reveal keeps their contents behind the
   folder boundary instead of painting over the header. */
.folder-flow-enter-active,
.folder-flow-leave-active {
  overflow: hidden;
  will-change: height, opacity;
  transition:
    height 200ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 150ms ease;
}
.folder-flow-enter-active {
  transition-delay: var(--folder-flow-enter-delay, 0ms);
}
.folder-flow-leave-active {
  pointer-events: none;
  transition-delay: var(--folder-flow-leave-delay, 0ms);
}
.folder-flow-enter-from,
.folder-flow-leave-to {
  height: 0 !important;
  opacity: 0;
}

/* Once a collapsed row's leave transition is removed, remove its empty list
   item too so the parent flex gap does not leave phantom vertical spacing. */
.wf-item:empty {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .folder-flow-enter-active,
  .folder-flow-leave-active {
    transition-duration: 1ms;
    transition-delay: 0ms;
  }
}

/* Drag-to-reorder affordance (real sessions only). Disable text selection on
   rows so a quick mousedown before the drag threshold can't highlight text. */
.wf-item {
  user-select: none;
}
.wf-item > div:first-child {
  cursor: grab;
}
.wf-draft > div:first-child {
  cursor: pointer;
}
.wf-chosen > div:first-child {
  cursor: grabbing;
}

/* Placeholder slot while dragging: invisible but occupies the row's space so
   siblings animate around a gap. */
.wf-ghost {
  opacity: 0;
}

/* Floating clone that follows the cursor. Styled to look identical to a
   stationary row — no shadow, no tint. Opacity and transform are rewritten
   every frame by `constrainDragPreview`, which also clamps Y to the list. */
.wf-drag {
  box-shadow: none;
}

.chat-search-input {
  color-scheme: light;
}

.chat-search-input::-webkit-search-cancel-button {
  display: none;
  appearance: none;
  -webkit-appearance: none;
}
</style>
