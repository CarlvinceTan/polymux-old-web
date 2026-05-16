<script setup lang="ts">
import type { WorkflowGraph, WorkflowNode, WorkflowVersion, WorkflowWire, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'
import { VersionConflictError } from '~/composables/workflows/useWorkflows'
import type { NodeModel, WireModel } from '~/composables/workflows/useWorkflowLayout'
import { buildLayout } from '~/composables/workflows/useWorkflowLayout'
import type { WorkflowOp } from '~/composables/workflows/useWorkflowMutations'
import { applyOp, findNodeById, findWireById, idsTouchedByOp } from '~/composables/workflows/useWorkflowMutations'
import type { LiveHistoryEntry } from '~/components/workflow/WorkflowHistoryDrawer.vue'

const props = defineProps<{
  sessionId: string
}>()

const { t } = useI18n()
const toast = useAppToast()
const { sessions } = useWorkflowList()
const { currentWorkspace } = useWorkspaces()
const {
  workflows,
  versions,
  fetchWorkflows,
  fetchVersions,
  getWorkflow,
  createVersion,
  startRun,
  resetToVersion,
} = useWorkflows()

// Live workflow-run status — provided by pages/workflow/[id].vue so the
// Run/Stop toggle reflects the actual in-flight run instead of just the
// brief startRun() request window.
const workflowRun = inject<ReturnType<typeof import('~/composables/workflows/useWorkflowRun').useWorkflowRun> | null>('workflow-run', null)
// The WS session is provided by pages/workflow/[id].vue. Used to push the
// user's current locked-node-id set up to the server so the orchestrator
// granular tools can reject mutations against locked nodes.
const sessionHandle = inject<import('~/composables/workflows/useWorkflowSession').SessionHandle | null>('chat-session', null)
const isRunActive = computed(() => {
  const s = workflowRun?.runStatus.value
  return s === 'running' || s === 'pending'
})

const workspaceId = computed(() => {
  const s = sessions.value.find(s => s.id === props.sessionId)
  return s?.workspace_id ?? currentWorkspace.value?.id ?? ''
})

function emptyGraph(): WorkflowGraph { return { nodes: [], wires: [] } }

const draftGraph = useState<WorkflowGraph>(`workflow-draft-graph:${props.sessionId}`, () => emptyGraph())
const selectedWorkflowKey = computed(() => `polymux_workflow_for_session_${props.sessionId}`)

const selectedWorkflowId = ref<string | null>(null)
// Gate rendering until the first `loadSelected()` resolves so the canvas
// never shows nodes positioned with the wrong (draft-key) overrides.
const canvasReady = ref(false)
const loadedGraph = ref<WorkflowGraph>(emptyGraph())
// Tracks the version number of the last loaded workflow so Save can pass an
// expected_version through to createVersion. Without it the server can't tell
// whether the user is editing the latest revision and 409 conflict checks
// stop working.
const latestVersionId = ref<string | null>(null)
const latestVersionNumber = ref<number>(0)

async function loadSelected() {
  if (!workspaceId.value) return
  await fetchWorkflows(workspaceId.value)
  if (!import.meta.client) return
  const stored = localStorage.getItem(selectedWorkflowKey.value)
  let id: string | null = null
  if (stored && workflows.value.some(w => w.id === stored)) id = stored
  else id = workflows.value[0]?.id ?? null
  selectedWorkflowId.value = id
  if (!id) {
    loadedGraph.value = emptyGraph()
    latestVersionId.value = null
    latestVersionNumber.value = 0
    canvasReady.value = true
    return
  }
  const wf = await getWorkflow(workspaceId.value, id) as WorkflowWithLatest | null
  const rawSteps = wf?.latest_version?.steps as WorkflowGraph | undefined
  loadedGraph.value = (rawSteps && Array.isArray(rawSteps.nodes)) ? rawSteps : emptyGraph()
  latestVersionId.value = wf?.latest_version?.id ?? null
  latestVersionNumber.value = wf?.latest_version?.version ?? 0
  // Hydrate locks from the persisted version — preferring the server-stored
  // set when the migration has run. Fall back to canvas-local localStorage
  // entries so a fresh deploy doesn't wipe the user's existing pins.
  const serverLocks = wf?.latest_version?.locked_node_ids
  if (Array.isArray(serverLocks) && serverLocks.length > 0) {
    lockedNodeIds.value = new Set(serverLocks)
    persistLocks()
  }
  canvasReady.value = true
  // Push whatever we ended up with up to the server so the orchestrator
  // tool handlers reject locked-node mutations before any further turn runs.
  pushLockSetToServer()
}

watch(workspaceId, () => { void loadSelected() }, { immediate: true })
// React to draft updates (orchestrator publishing) and saved-workflow ticks.
const lastSavedAt = useState<number>('workflow-last-saved-at', () => 0)
watch(lastSavedAt, () => { void loadSelected() })

// Forward-declared so `displayedSteps` (read by an `immediate: true` watch
// during setup) can read it without hitting a temporal-dead-zone error. The
// canonical selection state is `selectedVersionId` below; a watcher mirrors
// the selected version's data into this ref.
const previewedVersion = ref<WorkflowVersion | null>(null)

// Per-node user edits overlaid on top of the underlying graph. Each
// keystroke commits (debounced) into here; `displayedGraph` merges them so
// the canvas, save, and run all see the same edited graph without mutating
// the WS-driven `draftGraph`.
const editedDraft = ref<Record<string, Partial<WorkflowNode>>>({})
const dirtyNodeIds = ref<Set<string>>(new Set())

// User-applied structural ops (add / remove / edge mutations) produce a
// *new graph* rather than a per-field patch. We hold it here so subsequent
// renders show the restructure; incoming `workflow_draft` events are
// bypassed until the next save.
const userGraph = ref<WorkflowGraph | null>(null)

const displayedGraph = computed<WorkflowGraph>(() => {
  // Version preview is read-only.
  if (previewedVersion.value) {
    const v = previewedVersion.value.steps as WorkflowGraph | undefined
    return (v && Array.isArray(v.nodes)) ? v : emptyGraph()
  }
  if (userGraph.value) return applyEdits(userGraph.value)
  const base = (draftGraph.value.nodes.length > 0) ? draftGraph.value : loadedGraph.value
  return applyEdits(base)
})

function applyEdits(graph: WorkflowGraph): WorkflowGraph {
  if (Object.keys(editedDraft.value).length === 0) return graph
  return {
    nodes: graph.nodes.map(applyEditsToNode),
    wires: graph.wires,
  }
}

function applyEditsToNode(node: WorkflowNode): WorkflowNode {
  const patch = node.id ? editedDraft.value[node.id] : undefined
  return patch ? { ...node, ...patch } : node
}

const layout = computed(() => buildLayout(displayedGraph.value))

// Bootstrap watcher kept for parity with the legacy initialization flow —
// no per-kind collapse state in the graph model, so this is now a no-op
// stub waiting on layout to settle.
const collapsedInitialized = ref(false)
watch(displayedGraph, (graph) => {
  if (collapsedInitialized.value) return
  if (graph.nodes.length === 0) return
  collapsedInitialized.value = true
}, { immediate: true })

// ── Node positions ──────────────────────────────────────────────────────────
// Default grid from buildLayout columns/rows; user drags overlay per-node deltas
// persisted to localStorage so the user's hand-arranged canvas survives reloads.
//
// All layout metrics below are tied to the snap grid (SNAP_GRID = 24px). The
// rule is:
//   • Positions snap to SNAP_GRID  → top-left lands on the grid.
//   • Sizes snap to 2*SNAP_GRID    → half-dimensions also land on the grid,
//                                    so the wire-port midpoints (at y + h/2,
//                                    x + w/2) stay on the grid too.
// As long as both invariants hold, two nodes the user has dragged to the same
// grid row will have matching port-Ys and the wire between them is straight.
const NODE_W = 240   // = 5 * (2*SNAP_GRID) — half (120) is on the grid.
const NODE_H = 96    // = 2 * (2*SNAP_GRID) — half (48)  is on the grid.
// Terminals (Start / End) are graph anchors, not real steps — they don't
// hold action/target/value content so they render as a compact chip. Same
// grid-multiple invariant as regular nodes so their centre stays aligned
// with neighbouring full-size cards.
const TERMINAL_W = 96  // = 2 * (2*SNAP_GRID)
const TERMINAL_H = 48  // = 1 * (2*SNAP_GRID)
// Generous gaps so the bezier curves between nodes have room to bow without
// passing through a neighbouring node — the auto layout sits this far apart
// in both axes by default; users can pull nodes closer manually if they want.
const COL_GAP = 120  // multiple of SNAP_GRID
const ROW_GAP = 96   // multiple of SNAP_GRID
// Hover activation zone around each node — the pointer must enter this padded
// box (rather than landing on the card itself) for the four side-ports to
// appear. Once a zone is entered, only that node's ports show until the
// pointer leaves it; entering another node's zone while still inside this one
// does NOT switch focus, so the affordance is unambiguous.
const HOVER_PAD = 32
// Distance from the card's edge to the centre of each hover port.
const PORT_GAP = 14
// Distance between an existing card's edge and a freshly spawned card's edge,
// used by the port-click action below. Same in all four directions so a tap
// on any side gives a perfectly aligned, evenly-spaced sibling.
const SPAWN_GAP = 80
const positionsKey = computed(() => `polymux_node_positions_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)
const cameraKey = computed(() => `polymux_flow_camera_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

interface Pt { x: number; y: number }
// Transient drag-preview overlay. Drag-commit promotes entries here into
// persisted `node.position` via a `node_edit` op; the overlay only holds
// the in-flight gesture's coordinates.
const overrides = ref<Record<string, Pt>>({})

// User-drawn wires between two existing nodes (i.e. the user dragged from a
// port and released over another node's hover zone). Same persistence model
// as positions — promoted to real `edge_add` ops at save time.
interface UserWire {
  id: string
  fromId: string
  toId: string
}
const userWires = ref<UserWire[]>([])
const userWiresKey = computed(() => `polymux_user_wires_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

// Per-node size overrides. Mirrors the position-overrides pattern: edits live
// only in localStorage (resize is purely visual; the schema has no size
// field). Defaults to NODE_W × NODE_H; terminals are never resizable.
interface Size { w: number; h: number }
const NODE_MIN_W = 140
const NODE_MIN_H = 60
const NODE_MAX_W = 520
const NODE_MAX_H = 260
const sizes = ref<Record<string, Size>>({})
const sizesKey = computed(() => `polymux_node_sizes_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

// User-locked nodes. Lock state lives client-side (per-workflow localStorage)
// because the schema migration for `locked_node_ids` is a follow-up; the
// UI affordance and form-level enforcement still matter today. Server-side
// orchestrator enforcement is a stub for now.
const lockedNodeIds = ref<Set<string>>(new Set())
const locksKey = computed(() => `polymux_node_locks_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

watch(positionsKey, (key) => {
  overrides.value = {}
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) overrides.value = JSON.parse(raw) as Record<string, Pt>
  }
  catch {}
}, { immediate: true })

watch(userWiresKey, (key) => {
  userWires.value = []
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) userWires.value = JSON.parse(raw) as UserWire[]
  }
  catch {}
}, { immediate: true })

watch(sizesKey, (key) => {
  sizes.value = {}
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) sizes.value = JSON.parse(raw) as Record<string, Size>
  }
  catch {}
}, { immediate: true })

watch(locksKey, (key) => {
  lockedNodeIds.value = new Set()
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) lockedNodeIds.value = new Set(JSON.parse(raw) as string[])
  }
  catch {}
}, { immediate: true })

function persistOverrides() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(positionsKey.value, JSON.stringify(overrides.value))
  }
  catch {}
}

function persistSizes() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(sizesKey.value, JSON.stringify(sizes.value))
  }
  catch {}
}

function persistLocks() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(locksKey.value, JSON.stringify([...lockedNodeIds.value]))
  }
  catch {}
}

function isLockedNode(id: string): boolean {
  return lockedNodeIds.value.has(id)
}

function toggleLock(node: NodeModel) {
  if (node.terminal) return
  const next = new Set(lockedNodeIds.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  lockedNodeIds.value = next
  persistLocks()
  pushLockSetToServer()
  // A lock change is a deliberate user intent — record it on disk so the
  // orchestrator sees the same set after a reload. Goes through the same
  // 1 s debounced autosave that field edits use.
  lockSetDirty = true
  scheduleAutoSave()
}

function pushLockSetToServer() {
  sessionHandle?.send('workflow_user_lock_set', { node_ids: [...lockedNodeIds.value] })
}

// Terminals (Start / End) and any unknown id fall back to the layout default
// so consumers can call this without a null check. Terminals use the smaller
// chip dimensions; their centre still lands on the same grid cell as a
// regular node thanks to the centre-anchored layout in `defaultPos`.
//
// Precedence: transient `sizes` overlay (live-preview while the user is
// resizing) → persisted `node.size` (from the saved graph) → defaults.
function nodeSize(n: NodeModel | string): Size {
  if (typeof n === 'string') {
    const ovr = sizes.value[n]
    if (ovr) return ovr
    return { w: NODE_W, h: NODE_H }
  }
  if (n.terminal) return { w: TERMINAL_W, h: TERMINAL_H }
  const ovr = sizes.value[n.id]
  if (ovr) return ovr
  const persisted = n.node.size
  if (persisted) return { w: persisted.w, h: persisted.h }
  return { w: NODE_W, h: NODE_H }
}

function persistUserWires() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(userWiresKey.value, JSON.stringify(userWires.value))
  }
  catch {}
}

function defaultPos(node: NodeModel): Pt {
  // Anchor each cell on its CENTRE (not its top-left) so that two nodes
  // sharing a row have aligned vertical centres and two nodes sharing a
  // column have aligned horizontal centres — independent of how each
  // node has been individually resized. With NODE_W/H and the gaps all
  // multiples of SNAP_GRID, the cell centre lands on the grid; with
  // resize snapped to 2*SNAP_GRID, half the actual size is also on the
  // grid, so the resulting top-left stays grid-aligned too.
  const size = nodeSize(node)
  const cellCenterX = 48 + node.col * (NODE_W + COL_GAP) + NODE_W / 2
  const cellCenterY = 48 + node.row * (NODE_H + ROW_GAP) + NODE_H / 2
  return {
    x: cellCenterX - size.w / 2,
    y: cellCenterY - size.h / 2,
  }
}

const allNodes = computed<NodeModel[]>(() => layout.value.nodes)

interface FlatWire { id: string; fromId: string; toId: string }
const allWires = computed<FlatWire[]>(() => [
  ...layout.value.wires.map(w => ({ id: w.id, fromId: w.fromId, toId: w.toId })),
  ...userWires.value,
])

function nodePos(node: NodeModel): Pt {
  // Precedence: transient `overrides` overlay (live-preview while a drag
  // is in flight) → persisted `node.position` (from the saved graph) →
  // auto-layout default.
  const ovr = overrides.value[node.id]
  if (ovr) return ovr
  const persisted = node.node.position
  if (persisted) return { x: persisted.x, y: persisted.y }
  return defaultPos(node)
}

// Extents track both the min and max corner of the placed nodes (including
// any user-dragged overrides that might fall to the left of / above the
// origin). The wires SVG used to clip paths to its own (0,0)→(width,height)
// viewport, so any wire whose port landed at a negative coord disappeared.
// We render the SVG with overflow:visible *and* size the host div to cover
// negative-side content, so panning / fit-to-view always reach all nodes.
//
// During an active drag we freeze the bounds: if a dragged node crosses
// the minX/minY threshold mid-drag, the inner shift wrapper translates,
// and the rendered position of the node would jump relative to the
// cursor (because the cursor is in fixed viewport coords but the
// content layer just shifted). Freezing keeps everything stable while
// the user is moving a node; we recompute when they release.
interface CanvasBounds { minX: number; minY: number; width: number; height: number }
const liveCanvasBounds = computed<CanvasBounds>(() => {
  let minX = 0
  let minY = 0
  let maxX = 800
  let maxY = 600
  for (const n of allNodes.value) {
    const p = nodePos(n)
    const s = nodeSize(n)
    if (p.x - 80 < minX) minX = p.x - 80
    if (p.y - 80 < minY) minY = p.y - 80
    if (p.x + s.w + 80 > maxX) maxX = p.x + s.w + 80
    if (p.y + s.h + 80 > maxY) maxY = p.y + s.h + 80
  }
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  }
})
const frozenCanvasBounds = ref<CanvasBounds | null>(null)
const canvasBounds = computed<CanvasBounds>(
  () => frozenCanvasBounds.value ?? liveCanvasBounds.value,
)

// ── Pan / zoom ──────────────────────────────────────────────────────────────
const scale = ref(1)
const offset = ref<Pt>({ x: 0, y: 0 })
const viewportEl = ref<HTMLElement | null>(null)

// Session-local viewport (pan / zoom): survives Schedule/Artifacts hops when the canvas
// is alive, and hydrates cold mounts so we don't slam fitToView() over user's framing.
interface FlowViewport { scale: number; offset: Pt }
const hasHydratedViewportFromStorage = ref(false)

let viewportPersistTimer: ReturnType<typeof setTimeout> | null = null

function hydrateViewportFromStorage() {
  hasHydratedViewportFromStorage.value = false
  if (!import.meta.client) return
  try {
    const raw = sessionStorage.getItem(cameraKey.value)
    if (!raw) return
    const p = JSON.parse(raw) as Partial<FlowViewport>
    const sc = p.scale
    const ox = p.offset?.x
    const oy = p.offset?.y
    if (typeof sc !== 'number' || typeof ox !== 'number' || typeof oy !== 'number') return
    const clampedScale = Math.max(0.4, Math.min(2, sc))
    scale.value = clampedScale
    offset.value = { x: ox, y: oy }
    hasHydratedViewportFromStorage.value = true
  }
  catch {}
}

function persistViewportToStorage() {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(cameraKey.value, JSON.stringify({
      scale: scale.value,
      offset: offset.value,
    }))
  }
  catch {}
}

function schedulePersistViewport() {
  if (!import.meta.client) return
  if (viewportPersistTimer != null) clearTimeout(viewportPersistTimer)
  viewportPersistTimer = setTimeout(() => {
    viewportPersistTimer = null
    persistViewportToStorage()
  }, 160)
}

watch(cameraKey, (_k, prevKey) => {
  // Clear prior workflow framing before hydrating the next key — skip on the immediate
  // bootstrap pass so we don't clobber defaults before reading storage once.
  if (prevKey != null) {
    scale.value = 1
    offset.value = { x: 0, y: 0 }
  }
  hydrateViewportFromStorage()
}, { immediate: true })

watch([scale, offset], () => { schedulePersistViewport() }, { deep: true })

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const delta = -e.deltaY * 0.0015
  const newScale = Math.max(0.4, Math.min(2, scale.value * (1 + delta)))
  scale.value = newScale
}

let isPanning = false
let panStart = { x: 0, y: 0 }
let offsetStart = { x: 0, y: 0 }

function onCanvasPointerDown(e: PointerEvent) {
  // Pan with middle button or space-less right-area drag (background click).
  const target = e.target as HTMLElement
  if (target.closest('[data-node]')) return
  if (e.button !== 0 && e.button !== 1) return
  isPanning = true
  panStart = { x: e.clientX, y: e.clientY }
  offsetStart = { ...offset.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  // Background click clears both node and edge selection.
  if (e.button === 0) {
    selected.value = new Set()
    selectedWireId.value = null
  }
}
function onCanvasPointerMove(e: PointerEvent) {
  if (!isPanning) return
  offset.value = {
    x: offsetStart.x + (e.clientX - panStart.x),
    y: offsetStart.y + (e.clientY - panStart.y),
  }
}
function onCanvasPointerUp(e: PointerEvent) {
  if (!isPanning) return
  isPanning = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function fitToView() {
  if (!viewportEl.value) return
  const rect = viewportEl.value.getBoundingClientRect()
  // Reserve space for the floating overlays that sit on top of the
  // canvas so nodes don't render underneath them: workflow title +
  // mode switch (top), prompt input (bottom), side toolbar (left).
  // The right edge has no overlay, just a visual gutter.
  const padTop = 80
  const padBottom = 120
  const padLeft = 72
  const padRight = 32
  // Fit-to-view always snaps to 100% zoom — it re-centres the graph in
  // the available (non-overlay) area without rescaling, regardless of
  // whether the bbox would technically fit at a larger zoom.
  scale.value = 1
  const nodes = visibleNodes.value
  if (nodes.length === 0) {
    offset.value = { x: 0, y: 0 }
    return
  }
  // Tight bounding box of the actual visible nodes — separate from
  // canvasBounds, which includes padding and 800×600 minimums for the
  // wrapper / SVG sizing. Using the tight box here means Fit always
  // centres on the nodes themselves regardless of how small a region
  // they occupy.
  let nMinX = Infinity
  let nMinY = Infinity
  let nMaxX = -Infinity
  let nMaxY = -Infinity
  for (const n of nodes) {
    const p = nodePos(n)
    const s = nodeSize(n)
    if (p.x < nMinX) nMinX = p.x
    if (p.y < nMinY) nMinY = p.y
    if (p.x + s.w > nMaxX) nMaxX = p.x + s.w
    if (p.y + s.h > nMaxY) nMaxY = p.y + s.h
  }
  // Map the centre of the nodes' bbox (in workflow coords) to the
  // centre of the *available* (non-overlay) area, not the raw viewport.
  // The shift wrapper translates by (-canvasBounds.minX, -canvasBounds.minY)
  // before scale/offset, so a workflow point at X renders at
  // (X - canvasBounds.minX) * scale + offset.x in the viewport.
  const cb = canvasBounds.value
  const midX = (nMinX + nMaxX) / 2
  const midY = (nMinY + nMaxY) / 2
  const targetCx = (padLeft + (rect.width - padRight)) / 2
  const targetCy = (padTop + (rect.height - padBottom)) / 2
  offset.value = {
    x: targetCx - (midX - cb.minX),
    y: targetCy - (midY - cb.minY),
  }
}

// Manual zoom buttons next to the % display. We zoom around the viewport
// centre (rather than the cursor like the wheel handler does) so the
// "current view" stays put when the user nudges the level explicitly.
function zoomBy(factor: number) {
  if (!viewportEl.value) return
  const rect = viewportEl.value.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const oldScale = scale.value
  const newScale = Math.max(0.4, Math.min(2, oldScale * factor))
  if (newScale === oldScale) return
  // Keep the canvas point under the viewport centre stationary.
  const wx = (cx - offset.value.x) / oldScale
  const wy = (cy - offset.value.y) / oldScale
  scale.value = newScale
  offset.value = {
    x: cx - wx * newScale,
    y: cy - wy * newScale,
  }
}
function zoomIn() { zoomBy(1.15) }
function zoomOut() { zoomBy(1 / 1.15) }

// Defer camera setup until canvasReady is true — but prefer a hydrated sessionStorage
// viewport over resetting to fit-to-view whenever the pane remounts.
onMounted(() => {
  const applyInitialViewport = () => {
    nextTick(() => {
      if (!hasHydratedViewportFromStorage.value) fitToView()
    })
  }
  if (canvasReady.value) applyInitialViewport()
  else {
    const stop = watch(canvasReady, (ready) => {
      if (!ready) return
      stop()
      applyInitialViewport()
    })
  }
})
watch(
  () => layout.value.nodes.length,
  (len, prevLen) => {
    if ((prevLen ?? 0) > 0) return
    if (len === 0) return
    nextTick(() => {
      if (!hasHydratedViewportFromStorage.value) fitToView()
    })
  },
)

// ── Undo / redo history ─────────────────────────────────────────────────────
// Snapshots cover every piece of canvas-local draft state that a user action
// can mutate: position overrides, spawned nodes, user-drawn wires, and the
// hidden-from-view set. They DON'T touch the persisted workflow on the
// backend — the saved version stays put until the user explicitly saves
// elsewhere. The pointer indexes into a linear history; recording a new
// state truncates any forward branch (standard editor undo semantics).
interface CanvasSnapshot {
  overrides: Record<string, Pt>
  userWires: UserWire[]
  hidden: string[]
  sizes: Record<string, Size>
}
const HISTORY_LIMIT = 100
const history = ref<CanvasSnapshot[]>([])
const historyPointer = ref(-1)

function snapshotCurrent(): CanvasSnapshot {
  const clonedSizes: Record<string, Size> = {}
  for (const id in sizes.value) clonedSizes[id] = { ...sizes.value[id]! }
  return {
    overrides: { ...overrides.value },
    userWires: userWires.value.map(w => ({ ...w })),
    hidden: [...hidden.value],
    sizes: clonedSizes,
  }
}

function applySnapshot(s: CanvasSnapshot) {
  overrides.value = { ...s.overrides }
  userWires.value = s.userWires.map(w => ({ ...w }))
  hidden.value = new Set(s.hidden)
  const restoredSizes: Record<string, Size> = {}
  for (const id in s.sizes) restoredSizes[id] = { ...s.sizes[id]! }
  sizes.value = restoredSizes
  persistOverrides()
  persistUserWires()
  persistSizes()
}

function recordHistory() {
  const snap = snapshotCurrent()
  // Drop any forward branch — once a new edit is made, the redo path is
  // gone (standard editor behaviour).
  const next = history.value.slice(0, historyPointer.value + 1)
  next.push(snap)
  // Cap memory: keep at most HISTORY_LIMIT snapshots.
  const trimmed = next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
  history.value = trimmed
  historyPointer.value = trimmed.length - 1
}

const canUndo = computed(() => historyPointer.value > 0)
const canRedo = computed(() => historyPointer.value < history.value.length - 1)

function undo() {
  if (!canUndo.value) return
  historyPointer.value -= 1
  applySnapshot(history.value[historyPointer.value]!)
}

function redo() {
  if (!canRedo.value) return
  historyPointer.value += 1
  applySnapshot(history.value[historyPointer.value]!)
}

// Capture the initial state once we've loaded the persisted overrides /
// extras / user wires for this session, so the user can always undo back
// to "what the canvas looked like when I opened it".
let historySeeded = false
function seedHistoryOnce() {
  if (historySeeded) return
  historySeeded = true
  history.value = [snapshotCurrent()]
  historyPointer.value = 0
}
onMounted(() => { seedHistoryOnce() })

// If the workflow being viewed switches (a different draft / saved id),
// reset the history so we don't undo across workflows.
watch(positionsKey, () => {
  history.value = []
  historyPointer.value = -1
  historySeeded = false
  nextTick(() => seedHistoryOnce())
})

// ── Selection ───────────────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set())

function isSelected(id: string) { return selected.value.has(id) }

// ── Inline rename ───────────────────────────────────────────────────────────
// Double-clicking a node title swaps the label for an autofocused input —
// mirrors the SidePanel.vue rename pattern. Commits write to `description`
// (which `nodeTitle()` already prefers over action/target).
const renamingNodeId = ref<string | null>(null)
const renamingValue = ref('')
// Auto-grow during rename: enabled only when the existing description fits
// inside the node at rename-start. If the user has manually shrunk the node
// so the text is already clipped, we leave the size alone and let it ellipsize.
const renameAutoGrow = ref(false)
// Inner horizontal padding of the node title container (px-3 = 12px each
// side), used to translate "text width" into a node width.
const NODE_TEXT_PAD_X = 24
// Hidden measurement node — see template.
const renameMeasureEl = ref<HTMLSpanElement | null>(null)

function measureRenameText(text: string): number {
  const el = renameMeasureEl.value
  if (!el) return 0
  el.textContent = text || ' '
  return el.offsetWidth
}

function startRename(node: NodeModel) {
  if (node.terminal) return
  if (isLockedNode(node.id)) return
  if (!attemptEdit()) return
  renamingNodeId.value = node.id
  const initialText = node.node.description ?? nodeTitle(node)
  renamingValue.value = initialText
  // Determine whether the current text fits, gating auto-grow on that.
  nextTick(() => {
    const inner = nodeSize(node).w - NODE_TEXT_PAD_X
    const measured = measureRenameText(initialText)
    renameAutoGrow.value = measured <= inner
    const input = document.querySelector('input[data-node-rename]') as HTMLInputElement | null
    if (input) {
      input.focus()
      input.select()
    }
  })
}

// While the user types, grow the node width to keep the title visible —
// but only if the title fit when editing started, and only up to NODE_MAX_W.
// Width grows in 2*SNAP_GRID multiples so grid alignment + centred-cell
// layout invariants stay intact; the node never shrinks here.
watch(renamingValue, (text) => {
  const nodeId = renamingNodeId.value
  if (!nodeId || !renameAutoGrow.value) return
  const node = allNodes.value.find(n => n.id === nodeId)
  if (!node) return
  const measured = measureRenameText(text)
  const cur = sizes.value[nodeId] ?? { w: NODE_W, h: NODE_H }
  const currentInner = cur.w - NODE_TEXT_PAD_X
  if (measured <= currentInner) return
  if (cur.w >= NODE_MAX_W) return
  const SIZE_SNAP = SNAP_GRID * 2
  let newW = Math.ceil((measured + NODE_TEXT_PAD_X) / SIZE_SNAP) * SIZE_SNAP
  newW = Math.min(NODE_MAX_W, newW)
  if (newW <= cur.w) return
  sizes.value = { ...sizes.value, [nodeId]: { w: newW, h: cur.h } }
})

function commitRename(nodeId: string) {
  if (renamingNodeId.value !== nodeId) return
  const trimmed = renamingValue.value.trim()
  renamingNodeId.value = null
  renameAutoGrow.value = false
  // Persist any auto-grow size adjustments along with the rename. Drag-
  // resize already calls this in its own onUp; rename needs to mirror so
  // the new width survives a reload.
  persistSizes()
  // Empty rename is a no-op rather than wiping the description out.
  if (trimmed.length === 0) return
  onNodePatch(nodeId, { description: trimmed })
}

function cancelRename() {
  renamingNodeId.value = null
  renamingValue.value = ''
  renameAutoGrow.value = false
}

// ── Resize ─────────────────────────────────────────────────────────────────
// Pointer-down on the bottom-right handle drives a resize, scaled to the
// canvas zoom so the cursor and the corner track 1:1. Persists to localStorage
// (size is canvas-local — same model as positions) and records an undo entry.
function onResizePointerDown(e: PointerEvent, node: NodeModel) {
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  if (node.terminal) return
  if (isLockedNode(node.id)) return
  if (!attemptEdit()) return
  const startSize = nodeSize(node)
  const startClientX = e.clientX
  const startClientY = e.clientY
  function onMove(ev: PointerEvent) {
    const dx = (ev.clientX - startClientX) / scale.value
    const dy = (ev.clientY - startClientY) / scale.value
    let newW = startSize.w + dx
    let newH = startSize.h + dy
    if (settings.value.snapToGrid) {
      // Snap sizes to 2*SNAP_GRID so the node's half-width / half-height
      // (where the wire ports sit) also land on the snap grid. Without
      // this, a node whose height isn't a multiple of 2*SNAP_GRID has a
      // port-Y at "h/2" that no other node can drag onto, so the wire
      // between them can't be made straight.
      const SIZE_SNAP = SNAP_GRID * 2
      newW = Math.round(newW / SIZE_SNAP) * SIZE_SNAP
      newH = Math.round(newH / SIZE_SNAP) * SIZE_SNAP
    }
    newW = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, newW))
    newH = Math.max(NODE_MIN_H, Math.min(NODE_MAX_H, newH))
    sizes.value = { ...sizes.value, [node.id]: { w: newW, h: newH } }
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    // Skip history if size didn't change (a click on the handle).
    const cur = sizes.value[node.id]
    if (!cur || (cur.w === startSize.w && cur.h === startSize.h)) {
      persistSizes()
      return
    }
    // Promote the transient size overlay into persisted `node.size` via
    // a node_edit op, then clear the overlay so the graph wins.
    if (findNodeById(displayedGraph.value, node.id)) {
      const ok = applyStructuralOp({
        kind: 'node_edit',
        node_id: node.id,
        patch: { size: { w: cur.w, h: cur.h } },
      })
      if (ok) {
        const nextSizes = { ...sizes.value }
        delete nextSizes[node.id]
        sizes.value = nextSizes
      }
    }
    persistSizes()
    recordHistory()
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function selectNode(id: string, additive: boolean) {
  const next = new Set(additive ? selected.value : [])
  if (additive && next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const selectionDetailNode = computed<NodeModel | null>(() => {
  if (selected.value.size !== 1) return null
  const id = [...selected.value][0]!
  const n = allNodes.value.find(n => n.id === id) ?? null
  // Start/End are layout anchors, not editable steps — opening the details
  // panel on them would show an empty form and an inapplicable footer.
  if (n?.terminal) return null
  return n
})

// ── Wire selection ─────────────────────────────────────────────────────────
// Clicking a wire (along its visible stroke) selects it; the InfoPanel
// swaps in `WireDetailsForm` so the user can edit label / condition /
// max_iterations. Synthetic Start/End spine wires (id prefix `spine:`)
// aren't selectable — they're layout anchors, not real edges.
const selectedWireId = ref<string | null>(null)

const selectedWire = computed(() => {
  if (!selectedWireId.value) return null
  return findWireById(displayedGraph.value, selectedWireId.value)
})

function selectWire(wireId: string) {
  if (!wireId.startsWith('wire:')) return
  const wId = wireId.slice('wire:'.length)
  if (!findWireById(displayedGraph.value, wId)) return
  selected.value = new Set()
  selectedWireId.value = wId
}

function clearWireSelection() {
  selectedWireId.value = null
}

function deleteSelectedWire() {
  if (!selectedWireId.value) return
  applyStructuralOp({ kind: 'wire_remove', wire_id: selectedWireId.value })
  selectedWireId.value = null
}

// Wire endpoint drag — when a wire is selected, two grip dots appear at its
// attachment points. Dragging one moves THAT end (the other end stays
// anchored): drop on a different node to rewire there; drop on empty space
// to disconnect (the wire is removed entirely).
interface EndpointDragState {
  wireId: string
  movingEnd: 'from' | 'to'        // which end of the wire the user grabbed
  fixedNodeId: string             // the node that stays anchored
  fixedPt: Pt                     // its attachment point (workflow coords)
  fixedSide: Side                 // side of the anchored node the wire leaves from
  currPos: Pt                     // cursor position in workflow coords
  targetId: string | null         // candidate target node, if any
  isDragging: boolean
}
const endpointDrag = ref<EndpointDragState | null>(null)

function onEndpointPointerDown(e: PointerEvent, w: WireGeom, end: 'from' | 'to') {
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  if (!w.selectable) return
  if (!attemptEdit()) return
  const wireId = w.id.slice('wire:'.length)
  const fixedNodeId = end === 'from' ? w.toId : w.fromId
  const fixedPt = end === 'from' ? w.p2 : w.p1
  const fixedSide = end === 'from' ? w.toSide : w.fromSide
  const startWf = screenToWorkflow(e.clientX, e.clientY)
  endpointDrag.value = {
    wireId,
    movingEnd: end,
    fixedNodeId,
    fixedPt,
    fixedSide,
    currPos: startWf,
    targetId: null,
    isDragging: false,
  }
  const screenStartX = e.clientX
  const screenStartY = e.clientY

  function onMove(ev: PointerEvent) {
    if (!endpointDrag.value) return
    const dx = ev.clientX - screenStartX
    const dy = ev.clientY - screenStartY
    const moved = Math.hypot(dx, dy)
    const wfPos = screenToWorkflow(ev.clientX, ev.clientY)
    const isDragging = endpointDrag.value.isDragging || moved >= DRAG_THRESHOLD
    const targetId = isDragging ? findTargetAt(wfPos, endpointDrag.value.fixedNodeId) : null
    endpointDrag.value = { ...endpointDrag.value, currPos: wfPos, isDragging, targetId }
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    commitEndpointDrag()
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function commitEndpointDrag() {
  const drag = endpointDrag.value
  if (!drag) return
  endpointDrag.value = null
  if (!drag.isDragging) return
  const oldWire = findWireById(displayedGraph.value, drag.wireId)
  if (!oldWire) return
  // Empty-space drop → disconnect (remove the edge).
  if (!drag.targetId) {
    applyStructuralOp({ kind: 'wire_remove', wire_id: drag.wireId })
    selectedWireId.value = null
    return
  }
  // Dropped back on the anchored node — that would create a self-loop on
  // the fixed node, which isn't what the user is asking for. No-op.
  if (drag.targetId === drag.fixedNodeId) return
  // Compute the rewired endpoints.
  const newFromId = drag.movingEnd === 'from' ? drag.targetId : drag.fixedNodeId
  const newToId = drag.movingEnd === 'from' ? drag.fixedNodeId : drag.targetId
  // No-op if the user dropped back on the same target node (endpoints
  // unchanged) — avoids a redundant remove/add cycle.
  if (newFromId === oldWire.from_id && newToId === oldWire.to_id) return
  // Refuse duplicates of an existing edge between these endpoints.
  const duplicate = displayedGraph.value.wires.some(
    e => e.id !== drag.wireId && e.from_id === newFromId && e.to_id === newToId,
  )
  if (duplicate) {
    toast.show(t('workflow.duplicateEdgeToast'), 'warning', 4000)
    return
  }
  // Preserve label / condition / max_iterations across the rewire — the
  // user is moving the same logical connection, not authoring a new one.
  const newWire: WorkflowWire = { id: '', from_id: newFromId, to_id: newToId }
  if (oldWire.label) newWire.label = oldWire.label
  if (oldWire.condition) newWire.condition = oldWire.condition
  if (typeof oldWire.max_iterations === 'number' && oldWire.max_iterations > 0) {
    newWire.max_iterations = oldWire.max_iterations
  }
  if (!applyStructuralOp({ kind: 'wire_remove', wire_id: drag.wireId })) return
  applyStructuralOp({ kind: 'wire_add', wire: newWire })
  selectedWireId.value = null
}

// ── Drag node ───────────────────────────────────────────────────────────────
// Document-level move/up handlers (rather than pointer capture) so a fast drag
// that outruns the moving node element keeps tracking — capture-based drag in
// here used to "stick" when the cursor crossed the canvas edge or another
// element repainted under the pointer mid-frame.
const draggingIds = ref<Set<string>>(new Set())

// Node-details panel is opened explicitly via the info button on the
// per-node selection toolbar (or the edit button on the wire toolbar).
// Pointerdown on a node resets this so a click that just moves selection
// doesn't leave a stale panel open. X-close clears selection, which then
// closes the panel via `selectionDetailNode`.
const showNodeDetails = ref(false)

// Drop-target restructuring belonged to the tree model — graph workflows
// have no containers to drop into, so node drags are purely position
// overrides. The `dropTarget` ref and helpers remain as no-op stubs so
// callers can keep their conditional rendering without further surgery.
type DropTarget = null
const dropTarget = ref<DropTarget>(null)

function onNodePointerDown(e: PointerEvent, node: NodeModel) {
  e.stopPropagation()
  if (e.button !== 0) return
  // Editing the canvas while previewing a past version isn't allowed
  // outright — bail out and prompt the user to revert to that version
  // first. Selection state stays untouched so the modal can decide.
  if (!attemptEdit()) return
  // Hide the node-details panel while the pointer is down; only a true
  // click (pointerup without drag movement) re-opens it below.
  showNodeDetails.value = false
  if (!selected.value.has(node.id)) {
    selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey)
  }
  else if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const next = new Set(selected.value)
    next.delete(node.id)
    selected.value = next
    return
  }
  const ids = selected.value.size > 1 ? [...selected.value] : [node.id]
  const origins: Record<string, Pt> = {}
  for (const id of ids) {
    const n = allNodes.value.find(x => x.id === id)
    if (n) origins[id] = nodePos(n)
  }
  const startX = e.clientX
  const startY = e.clientY
  draggingIds.value = new Set(ids)
  // Freeze ONLY the canvas bounds for the duration of the drag. Without
  // this, a node crossing the bounds threshold mid-drag would shift the
  // inner content layer and the rendered position would jump relative
  // to the cursor. Wire sides keep updating live so they re-route as
  // the user moves the node.
  frozenCanvasBounds.value = { ...liveCanvasBounds.value }

  function onMove(ev: PointerEvent) {
    const dx = (ev.clientX - startX) / scale.value
    const dy = (ev.clientY - startY) / scale.value
    const next = { ...overrides.value }
    for (const id of ids) {
      const o = origins[id]
      if (!o) continue
      let nx = o.x + dx
      let ny = o.y + dy
      if (settings.value.snapToGrid) {
        // The visible grid is rendered against `canvasBounds.minX/minY`
        // (the inner content layer translates by those values before
        // scale/offset). Snap relative to that origin so dropped nodes
        // line up with actual grid dots rather than to a phantom grid
        // at workflow (0, 0).
        const cb = canvasBounds.value
        nx = Math.round((nx - cb.minX) / SNAP_GRID) * SNAP_GRID + cb.minX
        ny = Math.round((ny - cb.minY) / SNAP_GRID) * SNAP_GRID + cb.minY
        // After the grid snap, also magnet onto nearby non-dragged nodes
        // so two cards a couple of pixels apart click into alignment
        // (left, centre, or right edge on X; top, centre, bottom on Y).
        // Closest match wins per axis; threshold is generous because a
        // grid snap may already have us within a few units.
        const SNAP_NODE_THRESHOLD = 12
        let bestDX = SNAP_NODE_THRESHOLD + 1
        let bestDY = SNAP_NODE_THRESHOLD + 1
        let snapX = nx
        let snapY = ny
        const selfSize = nodeSize(id)
        for (const other of visibleNodes.value) {
          if (ids.includes(other.id)) continue
          const op = nodePos(other)
          const otherSize = nodeSize(other)
          // X candidates: left, centre, right
          const xCandidates: Array<[number, number]> = [
            [nx, op.x],
            [nx + selfSize.w / 2, op.x + otherSize.w / 2],
            [nx + selfSize.w, op.x + otherSize.w],
          ]
          for (const [self, target] of xCandidates) {
            const d = Math.abs(self - target)
            if (d < bestDX) {
              bestDX = d
              snapX = nx + (target - self)
            }
          }
          // Y candidates: top, centre, bottom
          const yCandidates: Array<[number, number]> = [
            [ny, op.y],
            [ny + selfSize.h / 2, op.y + otherSize.h / 2],
            [ny + selfSize.h, op.y + otherSize.h],
          ]
          for (const [self, target] of yCandidates) {
            const d = Math.abs(self - target)
            if (d < bestDY) {
              bestDY = d
              snapY = ny + (target - self)
            }
          }
        }
        nx = snapX
        ny = snapY
      }
      next[id] = { x: nx, y: ny }
    }
    overrides.value = next
  }
  function onUp() {
    draggingIds.value = new Set()
    // Unfreeze canvas bounds so subsequent renders see fresh values.
    frozenCanvasBounds.value = null
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    // Skip the history entry if nothing actually moved (a click counts as
    // a zero-pixel drag and shouldn't fill the undo stack).
    const moved = ids.filter((id) => {
      const o = origins[id]
      const cur = overrides.value[id]
      return o && cur && (Math.abs(o.x - cur.x) > 0.5 || Math.abs(o.y - cur.y) > 0.5)
    })
    if (moved.length === 0) {
      // No movement — leave any transient `overrides` entries alone;
      // they still match the pre-drag state and are harmless.
      persistOverrides()
      return
    }
    // Promote the transient overrides into persisted `node.position`. Each
    // node_edit op chains off the updated userGraph from the previous op.
    // Once committed, the transient override is no longer needed — the
    // graph carries the position.
    const nextOverrides = { ...overrides.value }
    for (const id of moved) {
      const pos = overrides.value[id]
      if (!pos) continue
      if (!findNodeById(displayedGraph.value, id)) continue
      const ok = applyStructuralOp({
        kind: 'node_edit',
        node_id: id,
        patch: { position: { x: pos.x, y: pos.y } },
      })
      if (ok) delete nextOverrides[id]
    }
    overrides.value = nextOverrides
    persistOverrides()
    recordHistory()
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function isDraggingNode(id: string): boolean {
  return draggingIds.value.has(id)
}

// ── Hover zones ─────────────────────────────────────────────────────────────
// First-in-wins: the first zone the pointer enters claims focus and shows
// its four side-ports. Entering another zone while still inside this one is
// a no-op; the user must leave the current zone (and re-enter another) to
// switch focus. Suppressed during pan / drag so dragging a node past a
// neighbour doesn't flicker its ports.
const activeHoverNodeId = ref<string | null>(null)

function onZoneEnter(id: string) {
  if (isPanning) return
  if (draggingIds.value.size > 0) return
  if (activeHoverNodeId.value === null) {
    activeHoverNodeId.value = id
  }
}

function onZoneLeave(id: string) {
  if (activeHoverNodeId.value === id) {
    activeHoverNodeId.value = null
  }
}

// ── Manual node placement ──────────────────────────────────────────────────
// The "add node" button in the side toolbar starts a placement gesture: a
// faded NODE_W × NODE_H ghost follows the cursor, and the next click in
// the canvas drops the node there. The new node is a real graph node
// (not a canvas-local extra) so it survives reset-layout and shows up in
// save / run / orchestrator state. Escape cancels.
const placingNode = ref<Pt | null>(null)

function startPlacingNode() {
  if (placingNode.value) {
    cancelPlacing()
    return
  }
  if (!attemptEdit()) return
  placingNode.value = { x: 0, y: 0 }
  document.addEventListener('pointermove', onPlacingMove)
  document.addEventListener('click', onPlacingClick, true)
  document.addEventListener('keydown', onPlacingKey)
}

function onPlacingMove(ev: PointerEvent) {
  if (!placingNode.value) return
  const wf = screenToWorkflow(ev.clientX, ev.clientY)
  // Centre the ghost on the cursor so the user's drop point is intuitive.
  placingNode.value = { x: wf.x - NODE_W / 2, y: wf.y - NODE_H / 2 }
}

function onPlacingKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    cancelPlacing()
  }
}

function onPlacingClick(ev: MouseEvent) {
  if (!placingNode.value) return
  const target = ev.target as Element | null
  // Click outside the canvas viewport → cancel without dropping.
  if (!target || !viewportEl.value?.contains(target)) {
    cancelPlacing()
    return
  }
  // Swallow the click so it doesn't bubble into pan / select handlers.
  ev.stopPropagation()
  ev.preventDefault()
  const pos = placingNode.value
  const addOp: WorkflowOp = { kind: 'node_add', node: { id: '' } }
  const result = applyOp(displayedGraph.value, addOp)
  if (!result.ok) {
    toast.show(result.error, 'warning', 4000)
    cancelPlacing()
    return
  }
  const newId = addOp.node.id
  userGraph.value = result.graph
  editedDraft.value = {}
  dirtyNodeIds.value = new Set()
  overrides.value = { ...overrides.value, [newId]: pos }
  persistOverrides()
  scheduleAutoSave()
  selected.value = new Set([newId])
  recordHistory()
  cancelPlacing()
}

function cancelPlacing() {
  placingNode.value = null
  document.removeEventListener('pointermove', onPlacingMove)
  document.removeEventListener('click', onPlacingClick, true)
  document.removeEventListener('keydown', onPlacingKey)
}

// ── Port click → spawn a new linked node ────────────────────────────────────
function spawnFromPort(parent: NodeModel, side: Side) {
  if (!attemptEdit()) return
  const pp = nodePos(parent)
  const ps = nodeSize(parent)
  // Match the ghost-preview positioning: align the spawned NODE_W × NODE_H
  // card to the parent's centre on the axis perpendicular to the port
  // direction. Keeps the spawn predictable — the new node lands exactly
  // where the ghost showed it.
  let x = pp.x + ps.w / 2 - NODE_W / 2
  let y = pp.y + ps.h / 2 - NODE_H / 2
  switch (side) {
    case 'right': x = pp.x + ps.w + SPAWN_GAP; break
    case 'left': x = pp.x - NODE_W - SPAWN_GAP; break
    case 'top': y = pp.y - NODE_H - SPAWN_GAP; break
    case 'bottom': y = pp.y + ps.h + SPAWN_GAP; break
  }
  // Create a real graph node (not a canvas-local "extra"), so it survives
  // reset-layout, gets saved with the version, and is visible to the run
  // executor / orchestrator. The op assigns an id back into op.node.id; we
  // chain an edge_add from the parent so the new node is wired in.
  const addNode: WorkflowOp = { kind: 'node_add', node: { id: '' } }
  const nodeResult = applyOp(displayedGraph.value, addNode)
  if (!nodeResult.ok) {
    toast.show(nodeResult.error, 'warning', 4000)
    return
  }
  const newId = addNode.node.id
  let nextGraph = nodeResult.graph
  // Wire from parent to the new node when the parent is a real graph node;
  // terminals (Start / End) aren't in the persisted graph, so a new node
  // spawned off them is just an entry / exit and gets its spine wire
  // implicitly from the layout.
  if (!parent.terminal && findNodeById(nextGraph, parent.id)) {
    const wireOp: WorkflowOp = {
      kind: 'wire_add',
      wire: { id: '', from_id: parent.id, to_id: newId },
    }
    const wireResult = applyOp(nextGraph, wireOp)
    if (wireResult.ok) nextGraph = wireResult.graph
  }
  userGraph.value = nextGraph
  editedDraft.value = {}
  dirtyNodeIds.value = new Set()
  // Anchor the spawned node at the cursor-relative spawn point via the
  // position-override overlay (the same mechanism drag uses).
  overrides.value = { ...overrides.value, [newId]: { x, y } }
  persistOverrides()
  scheduleAutoSave()
  // Don't force active = new id here — the pointer is still inside the
  // parent's zone, so its pointerleave hasn't fired yet. Forcing active
  // here would leave activeHoverNodeId stuck on the new node when the
  // pointer eventually leaves the parent. Let the natural enter/leave
  // dance pick up focus when the user moves to the spawned node.
  selected.value = new Set([newId])
  recordHistory()
}

// ── Drag-from-port to connect or spawn ──────────────────────────────────────
// A pointerdown on a port starts a tracked gesture. While the pointer stays
// roughly in place and is released on the port, the gesture resolves as a
// click → spawn a new linked node (existing behaviour). If the pointer moves
// past DRAG_THRESHOLD, the gesture upgrades to a drag: a temporary wire
// follows the cursor, and any node whose hover zone the cursor enters is
// flagged as the candidate target. Releasing inside a candidate's zone
// commits the connection between the source and that target. Releasing in
// empty space cancels.
interface ConnectingState {
  fromId: string
  fromSide: Side
  startPos: Pt
  currPos: Pt
  targetId: string | null
  isDragging: boolean
}
const connecting = ref<ConnectingState | null>(null)
const DRAG_THRESHOLD = 4

function screenToWorkflow(clientX: number, clientY: number): Pt {
  if (!viewportEl.value) return { x: 0, y: 0 }
  const rect = viewportEl.value.getBoundingClientRect()
  const vx = clientX - rect.left
  const vy = clientY - rect.top
  return {
    x: (vx - offset.value.x) / scale.value + canvasBounds.value.minX,
    y: (vy - offset.value.y) / scale.value + canvasBounds.value.minY,
  }
}

// Find a connection target by checking which node's *full hover zone* the
// cursor is over. The zone (NODE + HOVER_PAD on each side) is generous on
// purpose: dropping anywhere inside that padded box snaps to the node, so
// users don't have to land precisely on a port to make a connection.
function findTargetAt(wfPos: Pt, excludeId: string): string | null {
  for (const n of visibleNodes.value) {
    if (n.id === excludeId) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    if (
      wfPos.x >= p.x - HOVER_PAD
      && wfPos.x <= p.x + s.w + HOVER_PAD
      && wfPos.y >= p.y - HOVER_PAD
      && wfPos.y <= p.y + s.h + HOVER_PAD
    ) {
      return n.id
    }
  }
  return null
}

function addUserWire(fromId: string, toId: string) {
  if (fromId === toId) return
  // Skip endpoints not present in the graph (e.g. spawn-extra nodes) — wires
  // must connect real graph nodes so the orchestrator + executor see them.
  const fromInGraph = !!findNodeById(displayedGraph.value, fromId)
  const toInGraph = !!findNodeById(displayedGraph.value, toId)
  if (!fromInGraph || !toInGraph) {
    // Fall back to the canvas-local userWires (legacy localStorage track),
    // so spawn-extras keep working without touching the persisted graph.
    if (allWires.value.some(w => w.fromId === fromId && w.toId === toId)) return
    const id = `user:${fromId}->${toId}-${Date.now()}`
    userWires.value = [...userWires.value, { id, fromId, toId }]
    persistUserWires()
    recordHistory()
    return
  }
  // Skip exact duplicates on the persisted graph.
  if (displayedGraph.value.wires.some(e => e.from_id === fromId && e.to_id === toId)) return
  // Persist via the structural-op path so the new wire survives reloads and
  // shows up in the orchestrator's draft.
  const wire = {
    id: '',
    from_id: fromId,
    to_id: toId,
  }
  applyStructuralOp({ kind: 'wire_add', wire })
}

function onPortPointerDown(e: PointerEvent, parent: NodeModel, side: Side) {
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  portPreview.value = null
  const pp = nodePos(parent)
  const port = pointOnSide(pp, side, nodeSize(parent))
  connecting.value = {
    fromId: parent.id,
    fromSide: side,
    startPos: port,
    currPos: port,
    targetId: null,
    isDragging: false,
  }
  const screenStartX = e.clientX
  const screenStartY = e.clientY

  function onMove(ev: PointerEvent) {
    if (!connecting.value) return
    const dx = ev.clientX - screenStartX
    const dy = ev.clientY - screenStartY
    const moved = Math.hypot(dx, dy)
    const wfPos = screenToWorkflow(ev.clientX, ev.clientY)
    const isDragging = connecting.value.isDragging || moved >= DRAG_THRESHOLD
    const targetId = isDragging ? findTargetAt(wfPos, connecting.value.fromId) : null
    connecting.value = {
      ...connecting.value,
      currPos: wfPos,
      isDragging,
      targetId,
    }
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    if (!connecting.value) {
      return
    }
    if (connecting.value.isDragging) {
      if (connecting.value.targetId) {
        addUserWire(connecting.value.fromId, connecting.value.targetId)
      }
    }
    else {
      // Treat as a click → existing spawn behaviour.
      spawnFromPort(parent, side)
    }
    connecting.value = null
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

// Hover-preview a click on a port: while the pointer hovers a port (and
// no connect drag is in progress), we render a faded ghost of the node
// that would be spawned by clicking, plus a faded ghost wire from the
// parent to it. Cleared on pointerleave or when a real gesture begins.
const portPreview = ref<{ nodeId: string; side: Side } | null>(null)

function onPortHover(parent: NodeModel, side: Side) {
  if (connecting.value !== null) return
  portPreview.value = { nodeId: parent.id, side }
}

function onPortLeave(parent: NodeModel, side: Side) {
  if (
    portPreview.value
    && portPreview.value.nodeId === parent.id
    && portPreview.value.side === side
  ) {
    portPreview.value = null
  }
}

const ghostPreview = computed(() => {
  if (!portPreview.value) return null
  const pp = portPreview.value
  const parent = allNodes.value.find(n => n.id === pp.nodeId)
  if (!parent) return null
  const ppos = nodePos(parent)
  const psize = nodeSize(parent)
  // The ghost previews a fresh NODE_W × NODE_H card. Align it to the
  // parent's CENTRE on the axis perpendicular to the port direction so a
  // left/right spawn shares the parent's vertical centre, and a top/bottom
  // spawn shares the parent's horizontal centre.
  const centreAlignedX = ppos.x + psize.w / 2 - NODE_W / 2
  const centreAlignedY = ppos.y + psize.h / 2 - NODE_H / 2
  let x = centreAlignedX
  let y = centreAlignedY
  switch (pp.side) {
    case 'right': x = ppos.x + psize.w + SPAWN_GAP; break
    case 'left': x = ppos.x - NODE_W - SPAWN_GAP; break
    case 'top': y = ppos.y - NODE_H - SPAWN_GAP; break
    case 'bottom': y = ppos.y + psize.h + SPAWN_GAP; break
  }
  return { parent, pos: { x, y }, side: pp.side }
})

const ghostWireGeom = computed<{ d: string } | null>(() => {
  const g = ghostPreview.value
  if (!g) return null
  const pa = nodePos(g.parent)
  const pb = g.pos
  const sides = chooseSides(pa, pb)
  const p1 = pointOnSide(pa, sides.from, nodeSize(g.parent))
  const p2 = pointOnSide(pb, sides.to)
  const wt = settings.value.wireType ?? 'fluid'
  return {
    d: buildWirePath(p1, p2, sides.from, sides.to, wt),
  }
})

// Live geometry for the rubber-band wire that follows the cursor while the
// user is dragging from a port. Snaps onto the target's nearest side once
// a candidate target is locked in.
const tempWireGeom = computed<{ d: string } | null>(() => {
  if (!connecting.value || !connecting.value.isDragging) return null
  const c = connecting.value
  const sourcePort = c.startPos

  let endPort: Pt
  let targetSide: Side
  const target = c.targetId ? allNodes.value.find(n => n.id === c.targetId) : null
  if (target) {
    const tp = nodePos(target)
    const ts = nodeSize(target)
    const tCenter = { x: tp.x + ts.w / 2, y: tp.y + ts.h / 2 }
    const ddx = tCenter.x - sourcePort.x
    const ddy = tCenter.y - sourcePort.y
    if (Math.abs(ddx) >= Math.abs(ddy)) {
      targetSide = ddx >= 0 ? 'left' : 'right'
    }
    else {
      targetSide = ddy >= 0 ? 'top' : 'bottom'
    }
    endPort = pointOnSide(tp, targetSide, ts)
  }
  else {
    // Free cursor — treat the cursor as arriving opposite the source's
    // outward normal so the preview's shape reads naturally for every
    // wire style (especially step's orthogonal routing).
    endPort = c.currPos
    targetSide = oppositeSide(c.fromSide)
  }
  const wt = settings.value.wireType ?? 'fluid'
  return {
    d: buildWirePath(sourcePort, endPort, c.fromSide, targetSide, wt),
  }
})

// Preview wire for an in-flight endpoint drag — anchored on the fixed end
// of the existing edge, the other end follows the cursor (snapping to the
// candidate target node if one is under the cursor).
const endpointDragWireGeom = computed<{ d: string } | null>(() => {
  const drag = endpointDrag.value
  if (!drag || !drag.isDragging) return null
  let endPt: Pt
  let endSide: Side
  const target = drag.targetId ? allNodes.value.find(n => n.id === drag.targetId) : null
  if (target) {
    const tp = nodePos(target)
    const ts = nodeSize(target)
    const tCenter = { x: tp.x + ts.w / 2, y: tp.y + ts.h / 2 }
    const ddx = tCenter.x - drag.fixedPt.x
    const ddy = tCenter.y - drag.fixedPt.y
    if (Math.abs(ddx) >= Math.abs(ddy)) {
      endSide = ddx >= 0 ? 'left' : 'right'
    }
    else {
      endSide = ddy >= 0 ? 'top' : 'bottom'
    }
    endPt = pointOnSide(tp, endSide, ts)
  }
  else {
    endPt = drag.currPos
    endSide = oppositeSide(drag.fixedSide)
  }
  const wt = settings.value.wireType ?? 'fluid'
  // The path direction follows the original edge: if the user is moving
  // the FROM end, the temp goes endPt → fixedPt; if moving TO, fixedPt → endPt.
  if (drag.movingEnd === 'from') {
    return { d: buildWirePath(endPt, drag.fixedPt, endSide, drag.fixedSide, wt) }
  }
  return { d: buildWirePath(drag.fixedPt, endPt, drag.fixedSide, endSide, wt) }
})

// ── Wires ──────────────────────────────────────────────────────────────────
// Each wire picks the nearest side of its source and target nodes so the
// connection always reads as the shortest natural arc — bottom→top for a
// vertical chain, right→left for a horizontal one, or a corner-to-corner
// curve for diagonals. The bezier control handles are pushed *away* from
// each port along its outward normal, which makes the curve enter and leave
// each node perpendicular to the chosen edge instead of clipping the corner.
type WireType = 'fluid' | 'linear' | 'step'
type Side = 'top' | 'bottom' | 'left' | 'right'

function pointOnSide(pos: Pt, side: Side, size: Size = { w: NODE_W, h: NODE_H }): Pt {
  switch (side) {
    case 'right': return { x: pos.x + size.w, y: pos.y + size.h / 2 }
    case 'left': return { x: pos.x, y: pos.y + size.h / 2 }
    case 'top': return { x: pos.x + size.w / 2, y: pos.y }
    case 'bottom': return { x: pos.x + size.w / 2, y: pos.y + size.h }
  }
}

function outwardNormal(side: Side): Pt {
  switch (side) {
    case 'right': return { x: 1, y: 0 }
    case 'left': return { x: -1, y: 0 }
    case 'top': return { x: 0, y: -1 }
    case 'bottom': return { x: 0, y: 1 }
  }
}

function chooseSides(a: Pt, b: Pt): { from: Side; to: Side } {
  // Compare the centers of A and B. The dominant axis (whichever delta is
  // larger) wins, so two nodes that are mostly above-below connect via
  // top/bottom; two that are mostly left-right use left/right. Used by the
  // rubber-band drag preview; final wire rendering goes through
  // nodeSidePrefs below so that incoming and outgoing wires on the same
  // node always sit on different sides.
  const ac = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 }
  const bc = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 }
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
}

function oppositeSide(s: Side): Side {
  switch (s) {
    case 'top': return 'bottom'
    case 'bottom': return 'top'
    case 'left': return 'right'
    case 'right': return 'left'
  }
}

function centerOf(node: NodeModel): Pt {
  const p = nodePos(node)
  const s = nodeSize(node)
  return { x: p.x + s.w / 2, y: p.y + s.h / 2 }
}

// Rank the four sides of a node from "best matches the (dx, dy) direction"
// down to "least matches it". The dominant axis (whichever delta is
// larger) gives the primary side; the perpendicular axis gives the
// secondary; the opposites of those round out the list. Used as a stable
// tiebreaker when several side pairs produce the same bend count.
function rankSides(dx: number, dy: number): Side[] {
  const xSide: Side = dx >= 0 ? 'right' : 'left'
  const ySide: Side = dy >= 0 ? 'bottom' : 'top'
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [xSide, ySide, oppositeSide(ySide), oppositeSide(xSide)]
  }
  return [ySide, xSide, oppositeSide(xSide), oppositeSide(ySide)]
}

function sideAxis(s: Side): 'h' | 'v' {
  return (s === 'left' || s === 'right') ? 'h' : 'v'
}

// Bend count and directional feasibility for the orthogonal step route
// between two ports. `feasible` is true when every leg of the path leaves
// the source outward and enters the target inward — i.e. the wire does
// not have to fold back across its own port to reach the corner.
function pathInfo(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side,
): { bends: number; feasible: boolean } {
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const sx = dx === 0 ? 0 : Math.sign(dx)
  const sy = dy === 0 ? 0 : Math.sign(dy)
  if (sideAxis(fromSide) === sideAxis(toSide)) {
    // Same axis: 0-bend straight if collinear, else 2-bend midpoint S.
    if (sideAxis(fromSide) === 'h') {
      const facing = n1.x === -n2.x
      const departOk = sx === n1.x || sx === 0
      return { bends: p1.y === p2.y ? 0 : 2, feasible: facing && departOk }
    }
    const facing = n1.y === -n2.y
    const departOk = sy === n1.y || sy === 0
    return { bends: p1.x === p2.x ? 0 : 2, feasible: facing && departOk }
  }
  // Mixed axes: 1-bend L. Leg 1 lies along fromAxis, leg 2 along toAxis.
  // Strict here — a zero-length leg means the side isn't really emitting
  // in its outward direction (e.g. A's right port firing straight down
  // because the target sits exactly below), which reads as the wrong side.
  let leg1: boolean, leg2: boolean
  if (sideAxis(fromSide) === 'h') {
    leg1 = sx === n1.x
    leg2 = sy === -n2.y
  } else {
    leg1 = sy === n1.y
    leg2 = sx === -n2.x
  }
  return { bends: 1, feasible: leg1 && leg2 }
}

const ALL_SIDES: Side[] = ['right', 'bottom', 'left', 'top']

// Per-wire side assignment. Picks the (fromSide, toSide) pair lexicographically:
//   1. Prefer non-backtracking routes (legs leave the source outward and
//      enter the target inward).
//   2. Then minimise the number of 90° bends — 0 if the ports are collinear
//      on a shared axis, 1 for an L-shape, 2 for a same-axis midpoint route.
//   3. Then minimise the straight-line distance between the two ports, so
//      the wire always lands on the side closest to the other node.
//   4. Final tiebreaker uses rankSides so a perfectly symmetric layout
//      prefers the side that faces the dominant axis.
// Structural constraint: on a single node, no incoming wire shares a side
// with any outgoing wire.
//
// Recomputes live as nodes move — including during an active drag — so
// the wires re-route in real time to follow the dragged node's new
// position.
const wireSidesMap = computed<Map<string, { fromSide: Side; toSide: Side }>>(() => {
  const result = new Map<string, { fromSide: Side; toSide: Side }>()
  const nodeMap = new Map(allNodes.value.map(n => [n.id, n]))
  const inSidesByNode = new Map<string, Set<Side>>()
  const outSidesByNode = new Map<string, Set<Side>>()

  // Process wires in a deterministic order so the assignment is stable
  // across recomputes — straight-line (axis-aligned) connections first,
  // since they have the strongest preference for their primary side and
  // we don't want them displaced by diagonals processed earlier.
  const wires = [...allWires.value].sort((a, b) => {
    const aa = nodeMap.get(a.fromId)
    const ab = nodeMap.get(a.toId)
    const ba = nodeMap.get(b.fromId)
    const bb = nodeMap.get(b.toId)
    if (!aa || !ab || !ba || !bb) return 0
    const aDx = Math.abs(centerOf(ab).x - centerOf(aa).x)
    const aDy = Math.abs(centerOf(ab).y - centerOf(aa).y)
    const bDx = Math.abs(centerOf(bb).x - centerOf(ba).x)
    const bDy = Math.abs(centerOf(bb).y - centerOf(ba).y)
    // Strength = ratio of dominant to secondary axis; high = very straight.
    const aStrength = Math.max(aDx, aDy) / Math.max(1, Math.min(aDx, aDy))
    const bStrength = Math.max(bDx, bDy) / Math.max(1, Math.min(bDx, bDy))
    return bStrength - aStrength
  })

  for (const w of wires) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    if (!a || !b) continue
    const pa = nodePos(a)
    const pb = nodePos(b)
    const ac = centerOf(a)
    const bc = centerOf(b)
    const dx = bc.x - ac.x
    const dy = bc.y - ac.y
    const aRanking = rankSides(dx, dy)
    const bRanking = rankSides(-dx, -dy)
    const forbidFrom = inSidesByNode.get(a.id)
    const forbidTo = outSidesByNode.get(b.id)

    let aCandidates = ALL_SIDES.filter(s => !forbidFrom?.has(s))
    let bCandidates = ALL_SIDES.filter(s => !forbidTo?.has(s))
    if (aCandidates.length === 0) aCandidates = ALL_SIDES
    if (bCandidates.length === 0) bCandidates = ALL_SIDES

    let bestScore = Infinity
    let bestFrom: Side = aCandidates[0]!
    let bestTo: Side = bCandidates[0]!
    const sa = nodeSize(a)
    const sb = nodeSize(b)
    for (const fromSide of aCandidates) {
      const p1 = pointOnSide(pa, fromSide, sa)
      for (const toSide of bCandidates) {
        const p2 = pointOnSide(pb, toSide, sb)
        const info = pathInfo(p1, p2, fromSide, toSide)
        const ex = p2.x - p1.x
        const ey = p2.y - p1.y
        const dist2 = ex * ex + ey * ey
        // Lexicographic score: feasibility ≫ bends ≫ port distance ≫ rank.
        const score
          = (info.feasible ? 0 : 1e15)
            + info.bends * 1e9
            + dist2 * 100
            + bRanking.indexOf(toSide) * 10
            + aRanking.indexOf(fromSide)
        if (score < bestScore) {
          bestScore = score
          bestFrom = fromSide
          bestTo = toSide
        }
      }
    }

    if (!outSidesByNode.has(a.id)) outSidesByNode.set(a.id, new Set())
    outSidesByNode.get(a.id)!.add(bestFrom)
    if (!inSidesByNode.has(b.id)) inSidesByNode.set(b.id, new Set())
    inSidesByNode.get(b.id)!.add(bestTo)
    result.set(w.id, { fromSide: bestFrom, toSide: bestTo })
  }
  return result
})

interface WireGeom {
  id: string
  d: string
  mid: Pt
  selectable: boolean
  fromId: string
  toId: string
  // Endpoint coords + sides — used by the wire selection UI so the
  // endpoint-drag handles know where to render and which side they
  // are anchored to.
  p1: Pt
  p2: Pt
  fromSide: Side
  toSide: Side
}

function buildWirePath(p1: Pt, p2: Pt, fromSide: Side, toSide: Side, wireType: WireType): string {
  if (wireType === 'linear') {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  }

  if (wireType === 'step') {
    // Orthogonal (right-angle) path with curved corners.
    // Route: depart from p1 along its outward normal, travel horizontally or
    // vertically to an intermediate row/column, then arrive at p2 along its
    // inward normal.  Every corner is a quadratic bezier for a smooth turn.
    const n1 = outwardNormal(fromSide)
    const n2 = outwardNormal(toSide)
    const R = 12 // corner radius

    // Compute the midpoint where the two legs of the path should meet.
    // For horizontal departures we route at a shared X; for vertical at a shared Y.
    const isFromHorizontal = fromSide === 'left' || fromSide === 'right'
    const isToHorizontal = toSide === 'left' || toSide === 'right'

    const pts: Pt[] = [{ ...p1 }]

    if (isFromHorizontal && isToHorizontal) {
      // Both horizontal — route through a shared vertical axis at the midpoint X.
      const mx = (p1.x + p2.x) / 2
      pts.push({ x: mx, y: p1.y })
      pts.push({ x: mx, y: p2.y })
    } else if (!isFromHorizontal && !isToHorizontal) {
      // Both vertical — route through a shared horizontal axis at the midpoint Y.
      const my = (p1.y + p2.y) / 2
      pts.push({ x: p1.x, y: my })
      pts.push({ x: p2.x, y: my })
    } else if (isFromHorizontal) {
      // From horizontal, to vertical — route to target's X along p1's Y, then down/up to p2.
      pts.push({ x: p2.x, y: p1.y })
    } else {
      // From vertical, to horizontal — route to p2's Y along p1's X, then across to p2.
      pts.push({ x: p1.x, y: p2.y })
    }

    pts.push({ ...p2 })

    // Build path with rounded corners using quadratic bezier arcs.
    // For each intermediate point we round the corner with a Q command.
    if (pts.length <= 2) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`

    let d = `M ${pts[0]!.x} ${pts[0]!.y}`
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1]!
      const curr = pts[i]!
      const next = pts[i + 1]!
      // Vector from curr toward prev and toward next
      const v1x = prev.x - curr.x
      const v1y = prev.y - curr.y
      const v2x = next.x - curr.x
      const v2y = next.y - curr.y
      const len1 = Math.max(1, Math.hypot(v1x, v1y))
      const len2 = Math.max(1, Math.hypot(v2x, v2y))
      const r = Math.min(R, len1 / 2, len2 / 2)
      // Start of the arc (r pixels before the corner along the incoming leg)
      const ax = curr.x + (v1x / len1) * r
      const ay = curr.y + (v1y / len1) * r
      // End of the arc (r pixels after the corner along the outgoing leg)
      const bx = curr.x + (v2x / len2) * r
      const by = curr.y + (v2y / len2) * r
      d += ` L ${ax} ${ay} Q ${curr.x} ${curr.y}, ${bx} ${by}`
    }
    const last = pts[pts.length - 1]!
    d += ` L ${last.x} ${last.y}`
    return d
  }

  // Default: fluid (cubic bezier)
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const dist = Math.max(40, Math.min(180, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5))
  const c1 = { x: p1.x + n1.x * dist, y: p1.y + n1.y * dist }
  const c2 = { x: p2.x + n2.x * dist, y: p2.y + n2.y * dist }
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`
}

const wireGeoms = computed<WireGeom[]>(() => {
  const out: WireGeom[] = []
  const nodeMap = new Map(allNodes.value.map(n => [n.id, n]))
  const sides = wireSidesMap.value
  // Edges indexed by id so a persisted `from_side` / `to_side` overrides
  // the auto-pick below. Spine + extra wires are absent here and fall
  // through to the auto-picked sides.
  const wiresById = new Map<string, WorkflowWire>(
    displayedGraph.value.wires.map(e => [e.id, e]),
  )
  const wt = settings.value.wireType ?? 'fluid'
  for (const w of allWires.value) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    if (!a || !b) continue
    const pa = nodePos(a)
    const pb = nodePos(b)
    const assigned = sides.get(w.id)
    const persistedEdge = w.id.startsWith('wire:')
      ? wiresById.get(w.id.slice('wire:'.length))
      : undefined
    const fromSide: Side = persistedEdge?.from_side ?? assigned?.fromSide ?? 'right'
    const toSide: Side = persistedEdge?.to_side ?? assigned?.toSide ?? 'left'
    const sa = nodeSize(a)
    const sb = nodeSize(b)
    const p1 = pointOnSide(pa, fromSide, sa)
    const p2 = pointOnSide(pb, toSide, sb)
    // Geometric midpoint between the two attachment points — used to anchor
    // the wire-selection toolbar above each editable edge.
    const mid: Pt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    // Only real graph edges (wire:<edgeId>) are user-selectable. Spine
    // wires (Start/End anchors) and extras (`u:`) aren't editable.
    const selectable = w.id.startsWith('wire:')
    out.push({
      id: w.id,
      d: buildWirePath(p1, p2, fromSide, toSide, wt),
      mid,
      selectable,
      fromId: w.fromId,
      toId: w.toId,
      p1,
      p2,
      fromSide,
      toSide,
    })
  }
  return out
})

// ── Actions ────────────────────────────────────────────────────────────────

function nodeTitle(n: NodeModel) {
  const s = n.node
  if (n.terminal === 'start') return t('workflow.startNode')
  if (n.terminal === 'end') return t('workflow.endNode')
  if (s.description) return s.description
  if (s.action && s.target) return `${s.action} → ${s.target}`
  if (s.action) return s.action
  return t('workflow.untitledNode')
}

function isTerminalId(id: string): boolean {
  return allNodes.value.find(n => n.id === id)?.terminal != null
}

async function rerunSelected() {
  if (selected.value.size === 0) return
  if (!selectedWorkflowId.value) {
    toast.show(t('workflow.runFailedToast'), 'error', 3000)
    return
  }
  // Terminals (Start / End) are graph anchors, not real steps — skip them when
  // picking a resume point.
  const id = [...selected.value].find(x => !isTerminalId(x))
  if (!id) return
  await runFromNodeId(id)
}

// Hover-button counterpart to `rerunSelected`: starts a fresh run that
// skips every node before `node` in DFS order. Takes the node directly so
// the user doesn't have to first select it; surfaces the same error toast
// as the footer action on failure.
async function rerunFromNode(node: NodeModel) {
  if (node.terminal) return
  if (!selectedWorkflowId.value) {
    toast.show(t('workflow.runFailedToast'), 'error', 3000)
    return
  }
  await runFromNodeId(node.id)
}

async function runFromNodeId(nodeId: string) {
  if (!selectedWorkflowId.value) return
  const r = await startRun(workspaceId.value, selectedWorkflowId.value, {
    session_id: props.sessionId,
    resume_from_node_id: nodeId,
  })
  if ('error' in r) toast.show(`${t('workflow.runFailedToast')}: ${r.error}`, 'error', 5000)
}

function nodeRunStatus(id: string): string | null {
  if (!workflowRun) return null
  return workflowRun.nodeStates.value[id]?.status ?? null
}

function deleteSelected() {
  if (selected.value.size === 0) return
  // Terminals can't be removed — the spine always needs a Start and End.
  // Locked nodes are also excluded so a stray Delete keystroke doesn't
  // strip a pinned step.
  const deletable = [...selected.value].filter(id => !isTerminalId(id) && !isLockedNode(id))
  if (deletable.length === 0) return
  if (!attemptEdit()) return
  // Clear any transient drag-preview entries for the deleted ids.
  const next = { ...overrides.value }
  for (const id of deletable) delete next[id]
  overrides.value = next
  // Drop user wires that referenced any removed node — otherwise they'd
  // dangle on save-time promotion.
  const deletableSet = new Set(deletable)
  const remainingUserWires = userWires.value.filter(
    w => !deletableSet.has(w.fromId) && !deletableSet.has(w.toId),
  )
  if (remainingUserWires.length !== userWires.value.length) {
    userWires.value = remainingUserWires
    persistUserWires()
  }
  // Layout-derived graph nodes get hidden (the canvas masks them); a
  // proper graph removal goes through `node_remove` via the per-node
  // toolbar.
  hidden.value = new Set([...hidden.value, ...deletable])
  selected.value = new Set()
  persistOverrides()
  recordHistory()
}

const hidden = ref<Set<string>>(new Set())

const visibleNodes = computed(() => allNodes.value.filter(n => !hidden.value.has(n.id)))
const visibleWires = computed(() => wireGeoms.value.filter(w => !hidden.value.has(w.fromId) && !hidden.value.has(w.toId)))

// ── Layout actions ──────────────────────────────────────────────────────────
const hasOverrides = computed(
  () => Object.keys(overrides.value).length > 0
    || userWires.value.length > 0,
)

function resetLayout() {
  // Only clear LAYOUT state — positions and visibility. Don't touch the
  // user's actual content (extras / user wires / persisted graph nodes),
  // since "reset layout" is meant to re-run the auto-layout, not delete
  // anything the user authored.
  overrides.value = {}
  hidden.value = new Set()
  persistOverrides()
  recordHistory()
  nextTick(fitToView)
}

// ── Save / Run / History (workflow actions) ─────────────────────────────────
// Save / run / inspect the underlying workflow on the backend rather than
// the canvas-local sketch (extras, user wires, position overrides). The
// canvas Save commits the current `displayedSteps` (live draft if the
// orchestrator has one, otherwise the loaded version) as a new version;
// Run launches a fresh run; History opens the existing version drawer.
const saving = ref(false)
const running = ref(false)
const historyOpen = ref(false)
const loadingHistory = ref(false)
const selectedVersionId = ref<string | null>(null)

// Sync `previewedVersion` (forward-declared earlier so `displayedSteps`
// can read it during setup) from the canonical selection state. When a
// version is picked in the history drawer, the canvas re-renders to
// preview that version's steps; clearing the selection drops back to the
// live draft / loaded version.
watch([selectedVersionId, versions], ([id, vs]) => {
  if (!id) {
    previewedVersion.value = null
    return
  }
  previewedVersion.value = vs.find(v => v.id === id) ?? null
}, { immediate: true })

const inPreviewMode = computed(() => !!previewedVersion.value)

// Save is gated when there's nothing new to commit: no workflow loaded,
// no nodes, mid-save, previewing a past version, or — most subtly — the
// currently displayed graph serialises the same as the latest saved
// version (so a no-op save would just duplicate the head version).
//
// The signature is canonical: node/edge order, optional-field presence,
// and empty-vs-undefined are all normalised so two graphs that render
// the same can't disagree on the hash. Canvas-local concerns that
// don't affect the persisted graph — zoom, pan, position overrides,
// selection — are deliberately NOT part of the signature, so a user
// who just zooms the canvas won't see Save light up.
function canonicalNode(n: WorkflowNode): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id }
  if (n.description) out.description = n.description
  if (n.action) out.action = n.action
  if (n.target) out.target = n.target
  if (n.value) out.value = n.value
  if (n.annotation) out.annotation = n.annotation
  // Position / size are persisted now — include them in the signature so
  // dragging a node correctly enables Save. Round so micro-jitter from
  // floating-point math doesn't false-positive a change.
  if (n.position) out.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
  if (n.size) out.size = { w: Math.round(n.size.w), h: Math.round(n.size.h) }
  return out
}

function canonicalWire(e: WorkflowWire): Record<string, unknown> {
  const out: Record<string, unknown> = { id: e.id, from_id: e.from_id, to_id: e.to_id }
  if (e.label) out.label = e.label
  if (e.condition) out.condition = e.condition
  if (typeof e.max_iterations === 'number' && e.max_iterations > 0) {
    out.max_iterations = e.max_iterations
  }
  if (e.from_side) out.from_side = e.from_side
  if (e.to_side) out.to_side = e.to_side
  return out
}

function graphSignature(graph: WorkflowGraph | undefined | null): string {
  if (!graph || graph.nodes.length === 0) return '{"nodes":[],"wires":[]}'
  const nodes = graph.nodes.map(canonicalNode).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const wires = graph.wires.map(canonicalWire).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return JSON.stringify({ nodes, wires })
}

const canSave = computed(() => {
  if (!selectedWorkflowId.value) return false
  if (saving.value) return false
  if (inPreviewMode.value) return false
  const current = displayedGraph.value
  if (current.nodes.length === 0) return false
  if (graphSignature(current) === graphSignature(loadedGraph.value)) return false
  return true
})

// Confirm-modal state. Two flows share the same modal shell:
//   1. Revert (existing) — the user tries to edit the canvas while
//      previewing a past version; we surface this modal so they
//      acknowledge that confirming will swap the live draft for the
//      previewed version's steps. No server mutation.
//   2. Reset (new) — the user clicks the per-row reset icon in the
//      history drawer. Confirming hits the server to DELETE every
//      version strictly newer than the target (destructive, hence the
//      stronger copy) and then swaps the local draft to the target.
// `resetTargetVersion` is non-null only for the reset flow; the modal
// branches on it for both copy and confirm-handler dispatch.
const revertModalOpen = ref(false)
const resetTargetVersion = ref<WorkflowVersion | null>(null)
const resetInFlight = ref(false)

function attemptEdit(): boolean {
  if (!inPreviewMode.value) return true
  resetTargetVersion.value = null
  revertModalOpen.value = true
  return false
}

function onHistoryResetRequest(versionId: string) {
  const v = versions.value.find(x => x.id === versionId)
  if (!v) return
  resetTargetVersion.value = v
  revertModalOpen.value = true
}

// Modal title/body/confirm read from this — keeps the template branchless.
const modalVersionForCopy = computed(() => resetTargetVersion.value ?? previewedVersion.value)
const isResetFlow = computed(() => !!resetTargetVersion.value)

function applyVersionToCanvas(v: WorkflowVersion) {
  // Replace the live draft with the version's graph and clear canvas-local
  // sketch state (drag overlays, user wires) — they referenced node ids
  // from a different snapshot and would dangle.
  const g = v.steps as WorkflowGraph | undefined
  draftGraph.value = (g && Array.isArray(g.nodes)) ? g : emptyGraph()
  overrides.value = {}
  userWires.value = []
  hidden.value = new Set()
  selected.value = new Set()
  selectedVersionId.value = null
  persistOverrides()
  persistUserWires()
  recordHistory()
}

async function confirmRevert() {
  // Reset flow: delete every newer version on the server, then swap the
  // local draft. The list filter inside resetToVersion already trimmed
  // versions.value to <= target, so latestVersionId/Number watchers will
  // realign on the next tick.
  if (resetTargetVersion.value) {
    if (!workspaceId.value || !selectedWorkflowId.value || resetInFlight.value) {
      revertModalOpen.value = false
      resetTargetVersion.value = null
      return
    }
    resetInFlight.value = true
    try {
      const target = resetTargetVersion.value
      const result = await resetToVersion(workspaceId.value, selectedWorkflowId.value, target.id)
      if ('error' in result) {
        toast.show(`${t('workflow.resetFailedToast')}: ${result.error}`, 'error', 5000)
        return
      }
      applyVersionToCanvas(result.version)
      // The target is now the latest saved version on the server — realign the
      // optimistic-locking baseline so the next save passes the correct
      // expected_version, and update `loadedSteps` so the dirty check no
      // longer reads the canvas as having "unsaved" changes.
      latestVersionId.value = result.version.id
      latestVersionNumber.value = result.version.version
      const g = result.version.steps as WorkflowGraph | undefined
      loadedGraph.value = (g && Array.isArray(g.nodes)) ? g : emptyGraph()
      toast.show(t('workflow.resetSucceededToast'), 'info', 3000)
    }
    finally {
      resetInFlight.value = false
      revertModalOpen.value = false
      resetTargetVersion.value = null
    }
    return
  }

  // Revert flow (existing): purely local — just swap to the previewed
  // version. No server mutation; saved-version history is untouched.
  const v = previewedVersion.value
  if (!v) {
    revertModalOpen.value = false
    return
  }
  applyVersionToCanvas(v)
  revertModalOpen.value = false
}

function cancelRevert() {
  revertModalOpen.value = false
  resetTargetVersion.value = null
}

// "Live" row shown at the top of the history drawer when the in-canvas
// state isn't yet a saved version: either the orchestrator is producing a
// draft for a workflow that hasn't been saved at all (agent-draft), or
// there's a draft / local canvas edit sitting on top of an already-saved
// workflow that the user hasn't committed yet (user-unsaved). Suppressed
// only when the draft matches the latest saved version AND there are no
// local edits — at that point the "current view" is exactly the saved
// version, so the history list rings its row instead of stacking a
// redundant draft entry.
const liveEntry = computed<LiveHistoryEntry | null>(() => {
  const graphDiffers = draftGraph.value.nodes.length > 0
    && graphSignature(draftGraph.value) !== graphSignature(loadedGraph.value)
  const hasLocalEdits = hasOverrides.value
  if (!graphDiffers && !hasLocalEdits) return null
  return { kind: selectedWorkflowId.value ? 'user-unsaved' : 'agent-draft' }
})
const canRun = computed(() => !!selectedWorkflowId.value && !running.value)

async function onSave() {
  if (!canSave.value || !selectedWorkflowId.value) return
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  promoteUserWires()
  saving.value = true
  const snapshotDirty = new Set(dirtyNodeIds.value)
  const hadUserGraph = userGraph.value != null
  try {
    const created = await createVersion(workspaceId.value, selectedWorkflowId.value, {
      steps: displayedGraph.value,
      expected_version: latestVersionNumber.value,
      source: 'user',
      impact_level: 'preference',
      locked_node_ids: [...lockedNodeIds.value],
    })
    if (created) {
      toast.show(t('workflow.savedToast'), 'info', 3000)
      // Re-pull the workflow so latestVersionNumber updates and the next
      // save passes the correct expected_version.
      await loadSelected()
      clearEditedSnapshot(snapshotDirty)
      if (hadUserGraph) userGraph.value = null
      lockSetDirty = false
    }
  }
  catch (err: unknown) {
    if (err instanceof VersionConflictError) {
      toast.show(t('workflow.versionConflictToast'), 'warning', 6000)
      await loadSelected()
    }
    else {
      toast.show(t('workflow.saveFailedToast'), 'error', 4000)
    }
  }
  finally {
    saving.value = false
  }
}

// ── Per-node edits + autosave ──────────────────────────────────────────────
// Form-driven node edits land in `editedDraft` and are overlaid on the live
// tree via `displayedSteps`. A 1s debounce posts each batch of dirty nodes as
// a new version through the existing createVersion path; conflict + failure
// surface via the same toasts as manual save.

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
// Lock toggles count as save-worthy edits independent of dirtyNodeIds, so a
// pure lock change still produces a new version on disk. Cleared on save.
let lockSetDirty = false

function clearEditedSnapshot(ids: Set<string>) {
  if (ids.size === 0) return
  const nextDraft = { ...editedDraft.value }
  const nextDirty = new Set(dirtyNodeIds.value)
  for (const id of ids) {
    delete nextDraft[id]
    nextDirty.delete(id)
  }
  editedDraft.value = nextDraft
  dirtyNodeIds.value = nextDirty
}

function onNodePatch(nodeId: string, patch: Partial<WorkflowNode>) {
  if (!attemptEdit()) return
  if (isLockedNode(nodeId)) {
    toast.show(t('workflow.lockedToast'), 'warning', 3000)
    return
  }
  const prev = editedDraft.value[nodeId] ?? {}
  editedDraft.value = { ...editedDraft.value, [nodeId]: { ...prev, ...patch } }
  if (!dirtyNodeIds.value.has(nodeId)) {
    const next = new Set(dirtyNodeIds.value)
    next.add(nodeId)
    dirtyNodeIds.value = next
  }
  scheduleAutoSave()
}

function onWirePatch(wireId: string, patch: Partial<WorkflowWire>) {
  if (!attemptEdit()) return
  applyStructuralOp({ kind: 'wire_edit', wire_id: wireId, patch })
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void performAutoSave()
  }, 1000)
}

async function performAutoSave() {
  // The autosave fires from per-field edits, structural restructures, and
  // lock toggles. Any of these being dirty is reason enough to push.
  if (
    dirtyNodeIds.value.size === 0
    && userGraph.value == null
    && !lockSetDirty
    && userWires.value.length === 0
  ) return
  if (!selectedWorkflowId.value) return
  if (previewedVersion.value) return
  promoteUserWires()
  const snapshotDirty = new Set(dirtyNodeIds.value)
  const hadUserGraph = userGraph.value != null
  const hadLockChange = lockSetDirty
  try {
    const created = await createVersion(workspaceId.value, selectedWorkflowId.value, {
      steps: displayedGraph.value,
      expected_version: latestVersionNumber.value,
      source: 'user',
      impact_level: 'preference',
      locked_node_ids: [...lockedNodeIds.value],
    })
    if (created) {
      await loadSelected()
      clearEditedSnapshot(snapshotDirty)
      if (hadUserGraph) userGraph.value = null
      if (hadLockChange) lockSetDirty = false
    }
  }
  catch (err: unknown) {
    if (err instanceof VersionConflictError) {
      toast.show(t('workflow.versionConflictToast'), 'warning', 6000)
      await loadSelected()
    }
    else {
      toast.show(t('workflow.saveFailedToast'), 'error', 4000)
    }
  }
}

// Fold any sketched-but-unattached wires (drag-to-connect that landed
// outside the graph) into real `edge_add` ops before we ship the graph to
// the server. Entries whose endpoints aren't in `displayedGraph` are
// silently dropped — they referenced something that no longer exists.
// Called at the top of onSave / performAutoSave so the promoted edges are
// already part of `displayedGraph.value` when we read it for the payload.
function promoteUserWires() {
  if (userWires.value.length === 0) return
  for (const w of userWires.value) {
    if (!findNodeById(displayedGraph.value, w.fromId)) continue
    if (!findNodeById(displayedGraph.value, w.toId)) continue
    const exists = displayedGraph.value.wires.some(
      e => e.from_id === w.fromId && e.to_id === w.toId,
    )
    if (exists) continue
    applyStructuralOp({
      kind: 'wire_add',
      wire: { id: '', from_id: w.fromId, to_id: w.toId },
    })
  }
  userWires.value = []
  persistUserWires()
}

// Apply a structural op (add/remove node/edge, edit edge) from a user
// gesture. Per-field overlays are folded into the new graph so they aren't
// replayed.
function applyStructuralOp(op: WorkflowOp): boolean {
  if (!attemptEdit()) return false
  const result = applyOp(displayedGraph.value, op)
  if (!result.ok) {
    toast.show(result.error, 'warning', 4000)
    return false
  }
  userGraph.value = result.graph
  editedDraft.value = {}
  dirtyNodeIds.value = new Set()
  scheduleAutoSave()
  return true
}

onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  // Tear down placement listeners if the user unmounted mid-gesture.
  if (placingNode.value) cancelPlacing()
})

// ── Live-edit conflict guard ────────────────────────────────────────────────
// `useWorkflowDraft` already applies orchestrator patches to `draftSteps`,
// and the user's per-field overlay still wins on display. When the
// orchestrator touches the same node the user is mid-edit, surface a sticky
// toast offering Discard mine (clear overlay, remount form) or Keep mine
// (dismiss, user edits win at save).
const lastDraftOp = useState<WorkflowOp | null>(`workflow-draft-last-op:${props.sessionId}`, () => null)
// Bumps when the user picks "Discard mine"; combined with `node.id` in the
// form's `:key` so the form remounts and re-initializes from the new step.
const formInstanceBump = ref(0)
let conflictToastId: string | null = null

function discardMineFor(nodeId: string) {
  const nextDraft = { ...editedDraft.value }
  delete nextDraft[nodeId]
  editedDraft.value = nextDraft
  if (dirtyNodeIds.value.has(nodeId)) {
    const dirty = new Set(dirtyNodeIds.value)
    dirty.delete(nodeId)
    dirtyNodeIds.value = dirty
  }
  // Force the form to remount so its local refs re-initialize from the
  // (now-orchestrator-sourced) step. Without the bump, v-model would still
  // show the user's typed value.
  formInstanceBump.value += 1
}

watch(lastDraftOp, (op) => {
  if (!op) return
  const focusedId = selectionDetailNode.value?.id
  if (!focusedId || !showNodeDetails.value) return
  if (!dirtyNodeIds.value.has(focusedId)) return
  const touched = idsTouchedByOp(op)
  if (!touched.includes(focusedId)) return
  const actions = [
    {
      label: t('workflow.discardMine'),
      variant: 'default' as const,
      onClick: () => { discardMineFor(focusedId); conflictToastId = null },
    },
    {
      label: t('workflow.keepMine'),
      variant: 'primary' as const,
      onClick: () => { conflictToastId = null },
    },
  ]
  // Update the existing sticky toast rather than stacking duplicates if
  // the orchestrator emits several ops in a row.
  if (conflictToastId) toast.update(conflictToastId, { message: t('workflow.conflictToast'), actions })
  else conflictToastId = toast.show(t('workflow.conflictToast'), 'warning', 12000, actions)
})

// Switching workflows drops the in-memory edit overlay — edits are scoped to
// the workflow that was being edited and would otherwise apply against the
// wrong tree on the next save.
watch(selectedWorkflowId, () => {
  if (Object.keys(editedDraft.value).length > 0) editedDraft.value = {}
  if (dirtyNodeIds.value.size > 0) dirtyNodeIds.value = new Set()
  if (userGraph.value != null) userGraph.value = null
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
  lockSetDirty = false
})

async function onRun() {
  if (!canRun.value || !selectedWorkflowId.value) return
  running.value = true
  try {
    const r = await startRun(workspaceId.value, selectedWorkflowId.value, {
      session_id: props.sessionId,
    })
    if ('error' in r) toast.show(`${t('workflow.runFailedToast')}: ${r.error}`, 'error', 5000)
  }
  finally {
    running.value = false
  }
}

// Stub: no backend cancel API yet, so we only clear the local optimistic
// "request in flight" flag and the run-status mirror. The actual run may
// still finish on the server; the next workflow_run_completed event will
// reconcile state.
function onStop() {
  running.value = false
  workflowRun?.reset()
}

// Combined "is the workflow currently running?" — true during the brief
// startRun() request window, and while the server reports an in-flight run.
// Drives the Run button's icon and click handler in the side toolbar.
const runActive = computed(() => running.value || isRunActive.value)

function toggleHistory() {
  if (historyOpen.value) {
    historyOpen.value = false
    selectedVersionId.value = null
    return
  }
  // Mutually exclusive with the node-details panel: opening history closes
  // any open node-details overlay so only one InfoPanel is ever visible.
  if (selected.value.size > 0) selected.value = new Set()
  historyOpen.value = true
}

// And the inverse: selecting a node while the history panel is open should
// close history so the node-details panel takes over the same slot.
watch(selected, (cur) => {
  if (cur.size > 0 && historyOpen.value) {
    historyOpen.value = false
    selectedVersionId.value = null
  }
})

// Re-pull versions when the drawer opens, the workflow changes, or a save
// tick lands.
watch(
  [historyOpen, selectedWorkflowId, () => lastSavedAt.value],
  async ([open, id]) => {
    if (!open) return
    if (!id) {
      versions.value = []
      return
    }
    loadingHistory.value = true
    try {
      await fetchVersions(workspaceId.value, id as string)
    }
    finally {
      loadingHistory.value = false
    }
  },
)

// ── Canvas settings ─────────────────────────────────────────────────────────
// Persisted user preferences for the canvas itself (not workflow content).
// Kept in a single localStorage entry so the settings stick across sessions
// and across different workflows in the same workspace.
interface CanvasSettings {
  showGrid: boolean
  snapToGrid: boolean
  wireType: WireType
}
const SETTINGS_KEY = 'polymux_canvas_settings'
const SNAP_GRID = 24
const settings = ref<CanvasSettings>({ showGrid: true, snapToGrid: true, wireType: 'fluid' })

if (import.meta.client) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CanvasSettings>
      settings.value = {
        showGrid: parsed.showGrid ?? true,
        snapToGrid: parsed.snapToGrid ?? true,
        wireType: parsed.wireType ?? 'fluid',
      }
    }
  }
  catch {}
}

function persistSettings() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
  }
  catch {}
}

function toggleShowGrid() {
  settings.value = { ...settings.value, showGrid: !settings.value.showGrid }
  persistSettings()
}

function toggleSnapToGrid() {
  settings.value = { ...settings.value, snapToGrid: !settings.value.snapToGrid }
  persistSettings()
}

function setWireType(wt: WireType) {
  settings.value = { ...settings.value, wireType: wt }
  persistSettings()
}

const wireTypeOptions = computed(() => [
  { value: 'fluid' as WireType, label: t('workflow.wireFluid') },
  { value: 'linear' as WireType, label: t('workflow.wireLinear') },
  { value: 'step' as WireType, label: t('workflow.wireStep') },
])

const showSettings = ref(false)
const settingsButtonEl = ref<HTMLElement | null>(null)
const settingsMenuEl = ref<HTMLElement | null>(null)

// The settings panel is teleported to body so it can render above the
// chat prompt input (z-50) without being trapped in the side-toolbar's
// z-30 stacking context. Position is fixed and recomputed from the
// button's viewport rect on open / resize / scroll.
const settingsAnchor = ref<{ left: number, top: number }>({ left: 0, top: 0 })
function updateSettingsAnchor() {
  const el = settingsButtonEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  settingsAnchor.value = { left: r.right + 8, top: r.top }
}

function onSettingsDocClick(ev: MouseEvent) {
  if (!showSettings.value) return
  const t = ev.target as Node | null
  if (!t) return
  if (settingsButtonEl.value?.contains(t)) return
  if (settingsMenuEl.value?.contains(t)) return
  showSettings.value = false
}

watch(showSettings, (open) => {
  if (open) {
    updateSettingsAnchor()
    document.addEventListener('mousedown', onSettingsDocClick)
    window.addEventListener('resize', updateSettingsAnchor)
    window.addEventListener('scroll', updateSettingsAnchor, true)
  }
  else {
    document.removeEventListener('mousedown', onSettingsDocClick)
    window.removeEventListener('resize', updateSettingsAnchor)
    window.removeEventListener('scroll', updateSettingsAnchor, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onSettingsDocClick)
  window.removeEventListener('resize', updateSettingsAnchor)
  window.removeEventListener('scroll', updateSettingsAnchor, true)
  if (viewportPersistTimer != null) {
    clearTimeout(viewportPersistTimer)
    viewportPersistTimer = null
  }
  persistViewportToStorage()
})
</script>

<template>
  <div class="relative flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-neutral-50">
    <!-- Off-screen measurement node for rename auto-grow. Same font stack
         (`text-sm font-medium`) as the rendered node title so offsetWidth
         here is a faithful proxy for the title's natural width. -->
    <span
      ref="renameMeasureEl"
      aria-hidden="true"
      class="pointer-events-none invisible absolute -left-[9999px] top-0 whitespace-pre text-sm font-medium"
    />
    <!--
      Side toolbar — slim vertical icon-only column on the left. Single
      merged pill: history / save / run at the top, then layout helpers,
      zoom, undo-redo, and settings stacked beneath.
    -->
    <div class="absolute left-3 top-[112px] bottom-[180px] z-30 flex flex-col gap-2 pointer-events-none sm:left-4">
      <div class="flex h-full w-10 flex-col items-center justify-between gap-0.5 rounded-xl border border-neutral-200 bg-white/90 px-1 py-1.5 shadow-sm backdrop-blur-md pointer-events-auto">
        <!-- Run / Stop — the primary action sits at the top. When idle a
             green play icon; while running the spinner swaps to a red stop
             on hover so the user can request a cancel. Clicking while
             running calls onStop (currently a UI-only reset). -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:hover:text-emerald-600"
          :class="runActive
            ? 'text-emerald-600 hover:text-red-600'
            : 'text-emerald-600 hover:text-emerald-500'"
          :disabled="!runActive && !canRun"
          @click="runActive ? onStop() : onRun()"
        >
          <template v-if="runActive">
            <UIcon
              name="i-heroicons-arrow-path-20-solid"
              class="size-3.5 animate-spin group-hover/btn:hidden"
            />
            <UIcon
              name="i-heroicons-stop-20-solid"
              class="hidden size-3.5 group-hover/btn:block"
            />
          </template>
          <UIcon v-else name="i-heroicons-play-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ runActive ? t('workflow.stop') : t('workflow.run') }}</span>
        </button>

        <!-- Save -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canSave"
          @click="onSave"
        >
          <UIcon name="i-ph-floppy-disk-fill" class="size-3.5" />
          <span class="canvas-tooltip">{{ saving ? t('workflow.saving') : t('workflow.save') }}</span>
        </button>

        <!-- History -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
          :class="historyOpen ? 'text-neutral-900' : 'text-neutral-500'"
          @click="toggleHistory"
        >
          <UIcon name="i-heroicons-clock-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.historyTitle') }}</span>
        </button>

        <!-- Add node — clicking attaches a faded ghost to the cursor; the
             next click on the canvas drops a fresh graph node there. -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
          :class="placingNode ? 'text-neutral-900' : 'text-neutral-500'"
          @click="startPlacingNode"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            class="size-3.5"
            aria-hidden="true"
          >
            <rect
              x="2.9"
              y="4.9"
              width="18.2"
              height="14.2"
              rx="3.1"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
          <span class="canvas-tooltip">{{ t('workflow.addNode') }}</span>
        </button>

        <span class="my-0.5 h-px w-4 bg-neutral-200" />

        <!-- Undo -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canUndo"
          @click="undo"
        >
          <UIcon name="i-heroicons-arrow-uturn-left-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.undo') }}</span>
        </button>
        <!-- Redo -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canRedo"
          @click="redo"
        >
          <UIcon name="i-heroicons-arrow-uturn-right-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.redo') }}</span>
        </button>

        <span class="my-0.5 h-px w-4 bg-neutral-200" />

        <!-- Fit to view -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
          @click="fitToView"
        >
          <UIcon name="i-heroicons-arrows-pointing-out-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.fitToView') }}</span>
        </button>
        <!-- Auto layout -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!hasOverrides"
          @click="resetLayout"
        >
          <UIcon name="i-heroicons-sparkles-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.resetLayoutTitle') }}</span>
        </button>

        <span class="my-0.5 h-px w-4 bg-neutral-200" />

        <!-- Zoom controls -->
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="scale >= 2 - 0.001"
          @click="zoomIn"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.zoomIn') }}</span>
        </button>
        <span class="text-center font-mono text-[10px] tabular-nums text-neutral-400">
          {{ Math.round(scale * 100) }}%
        </span>
        <button
          type="button"
          class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="scale <= 0.4 + 0.001"
          @click="zoomOut"
        >
          <UIcon name="i-heroicons-minus-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.zoomOut') }}</span>
        </button>

        <span class="my-0.5 h-px w-4 bg-neutral-200" />

        <!-- Settings -->
        <div class="relative">
          <button
            ref="settingsButtonEl"
            type="button"
            class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
            :class="showSettings ? 'text-neutral-900' : 'text-neutral-500'"
            @click="showSettings = !showSettings"
          >
            <UIcon name="i-heroicons-cog-6-tooth-20-solid" class="size-3.5" />
            <span v-if="!showSettings" class="canvas-tooltip">{{ t('workflow.canvasSettings') }}</span>
          </button>
          <Teleport to="body">
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="-translate-x-1 opacity-0"
            enter-to-class="translate-x-0 opacity-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="translate-x-0 opacity-100"
            leave-to-class="-translate-x-1 opacity-0"
          >
            <div
              v-if="showSettings"
              ref="settingsMenuEl"
              class="fixed z-[60] w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
              :style="{ left: `${settingsAnchor.left}px`, top: `${settingsAnchor.top}px` }"
            >
                <div class="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wider text-neutral-500">
                  {{ t('workflow.canvasSettings') }}
                </div>
                <!-- Single click target per row: native click on the inner
                     SettingsToggle bubbles up to the wrapper @click. We deliberately
                     don't listen to @update:model-value on the toggle too — doing
                     both fires the handler twice and the setting flips back. -->
                <div
                  class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                  @click="toggleShowGrid"
                >
                  <span>{{ t('workflow.showGrid') }}</span>
                  <SettingsToggle :model-value="settings.showGrid" />
                </div>
                <div
                  class="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                  @click="toggleSnapToGrid"
                >
                  <span>{{ t('workflow.snapToGrid') }}</span>
                  <SettingsToggle :model-value="settings.snapToGrid" />
                </div>
                <div class="border-t border-neutral-100 px-3 py-2">
                  <div class="mb-1.5 text-caption font-semibold uppercase tracking-wider text-neutral-500">
                    {{ t('workflow.wireStyle') }}
                  </div>
                  <div class="flex gap-1">
                    <button
                      v-for="opt in wireTypeOptions"
                      :key="opt.value"
                      type="button"
                      class="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors"
                      :class="settings.wireType === opt.value
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'"
                      @click="setWireType(opt.value)"
                    >
                      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" class="shrink-0">
                        <path
                              v-if="opt.value === 'fluid'"
                              d="M1 9 C 4 1, 12 1, 15 1"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              fill="none"
                            />
                        <path
                              v-else-if="opt.value === 'linear'"
                              d="M1 9 L 15 1"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              fill="none"
                            />
                        <path
                              v-else
                              d="M1 9 L 1 5 Q 1 1, 5 1 L 15 1"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              fill="none"
                            />
                      </svg>
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>
          </div>
      </div>
    </div>

    <!-- Canvas -->
    <div
      ref="viewportEl"
      class="relative h-full w-full select-none overflow-hidden"
      :class="isPanning ? 'cursor-grabbing' : 'cursor-grab'"
      :style="settings.showGrid ? {
        backgroundImage: 'radial-gradient(circle, rgb(188 188 195 / 0.7) 1.25px, transparent 1.25px)',
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      } : {}"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @wheel="onWheel"
    >
      <div
        v-if="!canvasReady || layout.nodes.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div v-if="canvasReady" class="flex flex-col items-center gap-2 text-center text-caption text-neutral-400">
          <UIcon name="i-heroicons-share-20-solid" class="size-8 text-neutral-300" />
          <p>{{ t('workflow.nodeCanvasEmpty') }}</p>
        </div>
      </div>

      <div
        v-if="canvasReady"
        class="absolute left-0 top-0 origin-top-left"
        :style="{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width: `${canvasBounds.width}px`,
          height: `${canvasBounds.height}px`,
        }"
      >
        <!--
          Inner shift layer: nodes (and wires) live in workflow coordinates
          which can be negative when the user has dragged a node above /
          left of the origin. Translating by (-minX, -minY) puts everything
          inside the positive-space wrapper above so the SVG overflow and
          fit-to-view math both behave.
        -->
        <div
          class="absolute left-0 top-0"
          :style="{
            transform: `translate(${-canvasBounds.minX}px, ${-canvasBounds.minY}px)`,
          }"
        >
          <!-- Wires layer -->
          <svg
            class="absolute left-0 top-0 pointer-events-none"
            :width="canvasBounds.width"
            :height="canvasBounds.height"
            style="overflow: visible"
          >
            <defs>
              <marker
                id="wire-arrow"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0.5 L 10 5 L 0 9.5 Z" fill="rgb(163 163 163)" />
              </marker>
            </defs>
            <g v-for="w in visibleWires" :key="w.id">
              <!-- When the user is dragging this wire's endpoint, the
                   rubber-band path is rendered separately below; we hide
                   the live wire to avoid a stale double-image. -->
              <template
                v-if="!(w.selectable
                  && endpointDrag
                  && endpointDrag.wireId === w.id.slice('wire:'.length))"
              >
              <!-- Transparent fat-stroke hit zone. Only enabled for editable
                   edges (spine wires are layout anchors and not selectable). -->
              <path
                v-if="w.selectable"
                :d="w.d"
                fill="none"
                stroke="transparent"
                stroke-width="14"
                stroke-linecap="round"
                class="cursor-pointer"
                style="pointer-events: stroke"
                @click.stop="selectWire(w.id)"
              />
              <!-- Wire shadow for depth -->
              <path
                :d="w.d"
                fill="none"
                stroke="rgb(0 0 0 / 0.04)"
                stroke-width="3"
                stroke-linecap="round"
              />
              <!-- Main wire with arrowhead. Selected edge gets a bolder blue
                   tint so the user can see what's currently picked. -->
              <path
                :d="w.d"
                fill="none"
                :stroke="w.selectable && selectedWireId === w.id.slice('wire:'.length) ? 'rgb(59 130 246)' : 'rgb(163 163 163)'"
                :stroke-width="w.selectable && selectedWireId === w.id.slice('wire:'.length) ? '2' : '1.5'"
                stroke-linecap="round"
                marker-end="url(#wire-arrow)"
              />
              </template>
            </g>
            <!--
              Rubber-band wire that follows the cursor while the user is
              dragging from a port. Snaps onto the target's nearest side
              once the cursor enters a candidate's hover zone; otherwise
              tracks the cursor freely. Solid blue when locked onto a
              target, dashed when still searching.
            -->
            <path
              v-if="tempWireGeom"
              :d="tempWireGeom.d"
              fill="none"
              :stroke="connecting?.targetId ? 'rgb(59 130 246)' : 'rgb(96 165 250)'"
              stroke-width="2"
              stroke-linecap="round"
              :stroke-dasharray="connecting?.targetId ? undefined : '5 4'"
            />
            <!--
              Rubber-band for an endpoint-drag on an existing wire. The
              anchored end stays put; the moving end tracks the cursor.
              Same colour rules as the port-drag preview so the affordance
              feels uniform across both flows.
            -->
            <path
              v-if="endpointDragWireGeom"
              :d="endpointDragWireGeom.d"
              fill="none"
              :stroke="endpointDrag?.targetId ? 'rgb(59 130 246)' : 'rgb(96 165 250)'"
              stroke-width="2"
              stroke-linecap="round"
              :stroke-dasharray="endpointDrag?.targetId ? undefined : '5 4'"
            />
            <!--
              Endpoint grip dots — render at the two attachment points of
              the currently selected wire so the user can grab either end
              and drag it. Hidden while a drag is in flight; the rubber-
              band above takes over the visual.
              (Uses <g v-if> rather than <template>; <template> inside an
              SVG can fail to render because the browser treats it as a
              foreign HTML element outside the SVG namespace.)
            -->
            <g v-for="w in visibleWires" :key="`dots-${w.id}`">
              <g
                v-if="w.selectable
                  && selectedWireId === w.id.slice('wire:'.length)
                  && (!endpointDrag || endpointDrag.wireId !== w.id.slice('wire:'.length))"
              >
                <circle
                  :cx="w.p1.x"
                  :cy="w.p1.y"
                  r="6"
                  fill="rgb(59 130 246)"
                  stroke="white"
                  stroke-width="2"
                  class="cursor-grab"
                  style="pointer-events: all"
                  @pointerdown.stop="(e) => onEndpointPointerDown(e, w, 'from')"
                />
                <circle
                  :cx="w.p2.x"
                  :cy="w.p2.y"
                  r="6"
                  fill="rgb(59 130 246)"
                  stroke="white"
                  stroke-width="2"
                  class="cursor-grab"
                  style="pointer-events: all"
                  @pointerdown.stop="(e) => onEndpointPointerDown(e, w, 'to')"
                />
              </g>
            </g>
            <!--
              Ghost wire — renders while the user hovers a port (and isn't
              already in the middle of a connect drag). Same shape the
              spawn would produce, drawn dashed and faded so it reads as
              "this is what clicking would do".
            -->
            <path
              v-if="ghostWireGeom"
              :d="ghostWireGeom.d"
              fill="none"
              stroke="rgb(115 115 115)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-dasharray="4 4"
              opacity="0.55"
            />
          </svg>

        <!--
          Wire selection toolbar — compact horizontal bar floating above the
          midpoint of the selected edge. Mirrors the per-node selection
          toolbar's visual language. Two actions: open the InfoPanel for
          full editing, and remove the edge.
        -->
        <template v-for="w in visibleWires" :key="`wtb-${w.id}`">
          <Transition
            enter-active-class="transition-opacity duration-100 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-75 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div
              v-if="w.selectable && selectedWireId === w.id.slice('wire:'.length)"
              class="pointer-events-auto absolute z-20 flex h-10 -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl border border-neutral-200 bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur-md"
              :style="{
                left: `${w.mid.x}px`,
                top: `${w.mid.y - 16}px`,
                touchAction: 'none',
              }"
              @pointerdown.stop
            >
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                @click.stop="showNodeDetails = true"
              >
                <UIcon name="i-heroicons-pencil-square-20-solid" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.editWire') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:text-rose-600"
                @click.stop="deleteSelectedWire"
              >
                <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.deleteWire') }}</span>
              </button>
            </div>
          </Transition>
        </template>

        <!--
          Each node lives inside an invisible hover zone HOVER_PAD wider on
          every side. When the pointer enters the zone we mark the node as
          the active hover target, which reveals the four side ports just
          outside the card. The card itself is positioned at (HOVER_PAD,
          HOVER_PAD) inside the zone so its on-screen coordinates still
          match nodePos(). data-node lives on the zone so a click anywhere
          inside it is treated as "on a node" by the canvas pan handler.
        -->
        <div
          v-for="node in visibleNodes"
          :key="node.id"
          data-node
          class="absolute"
          :style="{
            left: `${nodePos(node).x - HOVER_PAD}px`,
            top: `${nodePos(node).y - HOVER_PAD}px`,
            width: `${nodeSize(node).w + HOVER_PAD * 2}px`,
            height: `${nodeSize(node).h + HOVER_PAD * 2}px`,
          }"
          @pointerenter="onZoneEnter(node.id)"
          @pointerleave="onZoneLeave(node.id)"
        >
          <!-- Card -->
          <div
            class="absolute rounded-xl border-2 bg-white shadow-sm transition-shadow"
            :class="[
              nodeRunStatus(node.id) === 'running'
                ? 'border-emerald-500 animate-pulse'
                : connecting?.targetId === node.id
                  ? 'border-blue-500'
                  : isLockedNode(node.id)
                    ? 'border-amber-500 bg-amber-50/40 hover:shadow-md'
                    : isSelected(node.id)
                      ? 'border-neutral-900 hover:shadow-md'
                      : 'border-neutral-400 hover:border-neutral-500 hover:shadow-md',
              node.terminal ? 'opacity-80' : '',
              isDraggingNode(node.id) ? 'cursor-grabbing shadow-lg' : 'cursor-grab',
            ]"
            :style="{
              left: `${HOVER_PAD}px`,
              top: `${HOVER_PAD}px`,
              width: `${nodeSize(node).w}px`,
              height: `${nodeSize(node).h}px`,
              touchAction: 'none',
            }"
            @pointerdown="(e) => onNodePointerDown(e, node)"
          >
            <!-- Terminals (Start / End) get a single centered title — no
                 kind badge or detail row, since they're graph anchors with
                 no step content. Regular cards keep the badge / title /
                 detail layout. -->
            <div
              v-if="node.terminal"
              class="flex h-full items-center justify-center px-2 text-center"
            >
              <span class="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                {{ nodeTitle(node) }}
              </span>
            </div>
            <div v-else class="flex h-full flex-col items-center justify-center gap-1 px-3 py-2 text-center">
              <input
                v-if="renamingNodeId === node.id"
                v-model="renamingValue"
                data-node-rename
                type="text"
                class="max-w-full min-w-0 rounded-sm border-0 bg-transparent text-center text-sm font-medium text-neutral-900 outline-none focus:ring-1 focus:ring-neutral-300"
                @keyup.enter.stop="commitRename(node.id)"
                @keyup.esc.stop="cancelRename"
                @blur="commitRename(node.id)"
                @pointerdown.stop
                @click.stop
              />
              <span
                v-else
                class="max-w-full truncate text-sm font-medium text-neutral-900"
                @dblclick.stop="startRename(node)"
              >
                {{ nodeTitle(node) }}
              </span>
            </div>
          </div>

          <!--
            Hover ports — only visible while this node is the active hover
            target, OR while it's the source / candidate target of an
            in-flight connect drag (so the source port doesn't disappear
            mid-gesture, and the target node's port lights up on hover).
            Each button is size-7 (the click target) with a small grey dot
            inside; on hover the dot ticks up by 2 px (size-2.5 → size-3)
            and darkens slightly — kept subtle on purpose. A short click
            spawns a new linked node; press-drag-release-on-another-node
            wires the two together via onPortPointerDown.
          -->
          <template
            v-if="
              !isDraggingNode(node.id)
              && (
                activeHoverNodeId === node.id
                || connecting?.fromId === node.id
                || connecting?.targetId === node.id
              )
            "
          >
            <button
              type="button"
              class="group absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center bg-transparent"
              :title="t('workflow.spawnFromPort')"
              :style="{
                left: `${HOVER_PAD + nodeSize(node).w / 2}px`,
                top: `${HOVER_PAD - PORT_GAP}px`,
                touchAction: 'none',
              }"
              @pointerenter="onPortHover(node, 'top')"
              @pointerleave="onPortLeave(node, 'top')"
              @pointerdown="(e) => onPortPointerDown(e, node, 'top')"
            >
              <span class="block size-2.5 rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-3 group-hover:bg-neutral-500/70" />
            </button>
            <button
              type="button"
              class="group absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center bg-transparent"
              :title="t('workflow.spawnFromPort')"
              :style="{
                left: `${HOVER_PAD + nodeSize(node).w / 2}px`,
                top: `${HOVER_PAD + nodeSize(node).h + PORT_GAP}px`,
                touchAction: 'none',
              }"
              @pointerenter="onPortHover(node, 'bottom')"
              @pointerleave="onPortLeave(node, 'bottom')"
              @pointerdown="(e) => onPortPointerDown(e, node, 'bottom')"
            >
              <span class="block size-2.5 rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-3 group-hover:bg-neutral-500/70" />
            </button>
            <button
              type="button"
              class="group absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center bg-transparent"
              :title="t('workflow.spawnFromPort')"
              :style="{
                left: `${HOVER_PAD - PORT_GAP}px`,
                top: `${HOVER_PAD + nodeSize(node).h / 2}px`,
                touchAction: 'none',
              }"
              @pointerenter="onPortHover(node, 'left')"
              @pointerleave="onPortLeave(node, 'left')"
              @pointerdown="(e) => onPortPointerDown(e, node, 'left')"
            >
              <span class="block size-2.5 rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-3 group-hover:bg-neutral-500/70" />
            </button>
            <button
              type="button"
              class="group absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center bg-transparent"
              :title="t('workflow.spawnFromPort')"
              :style="{
                left: `${HOVER_PAD + nodeSize(node).w + PORT_GAP}px`,
                top: `${HOVER_PAD + nodeSize(node).h / 2}px`,
                touchAction: 'none',
              }"
              @pointerenter="onPortHover(node, 'right')"
              @pointerleave="onPortLeave(node, 'right')"
              @pointerdown="(e) => onPortPointerDown(e, node, 'right')"
            >
              <span class="block size-2.5 rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-3 group-hover:bg-neutral-500/70" />
            </button>
          </template>

          <!--
            Resize handle (bottom-right). Only shown for non-terminal nodes
            and only while the pointer is hovering this node's zone, so the
            canvas stays clean. Drag scales the node; release persists +
            records an undo entry. Snaps to grid when snapToGrid is on.
          -->
          <div
            v-if="!node.terminal && activeHoverNodeId === node.id && !isDraggingNode(node.id) && !connecting"
            class="absolute size-3 cursor-se-resize"
            :style="{
              left: `${HOVER_PAD + nodeSize(node).w - 4}px`,
              top: `${HOVER_PAD + nodeSize(node).h - 4}px`,
              touchAction: 'none',
            }"
            :title="t('workflow.resizeNode')"
            @pointerdown="(e) => onResizePointerDown(e, node)"
            @click.stop
          >
            <svg
              class="absolute right-0.5 bottom-0.5 block size-3 text-neutral-400/80 transition-colors hover:text-neutral-700"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M 2.5 10 A 8 8 0 0 0 10 2.5"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>

          <!--
            Per-node selection toolbar. Mirrors the left action bar's
            visual language (white, rounded, soft shadow, backdrop blur)
            but laid out horizontally and compact: just run / lock /
            delete. Sits slightly above the card so it doesn't crowd the
            content. Visible only when this node is the sole selection
            and no drag/connect gesture is in flight — terminals never
            get one since they aren't editable.
          -->
          <Transition
            enter-active-class="transition-opacity duration-100 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-75 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div
              v-if="!node.terminal && selected.size === 1 && isSelected(node.id) && !isDraggingNode(node.id) && !connecting"
              class="pointer-events-auto absolute z-20 flex h-10 -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-xl border border-neutral-200 bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur-md"
              :style="{
                left: `${HOVER_PAD + nodeSize(node).w / 2}px`,
                // Toolbar's bottom (after -translate-y-full) sits at
                // HOVER_PAD - 2*PORT_GAP in zone coords. That places the
                // top hover port exactly midway between the node edge and
                // the toolbar — gap(node→port) = gap(port→toolbar) =
                // PORT_GAP.
                top: `${HOVER_PAD - PORT_GAP * 2}px`,
                touchAction: 'none',
              }"
              @pointerdown.stop
            >
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!selectedWorkflowId || runActive"
                @click.stop="rerunFromNode(node)"
              >
                <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.rerunFromHere') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                @click.stop="showNodeDetails = true"
              >
                <UIcon name="i-heroicons-information-circle" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.nodeDetails') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg transition-colors"
                :class="isLockedNode(node.id)
                  ? 'text-amber-600 hover:text-amber-500'
                  : 'text-neutral-500 hover:text-neutral-900'"
                @click.stop="toggleLock(node)"
              >
                <UIcon
                  :name="isLockedNode(node.id) ? 'i-heroicons-lock-closed-20-solid' : 'i-heroicons-lock-open-20-solid'"
                  class="size-3.5"
                />
                <span class="canvas-tooltip-above">{{ isLockedNode(node.id) ? t('workflow.unlockNode') : t('workflow.lockNode') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex size-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isLockedNode(node.id)"
                @click.stop="deleteSelected"
              >
                <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.deleteNode') }}</span>
              </button>
            </div>
          </Transition>
        </div>

        <!--
          Ghost card — preview of the node that would be spawned by
          clicking the currently-hovered port. Same NODE_W × NODE_H box
          a real card uses, dashed border + low opacity so it reads as
          a "what-if" placeholder. Sits in the same shift wrapper as
          the real cards, so no extra coordinate math is needed.
        -->
        <div
          v-if="ghostPreview"
          class="pointer-events-none absolute flex items-center justify-center rounded-xl border border-dashed border-neutral-400 bg-white/60"
          :style="{
            left: `${ghostPreview.pos.x}px`,
            top: `${ghostPreview.pos.y}px`,
            width: `${NODE_W}px`,
            height: `${NODE_H}px`,
            opacity: 0.55,
          }"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-5 text-neutral-400" />
        </div>
        <!--
          Cursor-following ghost for the "add node" tool — same NODE_W ×
          NODE_H footprint as the real card. Renders only while a manual
          placement is in flight; the next canvas click drops a real node
          at this position.
        -->
        <div
          v-if="placingNode"
          class="pointer-events-none absolute flex items-center justify-center rounded-xl border-2 border-dashed border-neutral-500 bg-white/70"
          :style="{
            left: `${placingNode.x}px`,
            top: `${placingNode.y}px`,
            width: `${NODE_W}px`,
            height: `${NODE_H}px`,
            opacity: 0.7,
          }"
        >
          <UIcon name="i-heroicons-plus-20-solid" class="size-5 text-neutral-500" />
        </div>
        </div>
      </div>
    </div>

    <!-- Right detail panel: rounded, inset from edges. Two consumers share
         the panel — a selected node opens the node form, a selected edge
         opens the wire form. Edge selection takes precedence so the user
         doesn't see stale node fields after clicking a wire. -->
    <InfoPanel
      :open="(!!selectionDetailNode || !!selectedWire) && showNodeDetails"
      :title="selectedWire ? t('workflow.editWire') : (selectionDetailNode ? nodeTitle(selectionDetailNode) : '')"
      @close="selected = new Set(); clearWireSelection()"
    >
      <template v-if="selectedWire">
        <div class="flex-1 px-4 pt-2 pb-3">
          <WireDetailsForm
            :key="`${selectedWire.id}:${formInstanceBump}`"
            :wire-id="selectedWire.id"
            :wire="selectedWire"
            @update:patch="onWirePatch"
          />
        </div>
      </template>
      <template v-else-if="selectionDetailNode">
        <div class="flex-1 px-4 pt-2 pb-3">
          <p
            v-if="isLockedNode(selectionDetailNode.id)"
            class="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
          >
            {{ t('workflow.lockedHint') }}
          </p>
          <NodeDetailsForm
            :key="`${selectionDetailNode.id}:${formInstanceBump}`"
            :node-id="selectionDetailNode.id"
            :node="selectionDetailNode.node"
            :locked="isLockedNode(selectionDetailNode.id)"
            @update:patch="onNodePatch"
          />
        </div>
      </template>

      <template v-if="selectedWire" #footer>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-caption font-medium text-rose-600 transition-colors hover:bg-rose-50"
          @click="deleteSelectedWire"
        >
          <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
          {{ t('workflow.deleteWire') }}
        </button>
      </template>
      <template v-else-if="selectionDetailNode" #footer>
        <button
          type="button"
          class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-caption font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!selectedWorkflowId"
          @click="rerunSelected"
        >
          <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
          {{ t('workflow.rerunFromHere') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-caption font-medium text-rose-600 transition-colors hover:bg-rose-50"
          @click="deleteSelected"
        >
          <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
          {{ t('workflow.deleteNode') }}
        </button>
      </template>
    </InfoPanel>

    <!-- Multi-select contextual action bar. -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="selected.size > 1"
        class="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-neutral-200 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-lg"
      >
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100">
          <UIcon name="i-heroicons-squares-plus-20-solid" class="size-4 text-neutral-700" />
        </div>
        <span class="text-sm font-medium text-neutral-950">
          {{ t('workflow.selectedCount', { n: selected.size }) }}
        </span>
        <div class="h-5 w-px bg-neutral-200" />
        <div class="flex items-center gap-1">
          <button
            class="flex size-7 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            :title="t('workflow.rerunFromHere')"
            @click="rerunSelected"
          >
            <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
          </button>
          <button
            class="flex size-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            :title="t('workflow.deleteNode')"
            @click="deleteSelected"
          >
            <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
          </button>
        </div>
        <button
          class="flex size-6 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          :title="t('workflow.clearSelection')"
          @click="selected = new Set()"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-3" />
        </button>
      </div>
    </Transition>

    <WorkflowHistoryDrawer
      :open="historyOpen"
      :versions="versions"
      :current-version-id="latestVersionId"
      :selected-version-id="selectedVersionId"
      :live-entry="liveEntry"
      :loading="loadingHistory"
      @close="toggleHistory"
      @select="(id) => (selectedVersionId = id)"
      @reset="onHistoryResetRequest"
    />

    <!-- Revert-to-previewed-version confirm. Mounted at the canvas root so
         it overlays the full panel (z-50) and stops pointer-events from
         reaching the canvas underneath via the backdrop. -->
    <Transition
      enter-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="revertModalOpen"
        class="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-6"
        @click.self="cancelRevert"
      >
        <div class="w-full max-w-sm overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div class="px-5 pt-4 pb-2">
            <div class="text-caption font-semibold uppercase tracking-wider text-neutral-500">
              {{ isResetFlow ? t('workflow.resetTitle', { version: modalVersionForCopy?.version ?? '' }) : t('workflow.revertTitle', { version: modalVersionForCopy?.version ?? '' }) }}
            </div>
            <p class="mt-2 text-sm text-neutral-700">
              {{ isResetFlow ? t('workflow.resetBody', { version: modalVersionForCopy?.version ?? '' }) : t('workflow.revertBody', { version: modalVersionForCopy?.version ?? '' }) }}
            </p>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-caption font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              :disabled="resetInFlight"
              @click="cancelRevert"
            >
              {{ t('workflow.cancel') }}
            </button>
            <button
              type="button"
              class="rounded-md bg-neutral-900 px-3 py-1.5 text-caption font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="resetInFlight"
              @click="confirmRevert"
            >
              {{ isResetFlow ? t('workflow.resetConfirm') : t('workflow.revertConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Side-toolbar tooltip — small label that appears to the right of an icon
   button on hover. Same shell (white, thin border, soft shadow, 11px text)
   as the chip tooltip in StorageProviderUsageOverlay so the visual
   language matches the rest of the app. Each consumer button supplies the
   `group/btn relative` classes so this rule's `:hover` selector resolves. */
.canvas-tooltip {
  position: absolute;
  left: 100%;
  top: 50%;
  z-index: 20;
  margin-left: 0.5rem;
  transform: translateY(-50%);
  white-space: nowrap;
  border-radius: 0.375rem;
  border: 1px solid rgb(229 229 229 / 0.8);
  background-color: rgb(255 255 255);
  padding: 0.25rem 0.5rem;
  font-size: 11px;
  line-height: 1;
  color: rgb(82 82 82);
  opacity: 0;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  pointer-events: none;
  transition: opacity 100ms;
}
.group\/btn:hover > .canvas-tooltip {
  opacity: 1;
}

/* Above-button variant used by the horizontal selection toolbars (per-node
   and per-wire). Same chrome as `.canvas-tooltip` but pops above the button
   so it doesn't overlap the node card / wire sitting beneath the toolbar. */
.canvas-tooltip-above {
  position: absolute;
  bottom: 100%;
  left: 50%;
  z-index: 20;
  margin-bottom: 0.5rem;
  transform: translateX(-50%);
  white-space: nowrap;
  border-radius: 0.375rem;
  border: 1px solid rgb(229 229 229 / 0.8);
  background-color: rgb(255 255 255);
  padding: 0.25rem 0.5rem;
  font-size: 11px;
  line-height: 1;
  color: rgb(82 82 82);
  opacity: 0;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  pointer-events: none;
  transition: opacity 100ms;
}
.group\/btn:hover > .canvas-tooltip-above {
  opacity: 1;
}
</style>
