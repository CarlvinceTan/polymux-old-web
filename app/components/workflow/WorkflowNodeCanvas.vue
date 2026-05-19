<script setup lang="ts">
import type { WorkflowGraph, WorkflowNode, WorkflowVersion, WorkflowWire, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'
import { VersionConflictError } from '~/composables/workflows/useWorkflows'
import type { NodeModel, WireModel, WireStyle } from '~/composables/workflows/useWorkflowLayout'
import { buildLayout } from '~/composables/workflows/useWorkflowLayout'
import type { WorkflowOp } from '~/composables/workflows/useWorkflowMutations'
import { applyOp, findNodeById, findWireById, idsTouchedByOp } from '~/composables/workflows/useWorkflowMutations'
import { useEmbeddedWorkflowCache } from '~/composables/workflows/useEmbeddedWorkflow'
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
const PORT_GAP = 16
// Distance between an existing card's edge and a freshly spawned card's edge,
// used by the port-click action below. Same in all four directions so a tap
// on any side gives a perfectly aligned, evenly-spaced sibling.
const SPAWN_GAP = 80
// Pan/zoom viewport persists in sessionStorage so the user's framing
// survives view-mode hops. This is the only persisted canvas-only state;
// graph geometry (positions, sizes, wire bends) lives on the graph
// itself via `node_edit` / `wire_edit` ops.
const cameraKey = computed(() => `polymux_flow_camera_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

interface Pt { x: number; y: number }
// Transient drag-preview overlay. Holds in-flight gesture coordinates only;
// on `pointerup` the final position lands as a `node_edit` op (which sets
// `node.position` via the structural-op path) and the entry is cleared.
// No localStorage — refresh-during-drag loses the in-flight delta, but the
// autosave that fires after release commits the position to a version row
// within ~1 s.
const overrides = ref<Record<string, Pt>>({})

// Canvas-local wires whose endpoints aren't both real graph nodes (e.g.
// a wire to a "spawn-extra" that hasn't been added to the graph yet).
// Wires between two real nodes go straight through `applyStructuralOp`
// (`wire_add`) — see `addUserWire`. This list holds the remainder until
// save folds them in via `promoteUserWires`.
interface UserWire {
  id: string
  fromId: string
  toId: string
  // Floating endpoint positions for detached ends. Empty `fromId` /
  // `toId` paired with a set `fromPos` / `toPos` means the user grabbed
  // that end and dropped it into empty canvas space — same model as the
  // graph wire's `from_pos` / `to_pos`. Lets Start/End-touching wires
  // support the same drag-to-empty UX as wires between real nodes.
  fromPos?: Pt
  toPos?: Pt
  // Sides the user latched onto during port-drag. Stored on the wire
  // itself (rather than relying on the auto picker) so the rendered
  // wire stays attached to the exact circle the user dropped onto,
  // even after subsequent renders or node moves.
  fromSide?: Side
  toSide?: Side
}
const userWires = ref<UserWire[]>([])

// Transient resize-preview overlay (mirrors `overrides`). Commits to
// `node.size` via a `node_edit` op on release.
interface Size { w: number; h: number }
const NODE_MIN_W = 140
const NODE_MIN_H = 60
const NODE_MAX_W = 520
const NODE_MAX_H = 260
const sizes = ref<Record<string, Size>>({})

// Auto-layout seed memo. When a graph arrives with nodes that have no
// `position`, we project a one-shot `buildLayout` result into this memo so
// the canvas has stable coordinates for unpositioned nodes. Entries are
// frozen per-node-id at first observation — later topology changes (the
// agent adding a node, the user removing one) do NOT re-seed an existing
// entry, so unpositioned neighbours don't shift around when the graph
// changes shape. The auto-layout button writes positions onto the graph
// and supersedes this memo entirely.
const seedPositions = ref<Record<string, Pt>>({})

// Stable side cache — keyed by wire id. Same first-observation-freezes
// pattern as `seedPositions`, but stored as a plain `Map` rather than a
// ref so it doesn't pull `wireSidesMap` into setup-time evaluation. The
// cache is read + written inside `wireGeoms`; changes never need to
// trigger their own re-render — `wireGeoms` is already re-evaluating
// because its underlying reactive inputs changed.
const stableWireSides = new Map<string, { fromSide: Side; toSide: Side }>()

// User-locked nodes. Lock state lives client-side (per-workflow localStorage)
// because the schema migration for `locked_node_ids` is a follow-up; the
// UI affordance and form-level enforcement still matter today. Server-side
// orchestrator enforcement is a stub for now.
const lockedNodeIds = ref<Set<string>>(new Set())
const locksKey = computed(() => `polymux_node_locks_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

// Reset all in-memory canvas state when the user switches workflows. Locks
// also re-hydrate from their own localStorage bucket below.
watch(selectedWorkflowId, () => {
  overrides.value = {}
  sizes.value = {}
  userWires.value = []
  seedPositions.value = {}
  stableWireSides.clear()
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

// Persist stubs retained so existing call sites stay clean. Position /
// size / user-wire state is fully in-memory now; refresh resilience comes
// from the autosave timer (≤ 1 s after the last edit) which commits to
// `workflow_versions`.
function persistOverrides() { /* no-op: positions commit via node_edit op */ }
function persistSizes() { /* no-op: sizes commit via node_edit op */ }
function persistUserWires() { /* no-op: wires commit via wire_add or promoteUserWires */ }

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
  // Mark the lock change as a pending dirty edit so the Save button
  // surfaces it. Versions are only ever created on explicit save (user
  // pressing Save, or the orchestrator save flow under user permission).
  lockSetDirty = true
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

// Snap a single coord to SNAP_GRID when the user has the snap toggle on;
// otherwise pass it through. Used by new-node placement so freshly added
// nodes always land on a clean grid cell.
function snap(v: number): number {
  if (!settings.value.snapToGrid) return v
  return Math.round(v / 24) * 24
}

function snapPt(p: Pt): Pt {
  return { x: snap(p.x), y: snap(p.y) }
}

// Snap `preferred` to grid, then walk diagonally one grid step at a time
// until no existing node occupies that exact coord. Caps the search at
// 64 steps so a fully packed grid still returns SOMETHING rather than
// hanging.
function findFreePlacement(preferred: Pt): Pt {
  let x = snap(preferred.x)
  let y = snap(preferred.y)
  const TOL = 1
  const occupied = (px: number, py: number) => displayedGraph.value.nodes.some((n) => {
    const np = n.position
    if (!np) return false
    return Math.abs(np.x - px) < TOL && Math.abs(np.y - py) < TOL
  })
  let step = 0
  while (occupied(x, y) && step < 64) {
    step += 1
    x += 24
    y += 24
  }
  return { x, y }
}

const allNodes = computed<NodeModel[]>(() => layout.value.nodes)

interface FlatWire {
  id: string
  fromId: string
  toId: string
  // Sides + detached positions the wire was created with (for user-extra
  // wires that carry them — see UserWire). Real `wire:` edges read these
  // from the graph via `wiresById` in `wireGeoms` instead.
  fromPos?: Pt
  toPos?: Pt
  fromSide?: Side
  toSide?: Side
  // Layout-classified style (forward vs back-wire) + persisted control
  // flow metadata, surfaced here so the renderer can style back-wires
  // distinctly and place the loop / conditional pill without re-looking-
  // up the source wire on every render. User-extra wires (no layout
  // entry) default to forward + no condition / iteration cap.
  style?: WireStyle
  condition?: string
  maxIterations?: number
  label?: string
}
const allWires = computed<FlatWire[]>(() => [
  ...layout.value.wires.map(w => ({
    id: w.id,
    fromId: w.fromId,
    toId: w.toId,
    style: w.style,
    condition: w.condition,
    maxIterations: w.maxIterations,
    label: w.label,
  })),
  ...userWires.value.map(w => ({
    id: w.id,
    fromId: w.fromId,
    toId: w.toId,
    fromPos: w.fromPos,
    toPos: w.toPos,
    fromSide: w.fromSide,
    toSide: w.toSide,
  })),
])

function nodePos(node: NodeModel): Pt {
  // Precedence: transient `overrides` overlay (live-preview while a drag
  // is in flight) → persisted `node.position` (from the saved graph) →
  // frozen `seedPositions` memo (one-shot auto-layout fallback for nodes
  // that arrived without a position) → `defaultPos` (terminals + first-
  // observation fallback before the seed watcher fires).
  const ovr = overrides.value[node.id]
  if (ovr) return ovr
  const persisted = node.node.position
  if (persisted) return { x: persisted.x, y: persisted.y }
  const seeded = seedPositions.value[node.id]
  if (seeded) return seeded
  return defaultPos(node)
}

// Seed `seedPositions` for any node that arrives without a `position`. Runs
// every time `displayedGraph` changes but only WRITES new entries — once a
// node id is seeded, its memo entry is frozen until the user switches
// workflows (which clears the memo) or presses Auto-Layout (which commits
// real positions onto the graph and makes this memo irrelevant).
//
// Terminals (Start / End) are seeded too so that wiring two nodes
// together — which can change `maxLayer` and therefore End's default
// column — doesn't drag End across the canvas behind the user's back.
// They re-seed when Auto-Layout clears the memo.
watch(layout, (lay) => {
  let any = false
  for (const m of lay.nodes) {
    if (m.node.position) continue
    if (seedPositions.value[m.id]) continue
    any = true
    break
  }
  if (!any) return
  const next = { ...seedPositions.value }
  for (const m of lay.nodes) {
    if (m.node.position) continue
    if (next[m.id]) continue
    next[m.id] = defaultPos(m)
  }
  seedPositions.value = next
}, { immediate: true })

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
  // Pinch (mouse Ctrl/Cmd-wheel OR macOS trackpad pinch which synthesises
  // ctrlKey) zooms anchored at the cursor. Plain wheel pans the canvas —
  // gives 2-finger trackpad scrolling the same "shove the world around"
  // feel as right-click drag without needing a modifier.
  if (!viewportEl.value) return
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const rect = viewportEl.value.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const oldScale = scale.value
    const newScale = Math.max(0.4, Math.min(2, oldScale * (1 - e.deltaY * 0.0015)))
    if (newScale === oldScale) return
    const wx = (cx - offset.value.x) / oldScale
    const wy = (cy - offset.value.y) / oldScale
    scale.value = newScale
    offset.value = { x: cx - wx * newScale, y: cy - wy * newScale }
    return
  }
  e.preventDefault()
  offset.value = {
    x: offset.value.x - e.deltaX,
    y: offset.value.y - e.deltaY,
  }
}

let isPanning = false
let panStart = { x: 0, y: 0 }
let offsetStart = { x: 0, y: 0 }
let panPointerId = -1

// 2-finger touchscreen gesture (pan + pinch). When a second touch lands on
// the canvas we abandon any in-flight marquee and switch the canvas into
// "phone-map mode" until at least one touch lifts. Trackpad 2-finger
// gestures arrive as `wheel` events instead, handled in onWheel above.
interface TouchGesture {
  initialDist: number
  initialCenter: { x: number; y: number }
  initialScale: number
  initialOffset: Pt
}
let touchGesture: TouchGesture | null = null
const activeTouchPointers = new Map<number, { x: number; y: number }>()

function onCanvasPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement
  if (target.closest('[data-node]')) return

  // Touchscreen: route through multi-pointer state so the 2nd finger
  // upgrades from a marquee to a pan/pinch gesture.
  if (e.pointerType === 'touch') {
    activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    if (activeTouchPointers.size >= 2) {
      if (marqueeState.value?.active) cancelMarquee()
      startTouchGesture()
      e.preventDefault()
      return
    }
    startMarquee(e)
    return
  }

  // Mouse / pen: right-click or middle-click drags the canvas; left-click
  // paints a marquee.
  if (e.button === 1 || e.button === 2) {
    e.preventDefault()
    isPanning = true
    panPointerId = e.pointerId
    panStart = { x: e.clientX, y: e.clientY }
    offsetStart = { ...offset.value }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    return
  }
  if (e.button !== 0) return
  startMarquee(e)
}
function onCanvasPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch' && activeTouchPointers.has(e.pointerId)) {
    activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  if (touchGesture) {
    updateTouchGesture()
    return
  }
  if (isPanning) {
    offset.value = {
      x: offsetStart.x + (e.clientX - panStart.x),
      y: offsetStart.y + (e.clientY - panStart.y),
    }
    return
  }
  if (marqueeState.value?.active) {
    onMarqueeMove(e.clientX, e.clientY)
  }
}
function onCanvasPointerUp(e: PointerEvent) {
  if (e.pointerType === 'touch') {
    activeTouchPointers.delete(e.pointerId)
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) } catch {}
    if (touchGesture) {
      if (activeTouchPointers.size < 2) endTouchGesture()
      else startTouchGesture()
      return
    }
  }
  if (isPanning && (e.pointerType !== 'mouse' || e.pointerId === panPointerId)) {
    isPanning = false
    panPointerId = -1
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) } catch {}
    return
  }
  if (marqueeState.value?.active) {
    onMarqueeUp(e)
  }
}
function onCanvasContextMenu(e: MouseEvent) {
  // Right-click drives pan, so swallow the browser context menu — without
  // this the menu pops the moment the user releases the right button.
  e.preventDefault()
}

// ── Marquee multi-select ───────────────────────────────────────────────────
// Left-click (or 1-finger) drag on empty canvas paints a rectangle. Every
// node and wire whose screen bounding box intersects the rectangle becomes
// selected when the drag ends. The rectangle persists after release with a
// small "delete" toolbar above its top edge — click it to wipe the
// selection, click anywhere else (or press Esc) to dismiss the box.
//
// Coordinates are kept in workflow space so the box stays attached to the
// canvas under pan/zoom. That matters for auto-zoom-out while dragging
// past the viewport edge: the start corner stays pinned to the same
// canvas point while the camera pulls back to reveal more on the cursor
// side.
interface MarqueeState {
  active: boolean
  startWf: Pt
  curWf: Pt
  initialNodeIds: Set<string>
  initialWireIds: Set<string>
  additive: boolean
  pointerId: number
  // Last known cursor in client coords, so the auto-zoom rAF can re-derive
  // curWf each frame when scale/offset shift between pointermove events.
  lastClientX: number
  lastClientY: number
}
const marqueeState = ref<MarqueeState | null>(null)
const persistentMarquee = ref<{ startWf: Pt; endWf: Pt } | null>(null)
const selectedWireIds = ref<Set<string>>(new Set())
let suppressNextCanvasClick = false

function startMarquee(e: PointerEvent) {
  if (!viewportEl.value) return
  e.preventDefault()
  // A fresh drag replaces any leftover persistent box.
  if (persistentMarquee.value) persistentMarquee.value = null
  const wf = screenToWorkflow(e.clientX, e.clientY)
  const additive = e.shiftKey || e.metaKey || e.ctrlKey
  marqueeState.value = {
    active: true,
    startWf: wf,
    curWf: wf,
    initialNodeIds: additive ? new Set(selected.value) : new Set(),
    initialWireIds: additive
      ? new Set([
          ...selectedWireIds.value,
          ...(selectedWireId.value ? [selectedWireId.value] : []),
        ])
      : new Set(),
    additive,
    pointerId: e.pointerId,
    lastClientX: e.clientX,
    lastClientY: e.clientY,
  }
  if (!additive) {
    selected.value = new Set()
    selectedWireIds.value = new Set()
    selectedWireId.value = null
  }
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
  ensureAutoZoomLoop()
}

function onMarqueeMove(clientX: number, clientY: number) {
  const m = marqueeState.value
  if (!m || !m.active) return
  m.lastClientX = clientX
  m.lastClientY = clientY
  m.curWf = screenToWorkflow(clientX, clientY)
  updateMarqueeSelection()
}

function onMarqueeUp(e: PointerEvent) {
  const m = marqueeState.value
  if (!m || !m.active) return
  try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) } catch {}
  marqueeState.value = null
  stopAutoZoomLoop()
  // Normalize a single-wire marquee result into the same shape a wire-click
  // produces (selectedWireId set, selectedWireIds empty). That way the
  // per-wire pill kicks in — without this, a 1-wire marquee left both
  // single- and multi-pills silent.
  if (selected.value.size === 0 && selectedWireIds.value.size === 1) {
    const onlyWire = [...selectedWireIds.value][0]
    if (onlyWire) {
      selectedWireId.value = onlyWire
      selectedWireIds.value = new Set()
    }
  }
  const dragged = Math.abs(m.curWf.x - m.startWf.x) + Math.abs(m.curWf.y - m.startWf.y) > 2
  // The rectangle is a drag-time guide only — it vanishes the instant the
  // pointer lifts. The selection itself (black borders + multi-select pill)
  // is what conveys "these are the items you grabbed."
  persistentMarquee.value = null
  if (dragged) {
    // Swallow the synthesized click on the canvas backdrop — left otherwise
    // it would treat the pointerup site as a background click and clear
    // everything we just selected.
    suppressNextCanvasClick = true
  }
}

function cancelMarquee() {
  if (!marqueeState.value) return
  marqueeState.value = null
  stopAutoZoomLoop()
}

function dismissPersistentMarquee() {
  // Used as the canvas-wide "clear current selection" hook — the toolbar's
  // close button, Esc, and bare canvas clicks all route here. Resets every
  // selection bucket so the user lands in a clean no-selection state
  // regardless of how they got there (marquee, shift-click, single click).
  persistentMarquee.value = null
  selected.value = new Set()
  selectedWireIds.value = new Set()
  selectedWireId.value = null
}

function onCanvasClick(e: MouseEvent) {
  // After a marquee drag, the browser synthesises a click on whatever was
  // under the cursor at release — left alone, that click would re-enter
  // startMarquee and wipe the just-built selection. The flag is set in
  // onMarqueeUp only when the pointer actually moved.
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false
    e.stopPropagation()
    e.preventDefault()
  }
}

// Translate workflow → viewport-relative screen coords (matches the
// transform applied to the inner shift layer: scale * (wf - bounds.min) + offset).
function workflowToViewport(wf: Pt): Pt {
  return {
    x: (wf.x - canvasBounds.value.minX) * scale.value + offset.value.x,
    y: (wf.y - canvasBounds.value.minY) * scale.value + offset.value.y,
  }
}

const marqueeBoxScreen = computed(() => {
  const m = marqueeState.value
  const p = persistentMarquee.value
  let start: Pt | null = null
  let end: Pt | null = null
  if (m && m.active) { start = m.startWf; end = m.curWf }
  else if (p) { start = p.startWf; end = p.endWf }
  if (!start || !end) return null
  const s = workflowToViewport(start)
  const e = workflowToViewport(end)
  const left = Math.min(s.x, e.x)
  const top = Math.min(s.y, e.y)
  const right = Math.max(s.x, e.x)
  const bottom = Math.max(s.y, e.y)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
})

// Screen-space bounding box of the current multi-selection (nodes + wires
// combined). Drives the floating multi-select toolbar's position so it
// sits above the topmost selected item at the same canvas-gap the
// single-node pill uses (PORT_GAP * 2 = 32 canvas-px → scaled to screen).
// Returns null when nothing is selected — the toolbar then doesn't render.
const multiSelectAnchor = computed<{ x: number, y: number } | null>(() => {
  const nodeIds = selected.value
  const wireIds = selectedWireIds.value
  if (nodeIds.size + wireIds.size === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of nodeIds) {
    const n = allNodes.value.find(x => x.id === id)
    if (!n) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + s.w > maxX) maxX = p.x + s.w
    if (p.y + s.h > maxY) maxY = p.y + s.h
  }
  if (wireIds.size > 0) {
    const wires = wireGeoms.value
    for (const w of wires) {
      if (!wireIds.has(w.id)) continue
      const x1 = Math.min(w.p1.x, w.p2.x)
      const y1 = Math.min(w.p1.y, w.p2.y)
      const x2 = Math.max(w.p1.x, w.p2.x)
      const y2 = Math.max(w.p1.y, w.p2.y)
      if (x1 < minX) minX = x1
      if (y1 < minY) minY = y1
      if (x2 > maxX) maxX = x2
      if (y2 > maxY) maxY = y2
    }
  }
  if (!isFinite(minX) || !isFinite(minY)) return null
  const topLeft = workflowToViewport({ x: minX, y: minY })
  const topRight = workflowToViewport({ x: maxX, y: minY })
  // Match the single-node selection pill: 2 * PORT_GAP canvas-px gap above
  // the topmost edge. Scaled into screen space so the visual spacing tracks
  // the same way as that pill at any zoom level.
  return {
    x: (topLeft.x + topRight.x) / 2,
    y: topLeft.y - PORT_GAP * 2 * scale.value,
  }
})

function updateMarqueeSelection() {
  if (!viewportEl.value) return
  const m = marqueeState.value
  if (!m || !m.active) return
  const box = marqueeBoxScreen.value
  if (!box) return
  const rect = viewportEl.value.getBoundingClientRect()
  const clientBox = {
    left: box.left + rect.left,
    right: box.right + rect.left,
    top: box.top + rect.top,
    bottom: box.bottom + rect.top,
  }
  const matchedNodeIds: string[] = []
  const matchedWireIds: string[] = []
  const nodeEls = viewportEl.value.querySelectorAll<HTMLElement>('[data-node-id]')
  for (const el of nodeEls) {
    const id = el.dataset.nodeId
    if (!id) continue
    const r = el.getBoundingClientRect()
    if (
      r.left <= clientBox.right
      && r.right >= clientBox.left
      && r.top <= clientBox.bottom
      && r.bottom >= clientBox.top
    ) matchedNodeIds.push(id)
  }
  const wireEls = viewportEl.value.querySelectorAll<SVGPathElement>('[data-wire-id]')
  for (const el of wireEls) {
    const id = el.dataset.wireId
    if (!id) continue
    const r = el.getBoundingClientRect()
    if (
      r.left <= clientBox.right
      && r.right >= clientBox.left
      && r.top <= clientBox.bottom
      && r.bottom >= clientBox.top
    ) matchedWireIds.push(id)
  }
  selected.value = new Set(
    m.additive ? [...m.initialNodeIds, ...matchedNodeIds] : matchedNodeIds,
  )
  selectedWireIds.value = new Set(
    m.additive ? [...m.initialWireIds, ...matchedWireIds] : matchedWireIds,
  )
}

function deleteMarqueeSelection() {
  const nodeIds = [...selected.value]
  const wireIds = [...selectedWireIds.value]
  if (nodeIds.length === 0 && wireIds.length === 0) {
    dismissPersistentMarquee()
    return
  }
  if (!attemptEdit()) return
  for (const id of wireIds) {
    if (id.startsWith('wire:')) {
      applyStructuralOp({ kind: 'wire_remove', wire_id: id.slice('wire:'.length) })
    } else if (id.startsWith('user:')) {
      userWires.value = userWires.value.filter(w => w.id !== id)
    }
  }
  persistUserWires()
  const deletableNodes = nodeIds.filter(id => !isTerminalId(id) && !isLockedNode(id))
  if (deletableNodes.length > 0) {
    const next = { ...overrides.value }
    for (const id of deletableNodes) delete next[id]
    overrides.value = next
    const dset = new Set(deletableNodes)
    const remaining = userWires.value.filter(w => !dset.has(w.fromId) && !dset.has(w.toId))
    if (remaining.length !== userWires.value.length) {
      userWires.value = remaining
      persistUserWires()
    }
    for (const id of deletableNodes) {
      applyStructuralOp({ kind: 'node_remove', node_id: id })
    }
    persistOverrides()
  }
  selected.value = new Set()
  selectedWireIds.value = new Set()
  selectedWireId.value = null
  persistentMarquee.value = null
  recordHistory()
}

// Offset applied to every duplicated node, in workflow coords. Up-and-right
// so the new copy lands diagonally above the original — close enough that
// the lineage is obvious, far enough that nothing visually overlaps.
const DUPLICATE_OFFSET = { x: 24, y: -24 }

function duplicateSelection() {
  if (!attemptEdit()) return
  const nodeIds = [...selected.value]
  const wireIdsFromSet = [...selectedWireIds.value]
  const singleWireId = selectedWireId.value
  if (nodeIds.length === 0 && wireIdsFromSet.length === 0 && !singleWireId) return

  // Step 1: clone every selectable node (skip terminals — they're spine
  // anchors, not user-editable steps). Stash original→new id so wires
  // selected alongside can rewire to the duplicates.
  const nodeIdMap = new Map<string, string>()
  const newNodeIds: string[] = []
  for (const id of nodeIds) {
    const n = allNodes.value.find(x => x.id === id)
    if (!n || n.terminal) continue
    const original = findNodeById(displayedGraph.value, id)
    if (!original) continue
    const pos = nodePos(n)
    const cloned: WorkflowNode = JSON.parse(JSON.stringify(original))
    cloned.id = ''
    cloned.position = { x: pos.x + DUPLICATE_OFFSET.x, y: pos.y + DUPLICATE_OFFSET.y }
    const addOp: WorkflowOp = { kind: 'node_add', node: cloned }
    if (!applyStructuralOp(addOp)) continue
    const newId = addOp.node.id
    if (!newId) continue
    nodeIdMap.set(id, newId)
    newNodeIds.push(newId)
    if (sizes.value[id]) sizes.value = { ...sizes.value, [newId]: sizes.value[id]! }
  }

  // Step 2: clone wires. A wire whose endpoints both got duplicated re-
  // points at the new copies (so the visual offset carries through);
  // wires with non-duplicated endpoints clone as parallel edges and sit
  // visually on top of the original, which is the best we can do without
  // moving the original endpoint nodes.
  const newWireIds: string[] = []
  const wireIdsToDup = new Set<string>(wireIdsFromSet)
  if (singleWireId) wireIdsToDup.add(singleWireId)
  for (const wId of wireIdsToDup) {
    if (!wId.startsWith('wire:')) continue
    const original = findWireById(displayedGraph.value, wId.slice('wire:'.length))
    if (!original) continue
    const newFromId = nodeIdMap.get(original.from_id) ?? original.from_id
    const newToId = nodeIdMap.get(original.to_id) ?? original.to_id
    const bothUnchanged = newFromId === original.from_id && newToId === original.to_id
    if (bothUnchanged && displayedGraph.value.wires.some(
      e => e.id !== original.id && e.from_id === newFromId && e.to_id === newToId,
    )) continue
    const cloned: WorkflowWire = { id: '', from_id: newFromId, to_id: newToId }
    if (original.from_side) cloned.from_side = original.from_side
    if (original.to_side) cloned.to_side = original.to_side
    if (original.label) cloned.label = original.label
    if (original.condition) cloned.condition = original.condition
    if (typeof original.max_iterations === 'number' && original.max_iterations > 0) {
      cloned.max_iterations = original.max_iterations
    }
    const addOp: WorkflowOp = { kind: 'wire_add', wire: cloned }
    if (!applyStructuralOp(addOp)) continue
    const newId = addOp.wire.id
    if (newId) newWireIds.push('wire:' + newId)
  }

  // Step 3: replace the current selection with the new copies so the user
  // can keep pressing duplicate, drag the group, or hit delete. Match the
  // single-pill rules in onMarqueeUp: 1 wire + 0 nodes promotes to
  // selectedWireId so the per-wire pill takes over.
  selected.value = new Set(newNodeIds)
  if (newWireIds.length === 0) {
    selectedWireIds.value = new Set()
    selectedWireId.value = null
  } else if (newWireIds.length === 1 && newNodeIds.length === 0) {
    selectedWireIds.value = new Set()
    selectedWireId.value = newWireIds[0]!
  } else {
    selectedWireIds.value = new Set(newWireIds)
    selectedWireId.value = null
  }
  // The marquee box was anchored to the original coords — clearing it
  // avoids a stale rectangle hanging behind the new selection. The
  // multi-select pill (anchored on the new positions) still appears.
  persistentMarquee.value = null
  recordHistory()
}

// Grab anywhere inside the persistent marquee box (empty space included) to
// drag the entire selection. Mirrors the node-drag flow but seeds origins
// from every selected node and slides the marquee box along with the
// cursor so it tracks the moving selection.
function onMarqueeBoxPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (!persistentMarquee.value) return
  if (selected.value.size === 0) return
  if (!attemptEdit()) return
  e.stopPropagation()
  e.preventDefault()
  const ids = [...selected.value]
  const origins: Record<string, Pt> = {}
  for (const id of ids) {
    const n = allNodes.value.find(x => x.id === id)
    if (n) origins[id] = nodePos(n)
  }
  const startX = e.clientX
  const startY = e.clientY
  const boxStart = { ...persistentMarquee.value.startWf }
  const boxEnd = { ...persistentMarquee.value.endWf }
  draggingIds.value = new Set(ids)
  frozenCanvasBounds.value = { ...liveCanvasBounds.value }

  function onMove(ev: PointerEvent) {
    const dx = (ev.clientX - startX) / scale.value
    const dy = (ev.clientY - startY) / scale.value
    const next = { ...overrides.value }
    for (const id of ids) {
      const o = origins[id]
      if (!o) continue
      next[id] = { x: o.x + dx, y: o.y + dy }
    }
    overrides.value = next
    if (persistentMarquee.value) {
      persistentMarquee.value = {
        startWf: { x: boxStart.x + dx, y: boxStart.y + dy },
        endWf: { x: boxEnd.x + dx, y: boxEnd.y + dy },
      }
    }
  }
  function onUp() {
    draggingIds.value = new Set()
    frozenCanvasBounds.value = null
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    const moved = ids.filter((id) => {
      const o = origins[id]
      const cur = overrides.value[id]
      return o && cur && (Math.abs(o.x - cur.x) > 0.5 || Math.abs(o.y - cur.y) > 0.5)
    })
    if (moved.length === 0) {
      persistOverrides()
      return
    }
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

// ── 2-finger touch gesture (pan + pinch) ──────────────────────────────────
function startTouchGesture() {
  const pts = [...activeTouchPointers.values()]
  if (pts.length < 2) return
  const p1 = pts[0]!
  const p2 = pts[1]!
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy) || 1
  touchGesture = {
    initialDist: dist,
    initialCenter: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    initialScale: scale.value,
    initialOffset: { ...offset.value },
  }
}

function updateTouchGesture() {
  if (!touchGesture || !viewportEl.value) return
  if (activeTouchPointers.size < 2) return
  const pts = [...activeTouchPointers.values()]
  const p1 = pts[0]!
  const p2 = pts[1]!
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
  const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const rect = viewportEl.value.getBoundingClientRect()
  // Pinch: scale around the initial centroid; the same canvas point should
  // stay under the *current* centroid so the gesture feels anchored.
  const factor = dist / touchGesture.initialDist
  const newScale = Math.max(0.4, Math.min(2, touchGesture.initialScale * factor))
  const c0v = {
    x: touchGesture.initialCenter.x - rect.left,
    y: touchGesture.initialCenter.y - rect.top,
  }
  const cNowV = { x: center.x - rect.left, y: center.y - rect.top }
  const wx = (c0v.x - touchGesture.initialOffset.x) / touchGesture.initialScale
  const wy = (c0v.y - touchGesture.initialOffset.y) / touchGesture.initialScale
  scale.value = newScale
  offset.value = {
    x: cNowV.x - wx * newScale,
    y: cNowV.y - wy * newScale,
  }
}

function endTouchGesture() {
  touchGesture = null
}

// ── Auto-zoom-out while marquee cursor leaves the viewport ────────────────
// Anchored at the marquee START position (in screen coords) — keeps that
// corner visually pinned while more canvas opens up on the side the cursor
// is dragging toward. Speed scales with how far past the edge the cursor
// has wandered, so a tiny overshoot zooms gently and a big one ramps up.
let autoZoomRafId: number | null = null

function ensureAutoZoomLoop() {
  if (autoZoomRafId != null) return
  autoZoomRafId = requestAnimationFrame(autoZoomStep)
}

function stopAutoZoomLoop() {
  if (autoZoomRafId != null) {
    cancelAnimationFrame(autoZoomRafId)
    autoZoomRafId = null
  }
}

function autoZoomStep() {
  autoZoomRafId = null
  const m = marqueeState.value
  if (!m || !m.active || !viewportEl.value) return
  const rect = viewportEl.value.getBoundingClientRect()
  const cx = m.lastClientX
  const cy = m.lastClientY
  const overX = cx < rect.left ? rect.left - cx
    : cx > rect.right ? cx - rect.right
    : 0
  const overY = cy < rect.top ? rect.top - cy
    : cy > rect.bottom ? cy - rect.bottom
    : 0
  if (overX > 0 || overY > 0) {
    const startScreen = workflowToViewport(m.startWf)
    const oldScale = scale.value
    const minScale = 0.4
    const proximity = Math.min(1, Math.hypot(overX, overY) / 200)
    const stepFactor = 1 - 0.06 * proximity
    const newScale = Math.max(minScale, oldScale * stepFactor)
    if (newScale !== oldScale) {
      const wx = (startScreen.x - offset.value.x) / oldScale
      const wy = (startScreen.y - offset.value.y) / oldScale
      scale.value = newScale
      offset.value = {
        x: startScreen.x - wx * newScale,
        y: startScreen.y - wy * newScale,
      }
    }
    // Cursor's workflow position shifts under the new scale/offset — refresh
    // the marquee end + hit-test before the next frame.
    m.curWf = screenToWorkflow(cx, cy)
    updateMarqueeSelection()
  }
  autoZoomRafId = requestAnimationFrame(autoZoomStep)
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
  const nodes = visibleNodes.value
  if (nodes.length === 0) {
    scale.value = 1
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
  // Scale to fit: pick the largest zoom level (clamped to the wheel-zoom
  // bounds) at which the bbox fits inside the available area, with a 32 px
  // breathing margin on each side. Never zoom in past 100% — fit-to-view
  // is "show everything", not "magnify".
  const bboxW = nMaxX - nMinX
  const bboxH = nMaxY - nMinY
  const availW = Math.max(1, rect.width - padLeft - padRight - 64)
  const availH = Math.max(1, rect.height - padTop - padBottom - 64)
  let fitScale = 1
  if (bboxW > 0 && bboxH > 0) {
    fitScale = Math.min(availW / bboxW, availH / bboxH, 1)
  }
  fitScale = Math.max(0.4, Math.min(2, fitScale))
  scale.value = fitScale
  // Map the centre of the nodes' bbox (in workflow coords) to the
  // centre of the *available* (non-overlay) area, not the raw viewport.
  // The shift wrapper translates by (-canvasBounds.minX, -canvasBounds.minY)
  // before scale/offset, so a workflow point at X renders at
  // (X - canvasBounds.minX) * fitScale + offset.x in the viewport.
  const cb = canvasBounds.value
  const midX = (nMinX + nMaxX) / 2
  const midY = (nMinY + nMaxY) / 2
  const targetCx = (padLeft + (rect.width - padRight)) / 2
  const targetCy = (padTop + (rect.height - padBottom)) / 2
  offset.value = {
    x: targetCx - (midX - cb.minX) * fitScale,
    y: targetCy - (midY - cb.minY) * fitScale,
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
watch(selectedWorkflowId, () => {
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
// mirrors the SidePanel.vue rename pattern. Commits write to `title` (the
// top field on the new node model — see workflow_graph.go).
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
  if (isEmbedNode(node)) return
  if (isLockedNode(node.id)) return
  if (!attemptEdit()) return
  renamingNodeId.value = node.id
  const initialText = node.node.title ?? nodeTitle(node)
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
  // Empty rename is a no-op rather than wiping the title out.
  if (trimmed.length === 0) return
  onNodePatch(nodeId, { title: trimmed })
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
  if (isEmbedNode(node)) return
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

// `selectedWireId` stores the FULL wire id (prefix included). For real
// wires that's `wire:<uuid>`; for spine wires it's `spine:<from>-><to>`.
// `selectedWire` only resolves to a WorkflowWire for real wires — spine
// wires have no underlying graph record.
const selectedWire = computed(() => {
  if (!selectedWireId.value) return null
  if (!selectedWireId.value.startsWith('wire:')) return null
  return findWireById(displayedGraph.value, selectedWireId.value.slice('wire:'.length))
})

// loopBodyNodeIds is the set of nodes the currently-selected back-wire
// would iterate over: every node reachable forward from the wire's
// to-end that can also reach the wire's from-end through forward edges.
// Used to render a soft highlight rectangle around the loop body so the
// user sees at a glance which nodes get repeated when the wire fires.
// Empty when nothing's selected, the selection is multi, or the selected
// wire is forward (no loop body to highlight).
const loopBodyNodeIds = computed<Set<string>>(() => {
  const empty = new Set<string>()
  if (selectedWireIds.value.size > 1) return empty
  const w = selectedWire.value
  if (!w) return empty
  if (!w.from_id || !w.to_id) return empty
  const iter = w.max_iterations ?? 0
  if (iter <= 0) return empty
  // Forward adjacency — skip wires that themselves carry a max_iterations
  // cap, since those break the static layering / cycle invariant.
  const forward = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()
  for (const edge of displayedGraph.value.wires) {
    if ((edge.max_iterations ?? 0) > 0) continue
    if (!edge.from_id || !edge.to_id) continue
    if (!forward.has(edge.from_id)) forward.set(edge.from_id, [])
    forward.get(edge.from_id)!.push(edge.to_id)
    if (!reverse.has(edge.to_id)) reverse.set(edge.to_id, [])
    reverse.get(edge.to_id)!.push(edge.from_id)
  }
  const bfs = (start: string, adj: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>([start])
    const frontier: string[] = [start]
    while (frontier.length > 0) {
      const cur = frontier.shift()!
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          frontier.push(next)
        }
      }
    }
    return seen
  }
  const fromTo = bfs(w.to_id, forward)
  const toFrom = bfs(w.from_id, reverse)
  const body = new Set<string>()
  for (const id of fromTo) if (toFrom.has(id)) body.add(id)
  // The two endpoints of the back-wire are always part of the loop body
  // (the from-node sits at the bottom of the loop; the to-node at the
  // top), even when the static forward graph hasn't connected them.
  body.add(w.from_id)
  body.add(w.to_id)
  return body
})

// Embedded-workflow lookup: shared session cache so a graph with many
// embeds pointing at the same workflow id pays exactly one fetch. The
// canvas template reads `embedLookup(id)?.name` for the card label and
// `embedLookup(id)?.latest_version?.steps` for the mini-canvas in the
// InfoPanel — both reactively backfill when the fetch resolves.
const embedCache = useEmbeddedWorkflowCache()

// isEmbedNode is the canonical "this node delegates to another workflow"
// predicate. Used everywhere a render branch / affordance differs for
// embeds: the card layout, port suppression, rename gating, and the
// InfoPanel form switch.
function isEmbedNode(node: NodeModel): boolean {
  const ref = node.node.workflow_ref
  return typeof ref === 'string' && ref.trim() !== ''
}

function embedRefId(node: NodeModel): string {
  const ref = node.node.workflow_ref
  return typeof ref === 'string' ? ref.trim() : ''
}

function embedDisplayName(node: NodeModel): string {
  const id = embedRefId(node)
  if (!id) return ''
  const resolved = embedCache.lookup(id)
  if (resolved?.name) return resolved.name
  // Show a truncated UUID so the card isn't blank while the fetch is in
  // flight or when the referenced workflow has been deleted.
  return id.length > 12 ? id.slice(0, 12) + '…' : id
}

function embedResolved(node: NodeModel): WorkflowWithLatest | null {
  const id = embedRefId(node)
  if (!id) return null
  return embedCache.lookup(id)
}

// Pre-warm the cache when the graph mounts or its embed set changes so
// the first render after open isn't all skeletons.
watchEffect(() => {
  const refs: string[] = []
  for (const n of displayedGraph.value.nodes) {
    const r = typeof n.workflow_ref === 'string' ? n.workflow_ref.trim() : ''
    if (r) refs.push(r)
  }
  if (refs.length > 0) embedCache.request(refs)
})

// loopBodyBounds computes the bounding rectangle of the loop-body nodes
// in canvas coordinates so the renderer can draw a soft tinted rect
// behind those nodes. Padded so the highlight bleeds slightly past the
// node cards. Returns null when there's no loop body to bound.
const LOOP_BODY_PAD = 28
const loopBodyBounds = computed<{ x: number, y: number, w: number, h: number } | null>(() => {
  const ids = loopBodyNodeIds.value
  if (ids.size === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let hits = 0
  for (const node of allNodes.value) {
    if (!ids.has(node.id)) continue
    const p = nodePos(node)
    const s = nodeSize(node)
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + s.w > maxX) maxX = p.x + s.w
    if (p.y + s.h > maxY) maxY = p.y + s.h
    hits++
  }
  if (hits === 0) return null
  return {
    x: minX - LOOP_BODY_PAD,
    y: minY - LOOP_BODY_PAD,
    w: (maxX - minX) + LOOP_BODY_PAD * 2,
    h: (maxY - minY) + LOOP_BODY_PAD * 2,
  }
})

function selectWire(wireId: string) {
  // Real wires must exist in the graph; user wires are canvas-local and
  // valid by virtue of being rendered.
  if (wireId.startsWith('wire:')) {
    const wId = wireId.slice('wire:'.length)
    if (!findWireById(displayedGraph.value, wId)) return
  }
  else if (!wireId.startsWith('user:')) {
    return
  }
  if (persistentMarquee.value) persistentMarquee.value = null
  selected.value = new Set()
  selectedWireIds.value = new Set()
  selectedWireId.value = wireId
  // Pull focus off any text input (typically the chat box at the bottom
  // of the layout) so a follow-up Backspace / Delete reaches the canvas
  // keydown handler instead of editing the input. Without this, clicking
  // a wire selected it visually but Delete typed into the chat field.
  const active = document.activeElement
  if (active instanceof HTMLElement && isEditableFocus()) active.blur()
}

function clearWireSelection() {
  selectedWireId.value = null
}

function deleteSelectedWire() {
  const id = selectedWireId.value
  if (!id) return
  if (id.startsWith('wire:')) {
    applyStructuralOp({ kind: 'wire_remove', wire_id: id.slice('wire:'.length) })
    selectedWireId.value = null
    return
  }
  if (id.startsWith('user:')) {
    // Canvas-local extra (e.g. wire the user dragged to End). Just drop
    // it from the in-memory list — there's no graph wire to remove.
    userWires.value = userWires.value.filter(w => w.id !== id)
    persistUserWires()
    selectedWireId.value = null
  }
}

// Wire endpoint drag — when a wire is selected, two grip dots appear at its
// attachment points. Dragging one moves THAT end (the other end stays put):
// drop on a different node to rewire there; drop on empty space to leave
// the end DETACHED at the drop position (the wire keeps its loose end
// where the user released it, ready to be picked back up later).
//
// `fixedNodeId` is empty when the non-moving end is itself detached (a
// wire can have both ends detached temporarily — re-grabbing the detached
// end of a wire whose other end is also detached is the trivial way there).
interface EndpointDragState {
  wireId: string
  movingEnd: 'from' | 'to'        // which end of the wire the user grabbed
  fixedNodeId: string             // anchored node id; empty when the fixed end is itself detached
  fixedPt: Pt                     // the fixed end's attachment point (workflow coords)
  fixedSide: Side                 // side the wire leaves the fixed end from
  currPos: Pt                     // cursor position in workflow coords
  targetId: string | null         // snapped target node id (only when within SNAP_DIST of a side circle)
  targetSide: Side | null         // snapped target side; pinned together with targetId
  snappedPt: Pt | null            // the snap-target side-centre, in workflow coords
  isDragging: boolean
}
const endpointDrag = ref<EndpointDragState | null>(null)

// Snap distance, in workflow (canvas) coords. The cursor must come within this
// of a node's side-centre for the endpoint to lock onto it. NODE_W / 4 lands
// at 60 px which is forgiving without being so loose that drops in empty
// space register as a connection.
const ENDPOINT_SNAP_DIST = 20

function onEndpointPointerDown(e: PointerEvent, w: WireGeom, end: 'from' | 'to') {
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  // `clickable` covers persisted `wire:` edges plus canvas-local `user:`
  // wires (the latter cover wires touching the synthetic Start / End
  // terminals). Both shapes commit via their own branch in
  // `commitEndpointDrag` keyed on the full wire id prefix.
  if (!w.clickable) return
  if (!attemptEdit()) return
  // Store the FULL wire id (`wire:` or `user:` prefix included) so the
  // commit can dispatch to the right storage on release.
  const wireId = w.id
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
    targetSide: null,
    snappedPt: null,
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
    // Snap-target search: the endpoint locks onto a node's side-centre only
    // when the cursor is within ENDPOINT_SNAP_DIST. Releasing without a snap
    // leaves the wire unchanged (see commitEndpointDrag). User wires can
    // attach to terminals (that's why they live in `userWires` to begin
    // with), so we opt in to terminal targets for the `user:` branch.
    const allowTerminals = endpointDrag.value.wireId.startsWith('user:')
    const hit = isDragging
      ? findSnapTargetAt(wfPos, endpointDrag.value.fixedNodeId, allowTerminals)
      : null
    endpointDrag.value = {
      ...endpointDrag.value,
      currPos: wfPos,
      isDragging,
      targetId: hit?.nodeId ?? null,
      targetSide: hit?.side ?? null,
      snappedPt: hit?.pt ?? null,
    }
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
  // Dispatch on the wire id prefix — persisted `wire:` edges support
  // detached endpoints + metadata; canvas-local `user:` wires (those
  // touching the synthetic Start / End anchors) only support endpoint
  // reassignment in place, or promotion to a real graph wire once both
  // ends become real nodes.
  if (drag.wireId.startsWith('wire:')) commitEndpointDragForGraphWire(drag)
  else if (drag.wireId.startsWith('user:')) commitEndpointDragForUserWire(drag)
}

function commitEndpointDragForGraphWire(drag: EndpointDragState) {
  const realId = drag.wireId.slice('wire:'.length)
  const oldWire = findWireById(displayedGraph.value, realId)
  if (!oldWire) return
  // Resolve the MOVING end's new state. Two shapes:
  //   • snapped on a node side → anchored: id=target, side=snapped, pos=clear
  //   • dropped in empty space → detached: id="", side stays, pos=drop point
  // The fixed end is untouched in both cases.
  let movingNodeId: string
  let movingSide: Side | undefined
  let movingPos: { x: number; y: number } | undefined
  if (drag.targetId && drag.targetSide) {
    // Drop on a node side — self-loop guard: dropping back onto the
    // anchored node would make the wire reference the same node on
    // both ends, which isn't what the user is asking for.
    if (drag.targetId && drag.targetId === drag.fixedNodeId) return
    movingNodeId = drag.targetId
    movingSide = drag.targetSide
    movingPos = undefined
  } else {
    // Drop in empty space — persist the drop point so the loose end
    // stays where the user released it.
    movingNodeId = ''
    movingSide = drag.movingEnd === 'from' ? oldWire.from_side : oldWire.to_side
    movingPos = { x: drag.currPos.x, y: drag.currPos.y }
  }
  // Compose the new wire from old + moving-end overrides.
  const newFromId = drag.movingEnd === 'from' ? movingNodeId : oldWire.from_id
  const newToId = drag.movingEnd === 'to' ? movingNodeId : oldWire.to_id
  const newFromSide = drag.movingEnd === 'from' ? movingSide : oldWire.from_side
  const newToSide = drag.movingEnd === 'to' ? movingSide : oldWire.to_side
  const newFromPos = drag.movingEnd === 'from' ? movingPos : oldWire.from_pos
  const newToPos = drag.movingEnd === 'to' ? movingPos : oldWire.to_pos
  // No-op when nothing observable changed (commonly: the user grabbed
  // and released without moving).
  if (
    newFromId === oldWire.from_id
    && newToId === oldWire.to_id
    && newFromSide === oldWire.from_side
    && newToSide === oldWire.to_side
    && newFromPos === oldWire.from_pos
    && newToPos === oldWire.to_pos
  ) return
  // Duplicate-edge guard applies only when both ends are anchored —
  // two floating ends in empty space can't meaningfully duplicate.
  if (newFromId && newToId) {
    const duplicate = displayedGraph.value.wires.some(
      e => e.id !== realId && e.from_id === newFromId && e.to_id === newToId,
    )
    if (duplicate) {
      toast.show(t('workflow.duplicateEdgeToast'), 'warning', 4000)
      return
    }
  }
  const newWire: WorkflowWire = {
    id: '',
    from_id: newFromId,
    to_id: newToId,
  }
  if (newFromSide) newWire.from_side = newFromSide
  if (newToSide) newWire.to_side = newToSide
  if (newFromPos) newWire.from_pos = newFromPos
  if (newToPos) newWire.to_pos = newToPos
  if (oldWire.label) newWire.label = oldWire.label
  if (oldWire.condition) newWire.condition = oldWire.condition
  if (typeof oldWire.max_iterations === 'number' && oldWire.max_iterations > 0) {
    newWire.max_iterations = oldWire.max_iterations
  }
  if (!applyStructuralOp({ kind: 'wire_remove', wire_id: realId })) return
  applyStructuralOp({ kind: 'wire_add', wire: newWire })
  selectedWireId.value = null
}

function commitEndpointDragForUserWire(drag: EndpointDragState) {
  const existing = userWires.value.find(w => w.id === drag.wireId)
  if (!existing) return
  // Resolve the MOVING end's new state — same two shapes as the graph
  // wire path:
  //   • snap on a node side → anchored: id=target, side=snapped, pos=clear
  //   • drop in empty space → detached: id="", side stays, pos=drop point
  let movingId: string
  let movingSide: Side | undefined
  let movingPos: Pt | undefined
  if (drag.targetId && drag.targetSide) {
    if (drag.targetId === drag.fixedNodeId) return
    movingId = drag.targetId
    movingSide = drag.targetSide
    movingPos = undefined
  } else {
    movingId = ''
    movingSide = drag.movingEnd === 'from' ? existing.fromSide : existing.toSide
    movingPos = { x: drag.currPos.x, y: drag.currPos.y }
  }
  const newFromId = drag.movingEnd === 'from' ? movingId : existing.fromId
  const newToId = drag.movingEnd === 'to' ? movingId : existing.toId
  const newFromSide = drag.movingEnd === 'from' ? movingSide : existing.fromSide
  const newToSide = drag.movingEnd === 'to' ? movingSide : existing.toSide
  const newFromPos = drag.movingEnd === 'from' ? movingPos : existing.fromPos
  const newToPos = drag.movingEnd === 'to' ? movingPos : existing.toPos
  if (
    newFromId === existing.fromId
    && newToId === existing.toId
    && newFromSide === existing.fromSide
    && newToSide === existing.toSide
    && newFromPos === existing.fromPos
    && newToPos === existing.toPos
  ) return
  // If both endpoints are now real graph nodes, promote to a persisted
  // wire — the user has effectively converted the canvas-local sketch
  // into a real graph edge that the orchestrator can run.
  const fromInGraph = !!newFromId && !!findNodeById(displayedGraph.value, newFromId)
  const toInGraph = !!newToId && !!findNodeById(displayedGraph.value, newToId)
  if (fromInGraph && toInGraph) {
    if (
      displayedGraph.value.wires.some(e => e.from_id === newFromId && e.to_id === newToId)
    ) {
      toast.show(t('workflow.duplicateEdgeToast'), 'warning', 4000)
      return
    }
    const graphWire: WorkflowWire = { id: '', from_id: newFromId, to_id: newToId }
    if (newFromSide) graphWire.from_side = newFromSide
    if (newToSide) graphWire.to_side = newToSide
    if (applyStructuralOp({ kind: 'wire_add', wire: graphWire })) {
      userWires.value = userWires.value.filter(w => w.id !== existing.id)
      persistUserWires()
      recordHistory()
    }
    selectedWireId.value = null
    return
  }
  // Still touches a terminal / spawn-extra (or has a floating end) —
  // keep as a user wire with the moving endpoint reassigned in place.
  const next: UserWire = { id: existing.id, fromId: newFromId, toId: newToId }
  if (newFromSide) next.fromSide = newFromSide
  if (newToSide) next.toSide = newToSide
  if (newFromPos) next.fromPos = newFromPos
  if (newToPos) next.toPos = newToPos
  userWires.value = userWires.value.map(w => (w.id === existing.id ? next : w))
  persistUserWires()
  recordHistory()
  selectedWireId.value = null
}

// ── Wire body drag ──────────────────────────────────────────────────────────
// Grabbing a SELECTED wire's body (the transparent hit zone, not the white
// grip dots) translates both endpoints by the cursor delta. On release each
// end either snaps onto a node (linking by id) or stays at its translated
// position (floating via `*_pos`). Same gesture as moving a node, scoped to
// the wire so the user can reposition a wire as a single object.
interface WireBodyDragState {
  wireId: string         // full prefixed id (`wire:` or `user:`)
  startCursor: Pt        // workflow coords at pointerdown
  delta: Pt              // cursor offset since startCursor
  origFromId: string     // empty when the start state was detached
  origToId: string
  origFromPos: Pt        // resolved start position (node side-centre or floating)
  origToPos: Pt
  origFromSide: Side
  origToSide: Side
  fromSnap: SnapHit | null
  toSnap: SnapHit | null
  isDragging: boolean
}
const wireBodyDrag = ref<WireBodyDragState | null>(null)

function onWireBodyPointerDown(e: PointerEvent, w: WireGeom) {
  if (e.button !== 0) return
  if (!w.clickable) return
  // Wire-body drag only fires on the ALREADY-selected wire. First click
  // selects via `@click.stop="selectWire(...)"`, second click + move
  // starts the drag — same single/double interaction as a node.
  if (selectedWireId.value !== w.id) return
  if (!attemptEdit()) return
  e.stopPropagation()
  e.preventDefault()
  const startWf = screenToWorkflow(e.clientX, e.clientY)
  wireBodyDrag.value = {
    wireId: w.id,
    startCursor: startWf,
    delta: { x: 0, y: 0 },
    origFromId: w.fromId,
    origToId: w.toId,
    origFromPos: { ...w.p1 },
    origToPos: { ...w.p2 },
    origFromSide: w.fromSide,
    origToSide: w.toSide,
    fromSnap: null,
    toSnap: null,
    isDragging: false,
  }
  const screenStartX = e.clientX
  const screenStartY = e.clientY
  // User wires accept terminal snap targets at either end; graph wires
  // can't reference synthetic Start/End, so terminals stay excluded.
  const allowTerminals = w.id.startsWith('user:')

  function onMove(ev: PointerEvent) {
    if (!wireBodyDrag.value) return
    const dx = ev.clientX - screenStartX
    const dy = ev.clientY - screenStartY
    const moved = Math.hypot(dx, dy)
    const wfPos = screenToWorkflow(ev.clientX, ev.clientY)
    const delta = { x: wfPos.x - startWf.x, y: wfPos.y - startWf.y }
    const isDragging = wireBodyDrag.value.isDragging || moved >= DRAG_THRESHOLD
    let fromSnap: SnapHit | null = null
    let toSnap: SnapHit | null = null
    if (isDragging) {
      const newFromPt = {
        x: wireBodyDrag.value.origFromPos.x + delta.x,
        y: wireBodyDrag.value.origFromPos.y + delta.y,
      }
      const newToPt = {
        x: wireBodyDrag.value.origToPos.x + delta.x,
        y: wireBodyDrag.value.origToPos.y + delta.y,
      }
      // Find snap targets for each end independently; nothing is
      // excluded because both endpoints are moving.
      fromSnap = findSnapTargetAt(newFromPt, '', allowTerminals)
      toSnap = findSnapTargetAt(newToPt, '', allowTerminals)
      // Self-loop guard: if both ends would snap to the same node, drop
      // whichever match is further from its own endpoint position.
      if (fromSnap && toSnap && fromSnap.nodeId === toSnap.nodeId) {
        const fd = Math.hypot(newFromPt.x - fromSnap.pt.x, newFromPt.y - fromSnap.pt.y)
        const td = Math.hypot(newToPt.x - toSnap.pt.x, newToPt.y - toSnap.pt.y)
        if (fd <= td) toSnap = null
        else fromSnap = null
      }
    }
    wireBodyDrag.value = {
      ...wireBodyDrag.value,
      delta,
      isDragging,
      fromSnap,
      toSnap,
    }
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    commitWireBodyDrag()
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

// Live geometry for the in-flight wire-body drag. Mirrors the resting
// wire but with both endpoints translated by `delta`. Snapped ends
// clip to the snap target's side-centre so the preview shows where
// the wire would land on release.
const wireBodyDragGeom = computed<{ d: string } | null>(() => {
  const drag = wireBodyDrag.value
  if (!drag || !drag.isDragging) return null
  const fromSide = drag.fromSnap ? drag.fromSnap.side : drag.origFromSide
  const toSide = drag.toSnap ? drag.toSnap.side : drag.origToSide
  // Snapped ends: convert the snap circle position back to the drawn
  // endpoint so the arrowhead tip kisses the circle's outer edge while
  // held (matches resting state). Unsnapped ends: same translate-by-delta
  // path as before, then shortened via `wireDrawnEndPt`.
  const fromDrawn = drag.fromSnap
    ? wireDrawnEndPtFromSnap(drag.fromSnap.pt, drag.fromSnap.side)
    : wireDrawnEndPt(
      { x: drag.origFromPos.x + drag.delta.x, y: drag.origFromPos.y + drag.delta.y },
      fromSide,
    )
  const toDrawn = drag.toSnap
    ? wireDrawnEndPtFromSnap(drag.toSnap.pt, drag.toSnap.side)
    : wireDrawnEndPt(
      { x: drag.origToPos.x + drag.delta.x, y: drag.origToPos.y + drag.delta.y },
      toSide,
    )
  const wt = settings.value.wireType ?? 'step'
  // Exclude both anchor nodes (and any node the wire has snapped to
  // mid-drag) from obstacles so the preview doesn't self-collide with
  // its own endpoint cards.
  const obstacles = obstaclesExcept(
    drag.origFromId,
    drag.origToId,
    drag.fromSnap?.nodeId,
    drag.toSnap?.nodeId,
  )
  return { d: routedWirePath(fromDrawn, toDrawn, fromSide, toSide, wt, obstacles) }
})

function commitWireBodyDrag() {
  const drag = wireBodyDrag.value
  if (!drag) return
  wireBodyDrag.value = null
  if (!drag.isDragging) return
  const newFromPt = {
    x: drag.origFromPos.x + drag.delta.x,
    y: drag.origFromPos.y + drag.delta.y,
  }
  const newToPt = {
    x: drag.origToPos.x + drag.delta.x,
    y: drag.origToPos.y + drag.delta.y,
  }
  // Resolve each end: snap → anchored (id + side); else → detached
  // (empty id + floating pos).
  const newFromId = drag.fromSnap ? drag.fromSnap.nodeId : ''
  const newToId = drag.toSnap ? drag.toSnap.nodeId : ''
  const newFromSide = drag.fromSnap ? drag.fromSnap.side : drag.origFromSide
  const newToSide = drag.toSnap ? drag.toSnap.side : drag.origToSide
  const newFromPos = drag.fromSnap ? undefined : newFromPt
  const newToPos = drag.toSnap ? undefined : newToPt
  if (drag.wireId.startsWith('wire:')) {
    commitWireBodyDragForGraphWire(drag.wireId.slice('wire:'.length), {
      newFromId, newToId, newFromSide, newToSide, newFromPos, newToPos,
    })
  }
  else if (drag.wireId.startsWith('user:')) {
    commitWireBodyDragForUserWire(drag.wireId, {
      newFromId, newToId, newFromSide, newToSide, newFromPos, newToPos,
    })
  }
}

interface WireBodyDragCommit {
  newFromId: string
  newToId: string
  newFromSide: Side
  newToSide: Side
  newFromPos: Pt | undefined
  newToPos: Pt | undefined
}

function commitWireBodyDragForGraphWire(realId: string, next: WireBodyDragCommit) {
  const oldWire = findWireById(displayedGraph.value, realId)
  if (!oldWire) return
  // Duplicate-edge guard: only meaningful when both ends anchor to real nodes.
  if (next.newFromId && next.newToId) {
    const duplicate = displayedGraph.value.wires.some(
      e => e.id !== realId && e.from_id === next.newFromId && e.to_id === next.newToId,
    )
    if (duplicate) {
      toast.show(t('workflow.duplicateEdgeToast'), 'warning', 4000)
      return
    }
  }
  const newWire: WorkflowWire = {
    id: '',
    from_id: next.newFromId,
    to_id: next.newToId,
  }
  if (next.newFromSide) newWire.from_side = next.newFromSide
  if (next.newToSide) newWire.to_side = next.newToSide
  if (next.newFromPos) newWire.from_pos = next.newFromPos
  if (next.newToPos) newWire.to_pos = next.newToPos
  if (oldWire.label) newWire.label = oldWire.label
  if (oldWire.condition) newWire.condition = oldWire.condition
  if (typeof oldWire.max_iterations === 'number' && oldWire.max_iterations > 0) {
    newWire.max_iterations = oldWire.max_iterations
  }
  if (!applyStructuralOp({ kind: 'wire_remove', wire_id: realId })) return
  applyStructuralOp({ kind: 'wire_add', wire: newWire })
}

function commitWireBodyDragForUserWire(wireId: string, next: WireBodyDragCommit) {
  const existing = userWires.value.find(w => w.id === wireId)
  if (!existing) return
  // Promote to a graph wire when both ends land on real graph nodes.
  const fromInGraph = !!next.newFromId && !!findNodeById(displayedGraph.value, next.newFromId)
  const toInGraph = !!next.newToId && !!findNodeById(displayedGraph.value, next.newToId)
  if (fromInGraph && toInGraph) {
    if (
      displayedGraph.value.wires.some(e => e.from_id === next.newFromId && e.to_id === next.newToId)
    ) {
      toast.show(t('workflow.duplicateEdgeToast'), 'warning', 4000)
      return
    }
    const graphWire: WorkflowWire = { id: '', from_id: next.newFromId, to_id: next.newToId }
    if (next.newFromSide) graphWire.from_side = next.newFromSide
    if (next.newToSide) graphWire.to_side = next.newToSide
    if (applyStructuralOp({ kind: 'wire_add', wire: graphWire })) {
      userWires.value = userWires.value.filter(w => w.id !== wireId)
      persistUserWires()
      recordHistory()
    }
    return
  }
  const replacement: UserWire = { id: existing.id, fromId: next.newFromId, toId: next.newToId }
  if (next.newFromSide) replacement.fromSide = next.newFromSide
  if (next.newToSide) replacement.toSide = next.newToSide
  if (next.newFromPos) replacement.fromPos = next.newFromPos
  if (next.newToPos) replacement.toPos = next.newToPos
  userWires.value = userWires.value.map(w => (w.id === wireId ? replacement : w))
  persistUserWires()
  recordHistory()
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
  // Single-click on a node retires the persistent marquee — the user is
  // moving on to a per-node interaction.
  if (persistentMarquee.value) {
    persistentMarquee.value = null
    selectedWireIds.value = new Set()
  }
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
  // Snap to grid + jitter off any existing node at the same coords so a
  // freshly placed node always lands somewhere visible.
  const pos = findFreePlacement(placingNode.value)
  // Commit `position` directly on the new node so it renders at the placed
  // location without needing a transient overlay. The node carries its own
  // geometry from creation onward.
  const addOp: WorkflowOp = { kind: 'node_add', node: { id: '', position: pos } }
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

// ── Manual wire placement ──────────────────────────────────────────────────
// The "draw wire" toolbar button starts a two-click gesture: click 1 sets
// the tail (latched to a node port if the cursor is on one, free coords
// otherwise); click 2 sets the head with the same rules. Between clicks
// the cursor trails a rubber-band wire so the user can see what they're
// about to commit. Escape cancels.
interface PlacingWireEndpoint {
  nodeId?: string
  side?: Side
  pos: Pt
}
interface PlacingWireState {
  phase: 'tail' | 'head'
  cursor: Pt
  snap: SnapHit | null
  tail: PlacingWireEndpoint | null
}
const placingWire = ref<PlacingWireState | null>(null)

// Gesture-down screen coords + whether the pointerdown that started this
// gesture also placed the tail. Drives drag-vs-click discrimination on
// pointerup. Kept outside the reactive ref so writing it doesn't trigger
// re-renders.
interface PlacingWireGesture {
  downScreen: { x: number; y: number }
  dragStartedFromTail: boolean
}
let placingWireGesture: PlacingWireGesture | null = null

function startPlacingWire() {
  if (placingWire.value) {
    cancelPlacingWire()
    return
  }
  if (!attemptEdit()) return
  // Mutually exclusive with node placement — pressing one while the other
  // is armed should swap, not stack both gestures' listeners.
  if (placingNode.value) cancelPlacing()
  placingWire.value = { phase: 'tail', cursor: { x: 0, y: 0 }, snap: null, tail: null }
  placingWireGesture = null
  document.addEventListener('pointermove', onPlacingWireMove)
  document.addEventListener('pointerdown', onPlacingWireDown, true)
  document.addEventListener('pointerup', onPlacingWireUp, true)
  document.addEventListener('keydown', onPlacingWireKey)
}

function onPlacingWireMove(ev: PointerEvent) {
  if (!placingWire.value) return
  const wf = screenToWorkflow(ev.clientX, ev.clientY)
  // Head-phase can't latch back onto the tail's own node (that would be a
  // self-loop, which the wire-add validator rejects). Terminals are
  // allowed as either end — same rule as the port-drag flow.
  const excludeId = placingWire.value.phase === 'head'
    ? placingWire.value.tail?.nodeId ?? ''
    : ''
  const snap = findSnapTargetAt(wf, excludeId, true)
  placingWire.value = { ...placingWire.value, cursor: wf, snap }
}

function onPlacingWireKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    cancelPlacingWire()
  }
}

// Pointerdown opens a gesture. In tail phase it places the tail (latched
// or free) and transitions to head; the head will commit on the matching
// pointerup if the user dragged, otherwise we stay in head waiting for
// another gesture (click-click flow). In head phase pointerdown only
// records the gesture start — the second click / drag-end commits on its
// pointerup so the wire lands at the release coords, not at the press.
function onPlacingWireDown(ev: PointerEvent) {
  if (!placingWire.value) return
  if (ev.button !== 0) return
  const target = ev.target as Element | null
  if (!target || !viewportEl.value?.contains(target)) {
    cancelPlacingWire()
    return
  }
  // Wire-tool owns the gesture — block the canvas pan / port drag / node
  // pointerdown handlers that would otherwise fire on the same press.
  ev.stopPropagation()
  ev.preventDefault()
  const wf = screenToWorkflow(ev.clientX, ev.clientY)
  const state = placingWire.value
  const excludeId = state.phase === 'head' ? state.tail?.nodeId ?? '' : ''
  const snap = findSnapTargetAt(wf, excludeId, true)
  if (state.phase === 'tail') {
    const tail: PlacingWireEndpoint = snap
      ? { nodeId: snap.nodeId, side: snap.side, pos: snap.pt }
      : { pos: { ...wf } }
    placingWire.value = { ...state, phase: 'head', tail, snap: null, cursor: wf }
    placingWireGesture = {
      downScreen: { x: ev.clientX, y: ev.clientY },
      dragStartedFromTail: true,
    }
    return
  }
  // Phase 'head' — record gesture start. Commit happens on pointerup.
  placingWire.value = { ...state, snap, cursor: wf }
  placingWireGesture = {
    downScreen: { x: ev.clientX, y: ev.clientY },
    dragStartedFromTail: false,
  }
}

function onPlacingWireUp(ev: PointerEvent) {
  if (!placingWire.value || !placingWireGesture) return
  if (ev.button !== 0) return
  const gesture = placingWireGesture
  placingWireGesture = null
  const state = placingWire.value
  // Only the head commits on pointerup. Tail-only gestures (a quick click
  // that just placed the tail) end here without committing — the user is
  // free to either drag-from-elsewhere or click again to set the head.
  if (state.phase !== 'head') return
  const dx = ev.clientX - gesture.downScreen.x
  const dy = ev.clientY - gesture.downScreen.y
  const moved = Math.hypot(dx, dy) >= DRAG_THRESHOLD
  // Two valid commit moments:
  //  • Drag flow: pointerdown placed the tail in this same gesture AND
  //    the user dragged before releasing → release coord is the head.
  //  • Click-click flow: pointerdown happened with the tail already set
  //    (separate gesture from the one that placed it) → release coord
  //    is the head regardless of movement, matching the old click flow.
  const shouldCommit = gesture.dragStartedFromTail ? moved : true
  if (!shouldCommit) return
  ev.stopPropagation()
  ev.preventDefault()
  const head: PlacingWireEndpoint = state.snap
    ? { nodeId: state.snap.nodeId, side: state.snap.side, pos: state.snap.pt }
    : { pos: { ...state.cursor } }
  commitPlacedWire(state.tail!, head)
  cancelPlacingWire()
}

function commitPlacedWire(tail: PlacingWireEndpoint, head: PlacingWireEndpoint) {
  // Self-loop guard — same rule the port-drag flow enforces in addUserWire.
  if (tail.nodeId && head.nodeId && tail.nodeId === head.nodeId) return
  // Both ends anchored on a node: delegate to `addUserWire`, which already
  // routes between persisted `wire_add` (both ends real graph nodes) and
  // the canvas-local `userWires` fallback (one or both ends are a synthetic
  // terminal like Start / End that the wire-add validator rejects).
  if (tail.nodeId && head.nodeId) {
    const newId = addUserWire(tail.nodeId, head.nodeId, tail.side, head.side)
    if (newId) selectWire(newId)
    return
  }
  // At least one end is free — use the persisted wire's detached-endpoint
  // path. A free end anchored on a terminal is converted to a floating
  // coord here too, since the validator can't accept the terminal id.
  const wire: WorkflowWire = { id: '', from_id: '', to_id: '' }
  if (tail.nodeId && findNodeById(displayedGraph.value, tail.nodeId)) {
    wire.from_id = tail.nodeId
    if (tail.side) wire.from_side = tail.side
  }
  else {
    wire.from_pos = { x: tail.pos.x, y: tail.pos.y }
  }
  if (head.nodeId && findNodeById(displayedGraph.value, head.nodeId)) {
    wire.to_id = head.nodeId
    if (head.side) wire.to_side = head.side
  }
  else {
    wire.to_pos = { x: head.pos.x, y: head.pos.y }
  }
  if (applyStructuralOp({ kind: 'wire_add', wire })) {
    recordHistory()
    selectWire(`wire:${wire.id}`)
  }
}

function cancelPlacingWire() {
  placingWire.value = null
  placingWireGesture = null
  document.removeEventListener('pointermove', onPlacingWireMove)
  document.removeEventListener('pointerdown', onPlacingWireDown, true)
  document.removeEventListener('pointerup', onPlacingWireUp, true)
  document.removeEventListener('keydown', onPlacingWireKey)
}

// Rubber-band wire that trails the cursor after the tail click is placed.
// Reuses the same `buildWirePath` the live wires use so the preview looks
// identical to the wire that will commit on the second click.
const placingWireGeom = computed<{ d: string } | null>(() => {
  const state = placingWire.value
  if (!state || state.phase !== 'head' || !state.tail) return null
  const fromSide: Side = state.tail.side ?? 'right'
  // If the tail latched onto a side circle, push its drawn endpoint outward
  // so the wire stroke kisses the circle's outer edge instead of disappearing
  // under it; falls back to the raw cursor position for an unsnapped tail.
  const tailPos = state.tail.side
    ? wireDrawnEndPtFromSnap(state.tail.pos, state.tail.side)
    : state.tail.pos
  const head = state.snap
    ? { pos: wireDrawnEndPtFromSnap(state.snap.pt, state.snap.side), side: state.snap.side }
    : { pos: state.cursor, side: oppositeSide(fromSide) }
  const wt = settings.value.wireType ?? 'step'
  // Exclude the tail node and any node the head has snapped to so the
  // preview doesn't try to route around its own endpoint cards.
  const obstacles = obstaclesExcept(state.tail.nodeId, state.snap?.nodeId)
  return { d: routedWirePath(tailPos, head.pos, fromSide, head.side, wt, obstacles) }
})

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
  // Create a real graph node (not a canvas-local "extra") with its position
  // baked in, so it survives reset-layout, gets saved with the version, and
  // is visible to the run executor / orchestrator. The op assigns an id back
  // into op.node.id; we chain a wire_add from the parent so the new node is
  // wired in.
  const spawnPos = snapPt({ x, y })
  const addNode: WorkflowOp = { kind: 'node_add', node: { id: '', position: spawnPos } }
  const nodeResult = applyOp(displayedGraph.value, addNode)
  if (!nodeResult.ok) {
    toast.show(nodeResult.error, 'warning', 4000)
    return
  }
  const newId = addNode.node.id
  let nextGraph = nodeResult.graph
  // Wire from parent to the new node when the parent is a real graph node.
  // Terminals (Start / End) aren't in the persisted graph, so the connection
  // is stored as a canvas-local `user:` wire instead (same shape as a wire
  // the user draws by hand from a terminal). Either way the user sees a
  // visible wire from the port they clicked to the freshly-spawned node.
  // The new node sits on the OPPOSITE side of the parent, so the wire
  // leaves the clicked port (`side`) and arrives at the new node on the
  // mirrored side — gives the natural "out the right, into the left"
  // routing instead of a curve that bends across the card.
  const toSide = oppositeSide(side)
  if (parent.terminal) {
    const userWireId = `user:${parent.id}->${newId}-${Date.now()}`
    const entry: UserWire = {
      id: userWireId,
      fromId: parent.id,
      toId: newId,
      fromSide: side,
      toSide,
    }
    userWires.value = [...userWires.value, entry]
    persistUserWires()
  }
  else if (findNodeById(nextGraph, parent.id)) {
    const wireOp: WorkflowOp = {
      kind: 'wire_add',
      wire: { id: '', from_id: parent.id, to_id: newId, from_side: side, to_side: toSide },
    }
    const wireResult = applyOp(nextGraph, wireOp)
    if (wireResult.ok) nextGraph = wireResult.graph
  }
  userGraph.value = nextGraph
  editedDraft.value = {}
  dirtyNodeIds.value = new Set()
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
  // Snapped target: populated only when the cursor is within
  // ENDPOINT_SNAP_DIST of a specific side-centre circle. `targetId` and
  // `targetSide` move together so we never end up with a half-snap state.
  targetId: string | null
  targetSide: Side | null
  snappedPt: Pt | null
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

interface SnapHit {
  nodeId: string
  side: Side
  pt: Pt
}

// findSnapTargetAt is the side-snap analogue of findTargetAt: rather than
// a generous padded bbox, it requires the cursor to come within
// ENDPOINT_SNAP_DIST of a node's side-centre point. Returns the nearest
// hit. `includeTerminals` lets the port-drag (which CAN draw a wire to
// the synthetic Start/End anchors as canvas-local `user:` wires) opt in;
// endpoint-drag of an existing real wire keeps them excluded because the
// server rejects wires whose endpoints aren't real graph nodes.
function findSnapTargetAt(
  wfPos: Pt,
  excludeId: string,
  includeTerminals = false,
): SnapHit | null {
  let best: { hit: SnapHit; dist: number } | null = null
  for (const n of visibleNodes.value) {
    if (n.id === excludeId) continue
    if (n.terminal && !includeTerminals) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      // Snap math matches the visible target circle position
      // (side-centre nudged outward by ENDPOINT_HANDLE_OFFSET).
      const pt = endpointHandlePt(pointOnSide(p, side, s), side)
      const d = Math.hypot(wfPos.x - pt.x, wfPos.y - pt.y)
      if (d > ENDPOINT_SNAP_DIST) continue
      if (!best || d < best.dist) {
        best = { hit: { nodeId: n.id, side, pt }, dist: d }
      }
    }
  }
  return best?.hit ?? null
}

// Returns the new wire's full prefixed id (`wire:<uuid>` or `user:...`) on
// success, or null when the wire was rejected (self-loop, duplicate, or
// op failure). Callers select the wire so the user keeps focus on what they
// just made instead of the source node staying highlighted.
function addUserWire(fromId: string, toId: string, fromSide?: Side, toSide?: Side): string | null {
  if (fromId === toId) return null
  // Skip endpoints not present in the graph (e.g. spawn-extra nodes) — wires
  // must connect real graph nodes so the orchestrator + executor see them.
  const fromInGraph = !!findNodeById(displayedGraph.value, fromId)
  const toInGraph = !!findNodeById(displayedGraph.value, toId)
  if (!fromInGraph || !toInGraph) {
    // Fall back to the canvas-local userWires (legacy localStorage track),
    // so spawn-extras keep working without touching the persisted graph.
    // Sides from the port-drag snap are kept on the entry so the wire
    // renders out of the exact circle the user dropped onto instead of
    // being re-routed by the auto picker.
    if (allWires.value.some(w => w.fromId === fromId && w.toId === toId)) return null
    const id = `user:${fromId}->${toId}-${Date.now()}`
    const entry: UserWire = { id, fromId, toId }
    if (fromSide) entry.fromSide = fromSide
    if (toSide) entry.toSide = toSide
    userWires.value = [...userWires.value, entry]
    persistUserWires()
    recordHistory()
    return id
  }
  // Skip exact duplicates on the persisted graph.
  if (displayedGraph.value.wires.some(e => e.from_id === fromId && e.to_id === toId)) return null
  // Persist via the structural-op path so the new wire survives reloads and
  // shows up in the orchestrator's draft. Sides are carried over from the
  // port-drag snap so the wire renders out of the exact circle the user
  // latched onto, instead of being re-picked by the auto router.
  const wire: WorkflowWire = {
    id: '',
    from_id: fromId,
    to_id: toId,
  }
  if (fromSide) wire.from_side = fromSide
  if (toSide) wire.to_side = toSide
  if (!applyStructuralOp({ kind: 'wire_add', wire })) return null
  return `wire:${wire.id}`
}

function onPortPointerDown(e: PointerEvent, parent: NodeModel, side: Side) {
  // While the draw-wire tool is armed, let `onPlacingWireDown` take the
  // pointerdown via its document-capture listener instead of starting the
  // port-drag / spawn flow. Its snap search latches onto this port from
  // the cursor coords.
  if (placingWire.value) return
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  const pp = nodePos(parent)
  const port = pointOnSide(pp, side, nodeSize(parent))
  connecting.value = {
    fromId: parent.id,
    fromSide: side,
    startPos: port,
    currPos: port,
    targetId: null,
    targetSide: null,
    snappedPt: null,
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
    // Snap math matches endpoint-drag: latch only when the cursor is
    // within ENDPOINT_SNAP_DIST of a specific side-centre circle. No
    // generous bbox catch — the user picks the exact side. Terminals
    // are included here since port-drag CAN produce a wire-to-End
    // (stored as a canvas-local `user:` wire).
    const snap = isDragging
      ? findSnapTargetAt(wfPos, connecting.value.fromId, true)
      : null
    connecting.value = {
      ...connecting.value,
      currPos: wfPos,
      isDragging,
      targetId: snap?.nodeId ?? null,
      targetSide: snap?.side ?? null,
      snappedPt: snap?.pt ?? null,
    }
  }

  function onUp() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    const c = connecting.value
    if (!c) return
    connecting.value = null
    if (!c.isDragging) {
      // Treat as a click → existing spawn behaviour.
      spawnFromPort(parent, side)
      return
    }
    if (c.targetId) {
      // Snapped on a side circle — create an anchored wire. Select it so
      // the user keeps focus on what they just made (otherwise the source
      // node — already selected because the port only renders when it is —
      // stays highlighted, which reads as "the click did nothing").
      const newId = addUserWire(
        c.fromId,
        c.targetId,
        c.fromSide,
        c.targetSide ?? undefined,
      )
      if (newId) selectWire(newId)
      return
    }
    // Dropped in empty space — persist a graph wire with the to-end
    // detached at the drop point so the arrow stays where the user
    // released it (mirrors the endpoint-drag detach behaviour). The
    // source is always a real graph node since port-drag fires from a
    // node card, so the from-end stays anchored. `to_side` matches the
    // in-flight rubber-band's routing (opposite of `fromSide`) so the
    // wire's silhouette doesn't pop after release.
    const wire: WorkflowWire = {
      id: '',
      from_id: c.fromId,
      to_id: '',
      from_side: c.fromSide,
      to_side: oppositeSide(c.fromSide),
      to_pos: { x: c.currPos.x, y: c.currPos.y },
    }
    if (applyStructuralOp({ kind: 'wire_add', wire })) {
      selectWire(`wire:${wire.id}`)
    }
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

// Live geometry for the rubber-band wire that follows the cursor while the
// user is dragging from a port. Snaps onto the target's nearest side once
// a candidate target is locked in.
const tempWireGeom = computed<{ d: string } | null>(() => {
  if (!connecting.value || !connecting.value.isDragging) return null
  const c = connecting.value
  const sourcePort = c.startPos

  let endPort: Pt
  let targetSide: Side
  if (c.snappedPt && c.targetSide) {
    // Latched onto a specific side-centre circle — push the drawn endpoint
    // outward past the circle so the arrowhead tip kisses its outer edge
    // (matching the resting wire) while the drag is still held, instead
    // of disappearing under the circle until release.
    endPort = wireDrawnEndPtFromSnap(c.snappedPt, c.targetSide)
    targetSide = c.targetSide
  }
  else {
    // Free cursor — treat the cursor as arriving opposite the source's
    // outward normal so the preview's shape reads naturally for every
    // wire style (especially step's orthogonal routing).
    endPort = c.currPos
    targetSide = oppositeSide(c.fromSide)
  }
  const wt = settings.value.wireType ?? 'step'
  // Exclude the source node and any node the cursor has snapped to so
  // the rubber-band doesn't try to route around its own endpoint cards.
  const obstacles = obstaclesExcept(c.fromId, c.targetId)
  return {
    d: routedWirePath(sourcePort, endPort, c.fromSide, targetSide, wt, obstacles),
  }
})

// Preview wire for an in-flight endpoint drag — anchored on the fixed end
// of the existing edge, the other end follows the cursor (snapping to the
// candidate target node if one is under the cursor).
interface EndpointSnapCircle {
  nodeId: string
  side: Side
  pt: Pt
  active: boolean   // currently snapped target — render with accent stroke
  fixed: boolean    // the fixed end's anchor — non-interactive
}

// Snap-target circles to render while a wire endpoint is being dragged.
// One per side for every non-terminal, non-fixed node; one at the fixed
// end's existing side (so the anchored end stays visually anchored).
// Position matches `endpointHandlePt` (side-centre nudged outward by
// ENDPOINT_HANDLE_OFFSET) so the dragged grip circle visually lands on
// the snap-target circle without a jump.
const endpointSnapTargets = computed<EndpointSnapCircle[]>(() => {
  const drag = endpointDrag.value
  if (!drag || !drag.isDragging) return []
  // User wires (Start/End-touching canvas-local wires) accept terminal
  // snap targets — mirror that in the snap-circle layer so the user
  // can see all valid drop targets, not just the real-node ones.
  const allowTerminals = drag.wireId.startsWith('user:')
  const out: EndpointSnapCircle[] = []
  for (const n of visibleNodes.value) {
    if (n.terminal && !allowTerminals) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    if (n.id === drag.fixedNodeId) {
      out.push({
        nodeId: n.id,
        side: drag.fixedSide,
        pt: endpointHandlePt(pointOnSide(p, drag.fixedSide, s), drag.fixedSide),
        active: false,
        fixed: true,
      })
      continue
    }
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      out.push({
        nodeId: n.id,
        side,
        pt: endpointHandlePt(pointOnSide(p, side, s), side),
        active: drag.targetId === n.id && drag.targetSide === side,
        fixed: false,
      })
    }
  }
  return out
})

// Snap-target circles to render while a whole wire is being dragged
// by its body. Both endpoints are translating, so each one independently
// hunts for the nearest side-centre. Active highlight reflects the
// per-end snap state computed in `onWireBodyPointerDown`'s `onMove`.
const wireBodyDragSnapTargets = computed<EndpointSnapCircle[]>(() => {
  const drag = wireBodyDrag.value
  if (!drag || !drag.isDragging) return []
  const allowTerminals = drag.wireId.startsWith('user:')
  const out: EndpointSnapCircle[] = []
  for (const n of visibleNodes.value) {
    if (n.terminal && !allowTerminals) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      const isFromSnap = drag.fromSnap?.nodeId === n.id && drag.fromSnap?.side === side
      const isToSnap = drag.toSnap?.nodeId === n.id && drag.toSnap?.side === side
      out.push({
        nodeId: n.id,
        side,
        pt: endpointHandlePt(pointOnSide(p, side, s), side),
        active: isFromSnap || isToSnap,
        fixed: false,
      })
    }
  }
  return out
})

// Snap-target circles to render while the user is drawing a brand-new
// wire from a port. Mirrors `endpointSnapTargets` for the endpoint-drag
// case, but the source-node here is excluded (you can't wire a node to
// itself) and terminals ARE included (a wire to End is allowed as a
// canvas-local `user:` wire).
const connectingSnapTargets = computed<EndpointSnapCircle[]>(() => {
  const conn = connecting.value
  if (!conn || !conn.isDragging) return []
  const out: EndpointSnapCircle[] = []
  for (const n of visibleNodes.value) {
    if (n.id === conn.fromId) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      out.push({
        nodeId: n.id,
        side,
        pt: endpointHandlePt(pointOnSide(p, side, s), side),
        active: conn.targetId === n.id && conn.targetSide === side,
        fixed: false,
      })
    }
  }
  return out
})

// Snap-target circles to render while the click-click draw-wire tool is
// armed. Same visual contract as `endpointSnapTargets` /
// `connectingSnapTargets` — white circle on every side of every visible
// node, with the currently-hovered side accent-stroked. Terminals are
// included so a free-floating wire can be drawn to / from Start / End.
// The tail's own node is excluded once the user is placing the head, so
// the user can't draw a self-loop (the wire-add validator rejects those).
// Distance (canvas px) from the cursor to a node's bounding box at which
// the draw-wire tool reveals that node's side-snap circles. Comfortably
// larger than ENDPOINT_SNAP_DIST so the circles materialise before the
// user is close enough to actually latch, but small enough that idle
// cursor movement across empty canvas doesn't light up nearby nodes.
const PLACING_WIRE_ACTIVATION_DIST = 60
const placingWireSnapTargets = computed<EndpointSnapCircle[]>(() => {
  const state = placingWire.value
  if (!state) return []
  const excludeId = state.phase === 'head' ? state.tail?.nodeId ?? '' : ''
  const cursor = state.cursor
  const out: EndpointSnapCircle[] = []
  for (const n of visibleNodes.value) {
    if (n.id === excludeId) continue
    const p = nodePos(n)
    const s = nodeSize(n)
    // Closest-point distance from cursor to the node's padded rect — zero
    // when inside, the perpendicular drop otherwise. Skipping nodes outside
    // the activation ring keeps the snap layer focused on whatever the
    // user is approaching instead of plastering circles on every node.
    const dx = Math.max(p.x - cursor.x, 0, cursor.x - (p.x + s.w))
    const dy = Math.max(p.y - cursor.y, 0, cursor.y - (p.y + s.h))
    if (Math.hypot(dx, dy) > PLACING_WIRE_ACTIVATION_DIST) continue
    for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
      out.push({
        nodeId: n.id,
        side,
        pt: endpointHandlePt(pointOnSide(p, side, s), side),
        active: state.snap?.nodeId === n.id && state.snap?.side === side,
        fixed: false,
      })
    }
  }
  return out
})

const endpointDragWireGeom = computed<{ d: string } | null>(() => {
  const drag = endpointDrag.value
  if (!drag || !drag.isDragging) return null
  let endPt: Pt
  let endSide: Side
  if (drag.snappedPt && drag.targetSide) {
    // Snapped to a side-centre target — push the drawn endpoint outward
    // past the snap circle so the arrowhead tip kisses the circle's outer
    // edge while the drag is still held, matching the resting wire's tip
    // position exactly. Without this, the tip would sit at the circle's
    // centre (under it) and only snap into place on release.
    endPt = wireDrawnEndPtFromSnap(drag.snappedPt, drag.targetSide)
    endSide = drag.targetSide
  }
  else {
    // Unsnapped: track the cursor freely. The "side" used for routing is the
    // opposite of the fixed end so the curve still reads.
    endPt = drag.currPos
    endSide = oppositeSide(drag.fixedSide)
  }
  // Shorten the fixed end so the rubber-band visually stops in the
  // anchor-circle gap, matching the resting wire's shortened endpoints.
  const fixedDrawn = wireDrawnEndPt(drag.fixedPt, drag.fixedSide)
  const wt = settings.value.wireType ?? 'step'
  // Exclude the fixed-end node and any node the dragged end has snapped
  // to so the preview doesn't try to route around its own endpoint cards.
  const obstacles = obstaclesExcept(drag.fixedNodeId, drag.targetId)
  // The path direction follows the original edge: if the user is moving
  // the FROM end, the temp goes endPt → fixedDrawn; if moving TO, fixedDrawn → endPt.
  if (drag.movingEnd === 'from') {
    return { d: routedWirePath(endPt, fixedDrawn, endSide, drag.fixedSide, wt, obstacles) }
  }
  return { d: routedWirePath(fixedDrawn, endPt, drag.fixedSide, endSide, wt, obstacles) }
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

// (mid - port) · outwardNormal(side). Positive when the port faces TOWARD
// the chord midpoint (normal inward-flow, like A.right → B.left for nodes
// side-by-side); negative when the port faces AWAY (A.left → B.right). The
// outward case is what triggers wraparound routing in wireGeoms.
function outwardNormalDotMid(side: Side, port: Pt, mid: Pt): number {
  const n = outwardNormal(side)
  return (mid.x - port.x) * n.x + (mid.y - port.y) * n.y
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

// `outwardNormal` is defined further below near the wire-routing helpers and
// re-used here for nudging the arrow-head endpoint grip circle outboard so it
// sits just past the arrowhead marker instead of on top of it.

const ENDPOINT_CIRCLE_R = 4

// Pointer-event hit radius for the grip dots. The visible circle stays
// at `ENDPOINT_CIRCLE_R`; an invisible disc of this radius sits on top
// so the user doesn't need pixel-perfect aim to grab the endpoint.
const ENDPOINT_GRIP_HIT_R = 12

// The grip circle sits CENTRED on the node's border at the side-centre
// — half inside the node body, half outside. The wire's drawn end stops
// exactly at the outer edge of the circle (`WIRE_END_GAP` =
// `ENDPOINT_CIRCLE_R`) so the arrowhead tip kisses the circle without
// any gap between them.
const WIRE_END_GAP = ENDPOINT_CIRCLE_R

// Position of the grip circle (and matching snap-target circle) for a
// node side. `pointOnSide` returns the OUTER edge of the card's box, but
// the card draws a `border-2` line INSIDE that box (Tailwind defaults to
// `box-sizing: border-box`), so the visible border's centre sits half a
// border width inboard of the outer edge. Nudging the grip the same
// distance inward puts the visible border line through the middle of
// the circle instead of along its outboard edge.
const NODE_BORDER_HALF = 1
function endpointHandlePt(sideCenter: Pt, side: Side): Pt {
  switch (side) {
    case 'right': return { x: sideCenter.x - NODE_BORDER_HALF, y: sideCenter.y }
    case 'left': return { x: sideCenter.x + NODE_BORDER_HALF, y: sideCenter.y }
    case 'top': return { x: sideCenter.x, y: sideCenter.y + NODE_BORDER_HALF }
    case 'bottom': return { x: sideCenter.x, y: sideCenter.y - NODE_BORDER_HALF }
  }
}

// The endpoint where the wire is actually drawn — `WIRE_END_GAP` past
// the side-centre. Lines up with the outer edge of the grip circle so
// the wire's arrowhead just touches the circle.
function wireDrawnEndPt(sideCenter: Pt, side: Side): Pt {
  const n = outwardNormal(side)
  return {
    x: sideCenter.x + n.x * WIRE_END_GAP,
    y: sideCenter.y + n.y * WIRE_END_GAP,
  }
}

// In-flight rubber-bands store the latched endpoint as the snap CIRCLE
// position (`endpointHandlePt`, i.e. side-centre nudged inward by
// `NODE_BORDER_HALF`). Pushing it back out by `NODE_BORDER_HALF +
// WIRE_END_GAP` puts the wire's drawn endpoint exactly where a resting
// wire's would sit, so the arrowhead tip kisses the circle's outer edge
// while the drag is still held — instead of disappearing under the
// circle and only snapping into place on release.
function wireDrawnEndPtFromSnap(snapPt: Pt, side: Side): Pt {
  const n = outwardNormal(side)
  const out = WIRE_END_GAP + NODE_BORDER_HALF
  return {
    x: snapPt.x + n.x * out,
    y: snapPt.y + n.y * out,
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

// True when the segment from `a` to `b` enters the rectangle.
// Used by the obstacle-aware wire side picker so wires bend around
// unrelated nodes rather than slicing through them.
function segmentCrossesRect(
  a: Pt, b: Pt, rx: number, ry: number, rw: number, rh: number,
): boolean {
  const rRight = rx + rw
  const rBottom = ry + rh
  // Quick reject if both endpoints lie strictly outside one side.
  if ((a.x < rx && b.x < rx) || (a.x > rRight && b.x > rRight)) return false
  if ((a.y < ry && b.y < ry) || (a.y > rBottom && b.y > rBottom)) return false
  // Either endpoint inside → counts as a crossing.
  if (a.x >= rx && a.x <= rRight && a.y >= ry && a.y <= rBottom) return true
  if (b.x >= rx && b.x <= rRight && b.y >= ry && b.y <= rBottom) return true
  // Otherwise check intersection against each rectangle edge.
  return (
    segmentsIntersect(a, b, { x: rx, y: ry }, { x: rRight, y: ry })
    || segmentsIntersect(a, b, { x: rRight, y: ry }, { x: rRight, y: rBottom })
    || segmentsIntersect(a, b, { x: rRight, y: rBottom }, { x: rx, y: rBottom })
    || segmentsIntersect(a, b, { x: rx, y: rBottom }, { x: rx, y: ry })
  )
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const dx1 = p2.x - p1.x
  const dy1 = p2.y - p1.y
  const dx2 = p4.x - p3.x
  const dy2 = p4.y - p3.y
  const denom = dx2 * dy1 - dy2 * dx1
  if (Math.abs(denom) < 1e-9) return false
  const ua = (dx2 * (p1.y - p3.y) - dy2 * (p1.x - p3.x)) / denom
  const ub = (dx1 * (p1.y - p3.y) - dy1 * (p1.x - p3.x)) / denom
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

// Polyline approximation of a wire used for obstacle-overlap detection.
// Fluid wires are sampled because their bezier curve bows out beyond the
// chord — sampling at a few points along the curve catches obstacles the
// chord would skip past. Step / linear collapse to a small set of corners.
const OBSTACLE_PAD = 8
function wireSamplePoints(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, wireType: WireType,
): Pt[] {
  if (wireType === 'linear') return [p1, p2]
  if (wireType === 'step') return wireWaypoints(p1, p2, fromSide, toSide, 'step')
  // Fluid: sample 9 points along the cubic bezier we render.
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const d = Math.max(40, Math.min(180, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5))
  const c1 = { x: p1.x + n1.x * d, y: p1.y + n1.y * d }
  const c2 = { x: p2.x + n2.x * d, y: p2.y + n2.y * d }
  const pts: Pt[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const omt = 1 - t
    const x = omt * omt * omt * p1.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * p2.x
    const y = omt * omt * omt * p1.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * p2.y
    pts.push({ x, y })
  }
  return pts
}

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
  const wt = settings.value.wireType ?? 'step'

  // Precompute every node's bbox so the per-side-pair scoring loop can
  // ask "does this route cross any unrelated node?" without re-deriving
  // positions / sizes each iteration.
  const obstacles: { id: string; x: number; y: number; w: number; h: number }[] = []
  for (const n of allNodes.value) {
    const p = nodePos(n)
    const s = nodeSize(n)
    obstacles.push({ id: n.id, x: p.x, y: p.y, w: s.w, h: s.h })
  }

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
    // Dominant axis for this wire — picked from how the nodes overlap.
    // Two nodes whose x-projections overlap with a vertical gap between
    // them want top/bottom ports (vertical wire down the gap); two whose
    // y-projections overlap with a horizontal gap want left/right ports
    // (horizontal wire across the gap). Falls back to the bigger of
    // |dx|/|dy| for diagonal layouts where neither projection overlaps.
    // The alignment weight always overrides the bend cost so the wire
    // emits along the dominant axis — for vertically separated nodes
    // (whether X-overlapping or just |dy|-dominant), the Z with its
    // horizontal middle leg in the gap wins over a 1-bend L whose
    // corner would sit near one of the nodes. The overlap case carries
    // a stronger weight so a clean axis match never gets traded for
    // anything else; the diagonal case carries a weight just above the
    // bend cost so a clearly-h diagonal still gets its L.
    const xOverlap = Math.min(pa.x + sa.w, pb.x + sb.w) - Math.max(pa.x, pb.x) > 0
    const yOverlap = Math.min(pa.y + sa.h, pb.y + sb.h) - Math.max(pa.y, pb.y) > 0
    let dominantAxis: 'h' | 'v'
    if (xOverlap && !yOverlap) dominantAxis = 'v'
    else if (yOverlap && !xOverlap) dominantAxis = 'h'
    else dominantAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
    const alignmentWeight = (xOverlap !== yOverlap) ? 2e9 : 1.5e9

    for (const fromSide of aCandidates) {
      const p1 = pointOnSide(pa, fromSide, sa)
      for (const toSide of bCandidates) {
        const p2 = pointOnSide(pb, toSide, sb)
        const info = pathInfo(p1, p2, fromSide, toSide)
        const ex = p2.x - p1.x
        const ey = p2.y - p1.y
        const dist2 = ex * ex + ey * ey
        // Obstacle penalty: count unrelated node bboxes the wire's
        // polyline crosses. Each crossing dominates bends/distance so the
        // picker actively routes around bodies, but never beats
        // feasibility (a non-folding-back route is still preferred over a
        // clean-but-folding one).
        let crossings = 0
        if (obstacles.length > 2) {
          const samples = wireSamplePoints(p1, p2, fromSide, toSide, wt)
          for (const obs of obstacles) {
            if (obs.id === a.id || obs.id === b.id) continue
            const ox = obs.x - OBSTACLE_PAD
            const oy = obs.y - OBSTACLE_PAD
            const ow = obs.w + 2 * OBSTACLE_PAD
            const oh = obs.h + 2 * OBSTACLE_PAD
            for (let i = 0; i < samples.length - 1; i++) {
              if (segmentCrossesRect(samples[i]!, samples[i + 1]!, ox, oy, ow, oh)) {
                crossings += 1
                break
              }
            }
          }
        }
        // Alignment penalty: how many endpoints sit on a side that's
        // perpendicular to the dominant axis. With a strong weight (set
        // above based on whether the nodes' bboxes overlap on one
        // axis), this overrides the bend cost — for vertically
        // separated nodes overlapping in x, a 2-bend top→bottom wire
        // (with its horizontal middle leg in the gap) beats a 1-bend
        // right→bottom L that exits through an unnatural side. For
        // diagonal layouts the weight is weaker than a single bend so a
        // natural 1-bend L still wins.
        const fromAligned = sideAxis(fromSide) === dominantAxis ? 0 : 1
        const toAligned = sideAxis(toSide) === dominantAxis ? 0 : 1
        const alignment = fromAligned + toAligned
        // Lexicographic score: feasibility ≫ obstacles ≫ alignment ≫ bends ≫ port distance ≫ rank.
        const score
          = (info.feasible ? 0 : 1e15)
            + crossings * 1e12
            + alignment * alignmentWeight
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
  // Toolbar anchor — centre of the wire's longest straight segment, with
  // an orientation derived from the wire's bounding rect (wider → render
  // the toolbar horizontally above; taller → render vertically beside).
  toolbarAnchor: { x: number, y: number, orientation: 'horizontal' | 'vertical' }
  // `clickable` — wire responds to clicks (selects + highlights). True for
  // both real graph wires (`wire:`) and synthetic spine wires (`spine:`).
  // `selectable` — wire supports full editing (endpoint drag, action bar,
  // side panel form). True only for real graph wires.
  clickable: boolean
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
  // Layout-classified style + persisted control-flow metadata, used for
  // back-wire stroke styling and the loop / conditional pill rendered
  // mid-wire. Undefined for synthetic spine wires and detached drafts.
  style?: WireStyle
  condition?: string
  maxIterations?: number
  label?: string
}

// Waypoint list for a wire — the polyline approximation used for bbox /
// longest-segment math. Step wires return their full corner sequence;
// linear / fluid wires collapse to the two endpoints (good enough for the
// fluid case since the curve's extent is bounded near the chord).
function wireWaypoints(p1: Pt, p2: Pt, fromSide: Side, toSide: Side, wireType: WireType): Pt[] {
  if (wireType !== 'step') return [p1, p2]
  const isFromHorizontal = fromSide === 'left' || fromSide === 'right'
  const isToHorizontal = toSide === 'left' || toSide === 'right'
  const pts: Pt[] = [{ ...p1 }]
  if (isFromHorizontal && isToHorizontal) {
    const mx = (p1.x + p2.x) / 2
    pts.push({ x: mx, y: p1.y })
    pts.push({ x: mx, y: p2.y })
  } else if (!isFromHorizontal && !isToHorizontal) {
    const my = (p1.y + p2.y) / 2
    pts.push({ x: p1.x, y: my })
    pts.push({ x: p2.x, y: my })
  } else if (isFromHorizontal) {
    pts.push({ x: p2.x, y: p1.y })
  } else {
    pts.push({ x: p1.x, y: p2.y })
  }
  pts.push({ ...p2 })
  return pts
}

interface Obstacle { x: number; y: number; w: number; h: number }

// Pick a fluid cubic bezier's control points, then push them perpendicular
// to the chord — by chunks of `pushStep` — until the sampled curve stops
// poking inside any obstacle rectangle (excluding the endpoint nodes,
// which are passed in already filtered). The push direction is chosen by
// which side of the chord has more room. Caps at ~6 attempts so we don't
// loop forever on pathological cases; if we can't clear it, we still
// return a path — just one with as much clearance as we could get.
function fluidControlsAvoidingObstacles(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): { c1: Pt; c2: Pt } {
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const dist = Math.max(40, Math.min(180, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.5))
  let c1 = { x: p1.x + n1.x * dist, y: p1.y + n1.y * dist }
  let c2 = { x: p2.x + n2.x * dist, y: p2.y + n2.y * dist }
  if (obstacles.length === 0) return { c1, c2 }

  // Perpendicular to the chord. Both directions are candidates; we try
  // the one that puts the chord midpoint further from any obstacle.
  const cx = p2.x - p1.x
  const cy = p2.y - p1.y
  const clen = Math.max(1, Math.hypot(cx, cy))
  const perpA: Pt = { x: -cy / clen, y: cx / clen }
  const perpB: Pt = { x: cy / clen, y: -cx / clen }
  const mid: Pt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const distToObstacles = (dir: Pt): number => {
    let best = Infinity
    for (const o of obstacles) {
      const ocx = o.x + o.w / 2
      const ocy = o.y + o.h / 2
      const probe = { x: mid.x + dir.x * 50, y: mid.y + dir.y * 50 }
      const d = Math.hypot(probe.x - ocx, probe.y - ocy)
      if (d < best) best = d
    }
    return best
  }
  const perp = distToObstacles(perpA) >= distToObstacles(perpB) ? perpA : perpB

  const PUSH_STEP = 40
  const MAX_PUSHES = 6
  for (let pass = 0; pass < MAX_PUSHES; pass++) {
    if (!fluidCrossesAnyObstacle(p1, c1, c2, p2, obstacles)) break
    c1 = { x: c1.x + perp.x * PUSH_STEP, y: c1.y + perp.y * PUSH_STEP }
    c2 = { x: c2.x + perp.x * PUSH_STEP, y: c2.y + perp.y * PUSH_STEP }
  }
  return { c1, c2 }
}

function fluidCrossesAnyObstacle(
  p1: Pt, c1: Pt, c2: Pt, p2: Pt, obstacles: Obstacle[],
): boolean {
  // Sample the cubic bezier — 13 points is plenty for the curve sizes we
  // see here without being expensive.
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const omt = 1 - t
    const x = omt * omt * omt * p1.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * p2.x
    const y = omt * omt * omt * p1.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * p2.y
    for (const o of obstacles) {
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true
    }
  }
  return false
}

// Does an axis-aligned segment cross a rect's interior? Endpoints sitting
// exactly on the rect boundary don't count as crossings — important
// because every stub starts at p1 / p2, which are on the wire's endpoint
// node's edge. Different from the generic `segmentCrossesRect` defined
// for the side-picker above: that one treats boundary contact as a hit;
// here we need the opposite so stub endpoints don't false-trigger.
function orthoSegmentCrossesRect(a: Pt, b: Pt, r: Obstacle): boolean {
  const rx2 = r.x + r.w
  const ry2 = r.y + r.h
  if (Math.abs(a.y - b.y) < 0.5) {
    // Horizontal segment at y = a.y.
    if (a.y <= r.y || a.y >= ry2) return false
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    return maxX > r.x && minX < rx2
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    // Vertical segment at x = a.x.
    if (a.x <= r.x || a.x >= rx2) return false
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return maxY > r.y && minY < ry2
  }
  // Generic (diagonal) — our routes are orthogonal so this only fires
  // for the linear wire-type. Skip the check there; the natural straight
  // line is what the user asked for.
  return false
}

function polylineCrossesAnyObstacle(pts: Pt[], obstacles: Obstacle[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    for (const o of obstacles) {
      if (orthoSegmentCrossesRect(a, b, o)) return true
    }
  }
  return false
}

function polylineLength(pts: Pt[]): number {
  let len = 0
  for (let i = 0; i < pts.length - 1; i++) {
    len += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
  }
  return len
}

// Plan an orthogonal route from p1 (leaving fromSide) to p2 (arriving
// from toSide) that doesn't cross any obstacle interior. The route
// always starts with a STUB-px perpendicular stub out of p1 and ends
// with a STUB-px perpendicular stub into p2, so the arrow lands square
// on the edge. Between the stubs, we try a handful of orthogonal
// candidates (direct, around-top, around-bottom, around-left,
// around-right) and pick the shortest one that clears every obstacle.
// Returns null if no candidate clears — caller falls back to fluid.
function planOrthogonalRoute(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): Pt[] | null {
  const STUB = 24
  const CLEAR = 28
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const stubFrom: Pt = { x: p1.x + n1.x * STUB, y: p1.y + n1.y * STUB }
  const stubTo: Pt = { x: p2.x + n2.x * STUB, y: p2.y + n2.y * STUB }
  const isFromHorizontal = fromSide === 'left' || fromSide === 'right'
  const isToHorizontal = toSide === 'left' || toSide === 'right'

  // Bounding rectangle of all obstacles + the stubs / endpoints — used
  // to size the around-* detour lanes so they always clear.
  let minX = Math.min(stubFrom.x, stubTo.x, p1.x, p2.x)
  let maxX = Math.max(stubFrom.x, stubTo.x, p1.x, p2.x)
  let minY = Math.min(stubFrom.y, stubTo.y, p1.y, p2.y)
  let maxY = Math.max(stubFrom.y, stubTo.y, p1.y, p2.y)
  for (const o of obstacles) {
    if (o.x < minX) minX = o.x
    if (o.x + o.w > maxX) maxX = o.x + o.w
    if (o.y < minY) minY = o.y
    if (o.y + o.h > maxY) maxY = o.y + o.h
  }
  const topLane = minY - CLEAR
  const bottomLane = maxY + CLEAR
  const leftLane = minX - CLEAR
  const rightLane = maxX + CLEAR

  const candidates: Pt[][] = []

  // Direct: stub out, connect to other stub, stub in. Branches on the
  // port orientations so the connection between stubs is always
  // orthogonal — same-axis ports collapse to a Z, mixed axes get an L.
  if (isFromHorizontal && isToHorizontal) {
    if (Math.abs(stubFrom.y - stubTo.y) < 0.5) {
      candidates.push([p1, stubFrom, stubTo, p2])
    }
    else {
      const mx = (stubFrom.x + stubTo.x) / 2
      candidates.push([
        p1, stubFrom,
        { x: mx, y: stubFrom.y },
        { x: mx, y: stubTo.y },
        stubTo, p2,
      ])
    }
  }
  else if (!isFromHorizontal && !isToHorizontal) {
    if (Math.abs(stubFrom.x - stubTo.x) < 0.5) {
      candidates.push([p1, stubFrom, stubTo, p2])
    }
    else {
      const my = (stubFrom.y + stubTo.y) / 2
      candidates.push([
        p1, stubFrom,
        { x: stubFrom.x, y: my },
        { x: stubTo.x, y: my },
        stubTo, p2,
      ])
    }
  }
  else if (isFromHorizontal) {
    // Two L variants. Variant A turns at stubFrom's y (extend along the
    // source's outward direction, then bend perpendicular into the
    // target). Variant B turns perpendicular at stubFrom.x first, then
    // crosses to stubTo. Variant A collapses to a clean 1-bend L when
    // stubTo sits forward of stubFrom along the source's outward axis,
    // but folds back through stubFrom into a 180° spike when stubTo
    // sits behind — Variant B has 90° corners in every layout, so the
    // spike-filter below can drop Variant A without leaving us empty.
    candidates.push([
      p1, stubFrom,
      { x: stubTo.x, y: stubFrom.y },
      stubTo, p2,
    ])
    candidates.push([
      p1, stubFrom,
      { x: stubFrom.x, y: stubTo.y },
      stubTo, p2,
    ])
  }
  else {
    candidates.push([
      p1, stubFrom,
      { x: stubFrom.x, y: stubTo.y },
      stubTo, p2,
    ])
    candidates.push([
      p1, stubFrom,
      { x: stubTo.x, y: stubFrom.y },
      stubTo, p2,
    ])
  }

  // Around-top / around-bottom: route along the perpendicular lane
  // above / below the obstacle bbox, with stubs into both endpoints.
  // The horizontal-aligned candidates work for both horizontal-horizontal
  // and mixed configs (the lane is set on the cross axis of each stub).
  candidates.push([
    p1, stubFrom,
    { x: stubFrom.x, y: topLane },
    { x: stubTo.x, y: topLane },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: stubFrom.x, y: bottomLane },
    { x: stubTo.x, y: bottomLane },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: leftLane, y: stubFrom.y },
    { x: leftLane, y: stubTo.y },
    stubTo, p2,
  ])
  candidates.push([
    p1, stubFrom,
    { x: rightLane, y: stubFrom.y },
    { x: rightLane, y: stubTo.y },
    stubTo, p2,
  ])

  // No-stub direct candidates — route p1 → midpoint → p2 without the
  // fixed STUB-px stub. These exist for close-node layouts where the
  // stub-based Z / L candidates above all collapse into 180° spikes
  // because stubFrom and stubTo overlap each other. Without the stub
  // there's no overlap to backtrack across, so the candidate is clean
  // even when the endpoints are 1–2px apart in one axis. For wide-node
  // layouts these have the same total length as the stub-based Z (both
  // run along the same midpoint axis), and the stub-based candidate is
  // listed first so it wins the tiebreak — preserving the schematic
  // look with a clean STUB-length straight before/after each corner.
  if (isFromHorizontal && isToHorizontal) {
    if (Math.abs(p1.y - p2.y) < 0.5) {
      candidates.push([p1, p2])
    }
    else {
      const dmx = (p1.x + p2.x) / 2
      candidates.push([p1, { x: dmx, y: p1.y }, { x: dmx, y: p2.y }, p2])
    }
  }
  else if (!isFromHorizontal && !isToHorizontal) {
    if (Math.abs(p1.x - p2.x) < 0.5) {
      candidates.push([p1, p2])
    }
    else {
      const dmy = (p1.y + p2.y) / 2
      candidates.push([p1, { x: p1.x, y: dmy }, { x: p2.x, y: dmy }, p2])
    }
  }
  else if (isFromHorizontal) {
    candidates.push([p1, { x: p2.x, y: p1.y }, p2])
    candidates.push([p1, { x: p1.x, y: p2.y }, p2])
  }
  else {
    candidates.push([p1, { x: p1.x, y: p2.y }, p2])
    candidates.push([p1, { x: p2.x, y: p1.y }, p2])
  }

  // Pick the shortest candidate that doesn't cross any obstacle AND
  // doesn't fold back through itself at a corner. The stubs are first /
  // last segments and always sit on the boundary of the wire's endpoint
  // nodes (which are obstacles when their ports are outward) —
  // `segmentCrossesRect` treats boundary contact as "outside" so the
  // stubs themselves never false-positive. The spike check rejects
  // candidates where any interior corner is a 180° backtrack, which
  // would render as a pointy degenerate arc instead of a smooth bend.
  let best: Pt[] | null = null
  let bestLen = Infinity
  for (const pts of candidates) {
    if (hasOrthogonalSpike(pts)) continue
    if (polylineCrossesAnyObstacle(pts, obstacles)) continue
    const len = polylineLength(pts)
    if (len < bestLen) {
      bestLen = len
      best = pts
    }
  }
  return best
}

// True when any interior vertex in the polyline is a 180° backtrack —
// the previous and next vertices both lie on the same side of the
// corner along the same axis. The rounded-corner renderer collapses
// these into a degenerate spike instead of a smooth arc, so route
// planners use this to drop candidates that would render as a pointy
// outcropping near the stub.
function hasOrthogonalSpike(pts: Pt[]): boolean {
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = prev.x - curr.x
    const v1y = prev.y - curr.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    // Zero-length segments fold into their neighbour at render time;
    // they can't produce a spike on their own.
    if (len1 < 0.5 || len2 < 0.5) continue
    // Both vectors point into the same half-plane → corner folds back
    // on itself. Dot product is positive only when the angle between
    // them is < 90°, which for axis-aligned vectors means parallel
    // same-direction (180° backtrack).
    if (v1x * v2x + v1y * v2y > 0) return true
  }
  return false
}

// Grid A* orthogonal router used when `planOrthogonalRoute`'s 5 fixed
// candidates all crash through obstacles — typically when a third node
// sits between the wire's endpoints on the natural lane, or when
// neighbouring nodes block the wraparound lanes the simple planner would
// have used. Returns a polyline (p1 → stubFrom → grid-aligned interior →
// stubTo → p2) that weaves around every obstacle interior, or null if
// even the stub cell itself is blocked (source / target overlap with an
// obstacle), in which case the caller falls through to `buildWirePath`.
function aStarOrthogonalRoute(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, obstacles: Obstacle[],
): Pt[] | null {
  const STEP = 24
  const STUB = 24
  const n1 = outwardNormal(fromSide)
  const n2 = outwardNormal(toSide)
  const stubFrom: Pt = { x: p1.x + n1.x * STUB, y: p1.y + n1.y * STUB }
  const stubTo: Pt = { x: p2.x + n2.x * STUB, y: p2.y + n2.y * STUB }

  let minX = Math.min(stubFrom.x, stubTo.x, p1.x, p2.x)
  let maxX = Math.max(stubFrom.x, stubTo.x, p1.x, p2.x)
  let minY = Math.min(stubFrom.y, stubTo.y, p1.y, p2.y)
  let maxY = Math.max(stubFrom.y, stubTo.y, p1.y, p2.y)
  for (const o of obstacles) {
    if (o.x < minX) minX = o.x
    if (o.x + o.w > maxX) maxX = o.x + o.w
    if (o.y < minY) minY = o.y
    if (o.y + o.h > maxY) maxY = o.y + o.h
  }
  // Breathing room so the around-* wraparound lanes have somewhere to live.
  const PAD = STEP * 4
  minX -= PAD; maxX += PAD; minY -= PAD; maxY += PAD

  // Align the grid so stubFrom lands on cell (0, *) exactly — keeps the
  // emerging stub geometrically aligned with the rendered wire.
  const originX = stubFrom.x - Math.ceil((stubFrom.x - minX) / STEP) * STEP
  const originY = stubFrom.y - Math.ceil((stubFrom.y - minY) / STEP) * STEP
  const cols = Math.ceil((maxX - originX) / STEP) + 1
  const rows = Math.ceil((maxY - originY) / STEP) + 1
  // Cap grid size so an out-of-bounds drag can't lock up the render thread.
  if (cols * rows > 50000) return null

  // Block any cell whose centre falls strictly inside an obstacle — cells
  // sitting exactly on the boundary stay open so a stub landing on a
  // node's outer edge isn't trapped before it can leave.
  const blocked = new Uint8Array(cols * rows)
  for (const o of obstacles) {
    const cxLo = Math.max(0, Math.ceil((o.x - originX) / STEP))
    const cxHi = Math.min(cols - 1, Math.floor((o.x + o.w - originX) / STEP))
    const cyLo = Math.max(0, Math.ceil((o.y - originY) / STEP))
    const cyHi = Math.min(rows - 1, Math.floor((o.y + o.h - originY) / STEP))
    for (let cy = cyLo; cy <= cyHi; cy++) {
      const row = cy * cols
      for (let cx = cxLo; cx <= cxHi; cx++) {
        const px = originX + cx * STEP
        const py = originY + cy * STEP
        if (px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h) {
          blocked[row + cx] = 1
        }
      }
    }
  }

  const startCx = Math.round((stubFrom.x - originX) / STEP)
  const startCy = Math.round((stubFrom.y - originY) / STEP)
  const goalCx = Math.round((stubTo.x - originX) / STEP)
  const goalCy = Math.round((stubTo.y - originY) / STEP)
  if (startCx < 0 || startCx >= cols || startCy < 0 || startCy >= rows) return null
  if (goalCx < 0 || goalCx >= cols || goalCy < 0 || goalCy >= rows) return null
  if (blocked[startCy * cols + startCx]) return null
  if (blocked[goalCy * cols + goalCx]) return null

  // 4-direction movement: 0=+x, 1=-x, 2=+y, 3=-y. A turn-cost surcharge
  // (`TURN`) pushes A* toward visually tidy paths with few bends, even
  // when several equal-length routes exist. TURN is in units of cells —
  // each extra bend must save at least TURN cells of length before A*
  // will accept it, so a higher value trades small detours for fewer
  // (longer) legs. Set high enough that A* will route ~4 cells out of
  // the way to avoid a zigzag between close-together nodes.
  type Cell = { cx: number; cy: number; g: number; f: number; dir: number; parent: Cell | null }
  const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const initDir = dirs.findIndex(([dx, dy]) => dx === Math.sign(n1.x) && dy === Math.sign(n1.y))
  const heur = (cx: number, cy: number): number =>
    Math.abs(cx - goalCx) + Math.abs(cy - goalCy)
  const TURN = 4

  const open: Cell[] = [{
    cx: startCx, cy: startCy, g: 0,
    f: heur(startCx, startCy), dir: initDir, parent: null,
  }]
  const closed = new Uint8Array(cols * rows)
  // Hard cap on expansions for the same reason as the grid-size cap.
  let expansions = 0
  const MAX_EXPANSIONS = cols * rows * 2

  while (open.length > 0) {
    if (++expansions > MAX_EXPANSIONS) return null
    // Linear scan over the open list. A binary heap would be asymptotically
    // faster, but the open list typically stays under a few hundred entries
    // before A* hits the goal for grids of this size.
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i
    }
    const curr = open.splice(bestIdx, 1)[0]!
    const key = curr.cy * cols + curr.cx
    if (closed[key]) continue
    closed[key] = 1

    if (curr.cx === goalCx && curr.cy === goalCy) {
      const cellPath: Pt[] = []
      let n: Cell | null = curr
      while (n) {
        cellPath.push({ x: originX + n.cx * STEP, y: originY + n.cy * STEP })
        n = n.parent
      }
      cellPath.reverse()
      // Collapse co-linear interior cells so the rounded-corner renderer
      // only sees the actual bends.
      const out: Pt[] = [p1, stubFrom]
      for (let i = 1; i < cellPath.length - 1; i++) {
        const prev = cellPath[i - 1]!
        const here = cellPath[i]!
        const next = cellPath[i + 1]!
        const sameX = here.x === prev.x && here.x === next.x
        const sameY = here.y === prev.y && here.y === next.y
        if (!sameX && !sameY) out.push(here)
      }
      // Bridge: the grid is aligned to stubFrom, so stubTo may sit a
      // fraction of a cell off its column / row when the wire endpoints
      // don't share a grid offset (e.g. mixed horizontal / vertical
      // ports). A direct connection from the last interior cell to
      // stubTo would then render as a tiny diagonal — insert an
      // axis-aligned intermediate so the final approach matches
      // toSide's inward normal.
      const lastPt = out[out.length - 1]!
      const toHorizontal = toSide === 'left' || toSide === 'right'
      if (toHorizontal && lastPt.y !== stubTo.y) {
        out.push({ x: lastPt.x, y: stubTo.y })
      }
      else if (!toHorizontal && lastPt.x !== stubTo.x) {
        out.push({ x: stubTo.x, y: lastPt.y })
      }
      out.push(stubTo, p2)
      return out
    }

    for (let d = 0; d < 4; d++) {
      const [dx, dy] = dirs[d]!
      const nx = curr.cx + dx
      const ny = curr.cy + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const nkey = ny * cols + nx
      if (closed[nkey] || blocked[nkey]) continue
      // The first step out of the start cell is charged against the
      // outward-normal heading; later steps against the cell's own incoming
      // direction. Keeps the stub straight unless turning saves real
      // distance.
      const refDir = curr.parent === null ? initDir : curr.dir
      const turnCost = d !== refDir ? TURN : 0
      const ng = curr.g + 1 + turnCost
      open.push({ cx: nx, cy: ny, g: ng, f: ng + heur(nx, ny), dir: d, parent: curr })
    }
  }
  return null
}

// Render a polyline with rounded right-angle corners. Identical to the
// step-wire path builder but pulled out so the outward-wraparound path
// can share the same look — small radius `R` quadratic-bezier turns at
// every interior vertex, with straight L segments between.
//
// Picks ONE radius for every corner in the polyline so close-together
// turns don't pop in/out at different sizes. The radius is capped at
// `R` and shrunk to fit the tightest segment in the polyline — each
// interior segment has a corner taking `r` from both ends (so it needs
// to be at least 2r long), and end segments give up `r` to their one
// adjacent corner (so they need to be at least r long).
function roundedPolylinePath(pts: Pt[]): string {
  if (pts.length < 2) return ''
  // Drop interior points that are collinear with their neighbours — the
  // route planner emits stubFrom / stubTo / lane-edge intermediates that
  // lie on the same line as the surrounding vertices (180° "corners"),
  // and leaving them in fragments long segments into short ones, which
  // drags the per-wire uniformR way down. After this pass the polyline
  // has exactly the real geometric corners, so the radius budget reflects
  // actual bends instead of degenerate 180° points.
  const simplified: Pt[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = simplified[simplified.length - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = curr.x - prev.x
    const v1y = curr.y - prev.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    // Collinear when the 2D cross product is zero. Same-direction
    // (180° straight) and zero-length segments both fall through here,
    // which is what we want — neither needs its own polyline vertex.
    if (Math.abs(v1x * v2y - v1y * v2x) < 1e-6) continue
    simplified.push(curr)
  }
  simplified.push(pts[pts.length - 1]!)
  pts = simplified
  if (pts.length === 2) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[1]!.x} ${pts[1]!.y}`
  // Lower target radius so the per-wire uniformR doesn't have to shrink as
  // much when nodes are close — close-node wires used to bottom out at
  // R≈3 (gap 6) while wires between far nodes sat at R=12, which read as
  // visually inconsistent across wires on the same canvas. A target of 8
  // keeps the typical wire looking rounded while compressing the cross-
  // wire variance: long wires now stop at 8 instead of 12, and close-node
  // wires usually still hit the same 8 because their shortest segment is
  // longer than 16. Only very tight layouts (gap < 16) shrink further.
  const R = 8
  let uniformR = R
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const cornersOnSegment = (i > 0 ? 1 : 0) + (i < pts.length - 2 ? 1 : 0)
    if (cornersOnSegment === 0) continue
    uniformR = Math.min(uniformR, len / cornersOnSegment)
  }
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const curr = pts[i]!
    const next = pts[i + 1]!
    const v1x = prev.x - curr.x
    const v1y = prev.y - curr.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const len1 = Math.max(1, Math.hypot(v1x, v1y))
    const len2 = Math.max(1, Math.hypot(v2x, v2y))
    const r = uniformR
    const ax = curr.x + (v1x / len1) * r
    const ay = curr.y + (v1y / len1) * r
    const bx = curr.x + (v2x / len2) * r
    const by = curr.y + (v2y / len2) * r
    d += ` L ${ax} ${ay} Q ${curr.x} ${curr.y}, ${bx} ${by}`
  }
  const last = pts[pts.length - 1]!
  d += ` L ${last.x} ${last.y}`
  return d
}

// Public wrapper used by every wire renderer (resting + in-flight previews).
// Tries the orthogonal candidate planner first, falls back to A* for the
// awkward layouts where every candidate clips an obstacle, then finally
// to `buildWirePath`'s raw wire-style path so something always renders —
// the staircase mirrors the resting wire pipeline in `wireGeoms`.
function routedWirePath(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side,
  wireType: WireType, obstacles: Obstacle[],
): string {
  const wrapPts =
    planOrthogonalRoute(p1, p2, fromSide, toSide, obstacles)
    ?? aStarOrthogonalRoute(p1, p2, fromSide, toSide, obstacles)
  if (wrapPts) return roundedPolylinePath(wrapPts)
  const fallbackType = wireType === 'linear' ? 'linear' : 'step'
  return buildWirePath(p1, p2, fromSide, toSide, fallbackType, obstacles)
}

function buildWirePath(
  p1: Pt, p2: Pt, fromSide: Side, toSide: Side, wireType: WireType,
  obstacles: Obstacle[] = [],
): string {
  if (wireType === 'linear') {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  }

  if (wireType === 'step') {
    // Orthogonal (right-angle) path with curved corners.
    // Route: depart from p1 along its outward normal, travel horizontally or
    // vertically to an intermediate row/column, then arrive at p2 along its
    // inward normal. Rendering goes through `roundedPolylinePath` so this
    // shares the uniform-radius corner sizing with the wraparound paths.
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
    return roundedPolylinePath(pts)
  }

  // Default: fluid (cubic bezier). Control points are pushed perpendicular
  // to the chord when the natural curve would clip through any obstacle
  // node, so the wire routes around bodies instead of slicing through
  // them — see `fluidControlsAvoidingObstacles`.
  const { c1, c2 } = fluidControlsAvoidingObstacles(p1, p2, fromSide, toSide, obstacles)
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`
}

// Every node's padded obstacle rect, indexed by id. Shared by the resting
// wire renderer and every in-flight preview so each consumer can filter
// out its own endpoint nodes without re-deriving positions / sizes.
const paddedNodeBoxes = computed<Map<string, Obstacle>>(() => {
  const map = new Map<string, Obstacle>()
  for (const n of allNodes.value) {
    const p = nodePos(n)
    const s = nodeSize(n)
    map.set(n.id, {
      x: p.x - OBSTACLE_PAD,
      y: p.y - OBSTACLE_PAD,
      w: s.w + 2 * OBSTACLE_PAD,
      h: s.h + 2 * OBSTACLE_PAD,
    })
  }
  return map
})

// Obstacle list for a wire / preview rooted at the listed endpoint ids.
// Pass the source / target node ids (or nullish for detached ends) and
// the resulting list will exclude those nodes from the routing planner.
function obstaclesExcept(...skipIds: Array<string | null | undefined>): Obstacle[] {
  const skip = new Set(skipIds.filter((id): id is string => !!id))
  const out: Obstacle[] = []
  for (const [id, rect] of paddedNodeBoxes.value) {
    if (!skip.has(id)) out.push(rect)
  }
  return out
}

const wireGeoms = computed<WireGeom[]>(() => {
  const out: WireGeom[] = []
  const nodeMap = new Map(allNodes.value.map(n => [n.id, n]))
  const sides = wireSidesMap.value
  // Precompute every visible node's padded bbox so each wire's path
  // builder can ask "does the curve I'm rendering clip through any of
  // these?" without re-deriving on every iteration of the obstacle-avoid
  // loop. The endpoint nodes for each wire are filtered out per-wire
  // below.
  const allObstacles: { id: string; rect: Obstacle }[] = []
  for (const n of allNodes.value) {
    const p = nodePos(n)
    const s = nodeSize(n)
    allObstacles.push({
      id: n.id,
      rect: {
        x: p.x - OBSTACLE_PAD,
        y: p.y - OBSTACLE_PAD,
        w: s.w + 2 * OBSTACLE_PAD,
        h: s.h + 2 * OBSTACLE_PAD,
      },
    })
  }
  // Edges indexed by id so a persisted `from_side` / `to_side` overrides
  // the auto-pick below. Spine + extra wires are absent here and fall
  // through to the auto-picked sides.
  const wiresById = new Map<string, WorkflowWire>(
    displayedGraph.value.wires.map(e => [e.id, e]),
  )
  // Seed `stableWireSides` with `sides`' first observation for each wire,
  // and evict entries for wires that no longer exist. Subsequent renders
  // reuse the stable value so a node move doesn't flip the wire to a new
  // side. Mutating a plain Map (not a ref) means this side-effect doesn't
  // trigger its own re-render — wireGeoms already runs because positions
  // changed.
  const liveWireIds = new Set<string>()
  for (const [id, sidePair] of sides.entries()) {
    liveWireIds.add(id)
    if (!stableWireSides.has(id)) stableWireSides.set(id, sidePair)
  }
  for (const id of [...stableWireSides.keys()]) {
    if (!liveWireIds.has(id)) stableWireSides.delete(id)
  }
  const wt = settings.value.wireType ?? 'step'
  const ZERO_SIZE: Size = { w: 0, h: 0 }
  for (const w of allWires.value) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    const persistedEdge = w.id.startsWith('wire:')
      ? wiresById.get(w.id.slice('wire:'.length))
      : undefined
    // Detached endpoint support: when a wire's from / to node is missing
    // we fall back to the floating position (`from_pos` / `to_pos`).
    // Graph wires carry these via the persisted edge; user-wires carry
    // them on the FlatWire itself. A wire with neither a node nor a
    // floating coord at an end has no resting geometry — skip it.
    const fromPos = !a ? (persistedEdge?.from_pos ?? w.fromPos) : undefined
    const toPos = !b ? (persistedEdge?.to_pos ?? w.toPos) : undefined
    if (!a && !fromPos) continue
    if (!b && !toPos) continue
    const pa = a ? nodePos(a) : fromPos!
    const pb = b ? nodePos(b) : toPos!
    const assigned = sides.get(w.id)
    const stable = stableWireSides.get(w.id)
    // Precedence: persisted (real wire data set by endpoint-drag / port-
    // drag-snap) → user-wire's own side (port-drag-snap on a wire that
    // can't be persisted, e.g. to End) → stable (frozen first pick from
    // the auto router) → live auto pick → fallback.
    const fromSide: Side = persistedEdge?.from_side ?? w.fromSide ?? stable?.fromSide ?? assigned?.fromSide ?? 'right'
    const toSide: Side = persistedEdge?.to_side ?? w.toSide ?? stable?.toSide ?? assigned?.toSide ?? 'left'
    // Detached ends use a zero-size box, so `pointOnSide` collapses to
    // the floating point itself regardless of which side was chosen.
    const sa = a ? nodeSize(a) : ZERO_SIZE
    const sb = b ? nodeSize(b) : ZERO_SIZE
    // `p1` / `p2` are the LOGICAL endpoints (node side-centres). Snap
    // math, endpoint-drag fixed-anchor coords, and side-tracking all key
    // off these. The wire's RENDERED path stops `WIRE_END_GAP` short of
    // them on each side so the grip circles fit in the gap.
    const p1 = pointOnSide(pa, fromSide, sa)
    const p2 = pointOnSide(pb, toSide, sb)
    const p1Drawn = wireDrawnEndPt(p1, fromSide)
    const p2Drawn = wireDrawnEndPt(p2, toSide)
    // Geometric midpoint between the two drawn endpoints — kept as a
    // generic anchor for any consumer that wants the chord centre.
    const mid: Pt = { x: (p1Drawn.x + p2Drawn.x) / 2, y: (p1Drawn.y + p2Drawn.y) / 2 }
    // Orthogonal obstacle-aware routing. Every wire goes through the
    // candidate planner first (5 quick candidates: direct + around-top /
    // bottom / left / right). When all 5 crash through an obstacle —
    // typically because a third node sits on the natural lane or because
    // neighbouring nodes block every wraparound — the A* fallback kicks
    // in and weaves a grid-aligned path around every obstacle interior.
    // A* itself returns null only when even the stub cell is blocked
    // (the wire's source / target overlaps with an obstacle), in which
    // case we fall through to the wire-style's own builder so something
    // still renders.
    const fromOutward = outwardNormalDotMid(fromSide, p1, mid) < 0
    const toOutward = outwardNormalDotMid(toSide, p2, mid) < 0
    const routingObstacles: Obstacle[] = allObstacles
      .filter(o => o.id !== w.fromId && o.id !== w.toId)
      .map(o => o.rect)
    // Endpoint nodes are obstacles ONLY when the wire emerges / lands
    // via an outward port — for inward ports the wire never re-enters
    // the node, so including it would block the natural straight path.
    if (a && fromOutward) routingObstacles.push({ x: pa.x, y: pa.y, w: sa.w, h: sa.h })
    if (b && toOutward) routingObstacles.push({ x: pb.x, y: pb.y, w: sb.w, h: sb.h })
    const wrapPts = planOrthogonalRoute(p1Drawn, p2Drawn, fromSide, toSide, routingObstacles)
      ?? aStarOrthogonalRoute(p1Drawn, p2Drawn, fromSide, toSide, routingObstacles)
    // Toolbar anchor: pick orientation from the overall bounding rect
    // (wider → horizontal bar above; taller → vertical bar beside), then
    // anchor at the centre of the longest straight segment whose direction
    // matches that orientation. Preferring an aligned segment matters for
    // step wires shaped like a Z — the longest segment could be the
    // perpendicular middle leg, and centring an axis-aligned bar on a
    // perpendicular leg would drop the bar on top of the wire. For
    // linear / fluid wires the polyline collapses to the chord, which
    // (by construction) is already aligned with the bbox's longer side.
    const wpts = wrapPts ?? wireWaypoints(p1Drawn, p2Drawn, fromSide, toSide, wt)
    let bMinX = wpts[0]!.x, bMaxX = wpts[0]!.x, bMinY = wpts[0]!.y, bMaxY = wpts[0]!.y
    for (const p of wpts) {
      if (p.x < bMinX) bMinX = p.x
      if (p.x > bMaxX) bMaxX = p.x
      if (p.y < bMinY) bMinY = p.y
      if (p.y > bMaxY) bMaxY = p.y
    }
    const bboxW = bMaxX - bMinX
    const bboxH = bMaxY - bMinY
    const toolbarOrientation: 'horizontal' | 'vertical' = bboxW >= bboxH ? 'horizontal' : 'vertical'
    // Collect every aligned segment tied for the longest length, then
    // average their midpoints. Picking only the first longest segment
    // dropped the bar on the LEFT half of a symmetric step wire — e.g.
    // Start ↔ same-row node has two equal halves bracketing a zero-length
    // middle leg, and the first half won the tiebreaker. Averaging
    // matched midpoints collapses the symmetric case back to the chord
    // centre while still riding a single-leg Z-shape's dominant straight.
    let bestLen = -1
    const bestMidpoints: Pt[] = []
    const SEG_EPS = 0.5
    for (let i = 0; i < wpts.length - 1; i++) {
      const a = wpts[i]!
      const b = wpts[i + 1]!
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      const len = Math.hypot(dx, dy)
      const aligned = toolbarOrientation === 'horizontal' ? dx >= dy : dy >= dx
      if (!aligned || len <= 0) continue
      const segMid: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (len > bestLen + SEG_EPS) {
        bestLen = len
        bestMidpoints.length = 0
        bestMidpoints.push(segMid)
      }
      else if (Math.abs(len - bestLen) <= SEG_EPS) {
        bestMidpoints.push(segMid)
      }
    }
    let bestCx = mid.x
    let bestCy = mid.y
    if (bestMidpoints.length > 0) {
      bestCx = bestMidpoints.reduce((s, p) => s + p.x, 0) / bestMidpoints.length
      bestCy = bestMidpoints.reduce((s, p) => s + p.y, 0) / bestMidpoints.length
    }
    const toolbarAnchor = { x: bestCx, y: bestCy, orientation: toolbarOrientation }
    // `selectable` = full editor (endpoint drag handles, side-panel form).
    // Real graph edges (`wire:`) carry persisted metadata; canvas-local
    // extras (`user:`, e.g. wires the user dragged to a synthetic Start
    // / End) are also draggable so their endpoints participate in the
    // same drag-to-snap / drop-in-empty UX as real wires. The drag
    // commit branches on the id prefix to know which store to mutate.
    // `clickable` = receives clicks for selection + highlight + the
    // action pill.
    const selectable = w.id.startsWith('wire:') || w.id.startsWith('user:')
    const clickable = selectable
    const wireObstacles = allObstacles
      .filter(o => o.id !== w.fromId && o.id !== w.toId)
      .map(o => o.rect)
    // Fallback when both orthogonal planners fail (very-tight layouts):
    // Lark-style clean orthogonal staircase, not a curvy bezier. `linear`
    // is the one wire style that should still render as a straight chord
    // since the user picked it on purpose.
    const fallbackType: WireType = wt === 'linear' ? 'linear' : 'step'
    const d = wrapPts
      ? roundedPolylinePath(wrapPts)
      : buildWirePath(p1Drawn, p2Drawn, fromSide, toSide, fallbackType, wireObstacles)
    out.push({
      id: w.id,
      d,
      mid,
      toolbarAnchor,
      clickable,
      selectable,
      fromId: w.fromId,
      toId: w.toId,
      p1,
      p2,
      fromSide,
      toSide,
      style: w.style,
      condition: w.condition,
      maxIterations: w.maxIterations,
      label: w.label,
    })
  }
  return out
})

// ── Actions ────────────────────────────────────────────────────────────────

function nodeTitle(n: NodeModel) {
  const s = n.node
  if (n.terminal === 'start') return t('workflow.startNode')
  if (n.terminal === 'end') return t('workflow.endNode')
  if (s.title) return s.title
  if (s.actions && s.actions.length > 0 && s.actions[0]) return s.actions[0]
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
  // Commit the removal to the graph so subsequent layout / save / run see
  // the post-delete state. `node_remove` cascades wire removal for any
  // wires incident on the removed node.
  for (const id of deletable) {
    applyStructuralOp({ kind: 'node_remove', node_id: id })
  }
  selected.value = new Set()
  persistOverrides()
  recordHistory()
}

const hidden = ref<Set<string>>(new Set())

const visibleNodes = computed(() => allNodes.value.filter(n => !hidden.value.has(n.id)))
const visibleWires = computed(() => wireGeoms.value.filter(w => !hidden.value.has(w.fromId) && !hidden.value.has(w.toId)))

// isWireSelected returns true when a wire is in either the single- or
// multi-select set, mirroring the inline check used by the main path's
// stroke ternary. Centralised so the pill / hit-zone overlay use the
// same definition.
function isWireSelected(w: WireGeom): boolean {
  return w.clickable && (selectedWireId.value === w.id || selectedWireIds.value.has(w.id))
}

// wireStroke / wireStrokeWidth pick the visual styling for a wire's
// main path based on (back-wire vs forward) × (selected vs not).
// Back-wires read in the loop palette so loops are obvious at a glance
// without the user having to inspect each wire's max_iterations field.
function wireStroke(w: WireGeom): string {
  const sel = isWireSelected(w)
  if (w.style === 'back-wire') {
    return sel ? 'var(--color-loop-wire-strong)' : 'var(--color-loop-wire)'
  }
  return sel ? 'rgb(23 23 23)' : 'rgb(163 163 163)'
}

function wireStrokeWidth(w: WireGeom): string {
  return isWireSelected(w) ? '2' : '1.5'
}

// wireDasharray returns a dasharray for back-wires only when selected, so
// the selected loop reads "iterative" — forward wires stay solid.
function wireDasharray(w: WireGeom): string | undefined {
  if (w.style !== 'back-wire') return undefined
  return isWireSelected(w) ? '6 4' : undefined
}

// hasWirePill returns true when a wire carries either an iteration cap
// or a non-empty condition — those are the wires that get a mid-segment
// rounded-rectangle pill so the loop / branching semantics are visible
// without selecting the wire and reading the side panel.
function hasWirePill(w: WireGeom): boolean {
  return Boolean(w.condition && w.condition.trim() !== '') || (w.maxIterations ?? 0) > 0
}

// wirePillGeometry computes the pill's centre + dimensions. The centre
// reuses the wire's `toolbarAnchor` (already the midpoint of the longest
// straight segment by construction). Width grows with content count so
// the pill stays tight; height is fixed so it's a clear lozenge shape.
const PILL_HEIGHT = 22
const PILL_PADDING_X = 8
const PILL_ICON_SLOT = 14
const PILL_DIGIT_SLOT = 7
function wirePillGeometry(w: WireGeom): { cx: number, cy: number, w: number, h: number } {
  const showCond = Boolean(w.condition && w.condition.trim() !== '')
  const iter = w.maxIterations ?? 0
  const showIter = iter > 0
  let inner = 0
  if (showCond) inner += PILL_ICON_SLOT
  if (showCond && showIter) inner += 4
  if (showIter) {
    inner += PILL_ICON_SLOT
    inner += 2
    inner += PILL_DIGIT_SLOT * Math.max(1, String(iter).length)
  }
  const widthPx = PILL_PADDING_X * 2 + inner
  return {
    cx: w.toolbarAnchor.x,
    cy: w.toolbarAnchor.y,
    w: widthPx,
    h: PILL_HEIGHT,
  }
}

// Keyboard shortcut: Delete / Backspace removes the current selection.
// Routes to whichever delete fn matches the live selection — wire takes
// precedence because a wire can't be selected at the same time as nodes
// (`selectWire` clears `selected`). Suppressed when focus is in a text
// field so the user can still backspace through input text.
function isEditableFocus(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onCanvasKeyDown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    if (selected.value.size + selectedWireIds.value.size > 0 || selectedWireId.value) {
      dismissPersistentMarquee()
      ev.preventDefault()
    }
    return
  }
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
  if (isEditableFocus()) return
  // Multi-selection (nodes + wires from marquee or shift-click) goes
  // through the combined delete path that knows how to wipe both buckets.
  if (selectedWireIds.value.size > 0) {
    deleteMarqueeSelection()
    ev.preventDefault()
    return
  }
  if (selectedWireId.value) {
    deleteSelectedWire()
    ev.preventDefault()
    return
  }
  if (selected.value.size > 0) {
    deleteSelected()
    ev.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onCanvasKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onCanvasKeyDown)
  stopAutoZoomLoop()
  activeTouchPointers.clear()
  touchGesture = null
})

// ── Layout actions ──────────────────────────────────────────────────────────
const hasOverrides = computed(
  () => Object.keys(overrides.value).length > 0
    || userWires.value.length > 0,
)

function resetLayout() {
  // "Auto layout" runs the topological layout once and writes the
  // computed coordinates onto the graph. Positions go through per-node
  // `node_edit` ops (so the executor sees the same chain it would for any
  // single-field edit); wire bends + persisted sides are cleared with a
  // direct rebuild of `userGraph` because `mergeWirePatch` doesn't accept
  // a "clear this field" patch shape. Pressing the button again reflows
  // from scratch.
  if (!attemptEdit()) return
  const graph = displayedGraph.value
  if (graph.nodes.length > 0) {
    const lay = buildLayout(graph)
    for (const m of lay.nodes) {
      if (m.terminal) continue
      const pos = defaultPos(m)
      const cur = m.node.position
      if (cur && Math.abs(cur.x - pos.x) < 0.5 && Math.abs(cur.y - pos.y) < 0.5) continue
      applyStructuralOp({
        kind: 'node_edit',
        node_id: m.id,
        patch: { position: { x: pos.x, y: pos.y } },
      })
    }
    // Rebuild the graph without bends / persisted sides so the auto
    // routing takes over post-layout — without this, an old endpoint-drag
    // choice keeps overriding the freshly-laid-out routing even though
    // the obstacle map has changed.
    const cur = displayedGraph.value
    const cleaned: WorkflowGraph = {
      nodes: cur.nodes,
      wires: cur.wires.map((w) => {
        const next: WorkflowWire = { ...w }
        delete next.bends
        delete next.from_side
        delete next.to_side
        return next
      }),
    }
    userGraph.value = cleaned
    editedDraft.value = {}
    dirtyNodeIds.value = new Set()
  }
  // Geometry now lives on the graph — wipe transient overlays + memos so
  // the rendered positions come entirely from the just-written `node.position`.
  overrides.value = {}
  sizes.value = {}
  seedPositions.value = {}
  stableWireSides.clear()
  hidden.value = new Set()
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
  if (n.title) out.title = n.title
  if (n.actions && n.actions.length > 0) out.actions = n.actions
  if (n.details) out.details = n.details
  if (n.notes) out.notes = n.notes
  if (n.workflow_ref) out.workflow_ref = n.workflow_ref
  if (n.repeat && n.repeat > 0) out.repeat = n.repeat
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
  if (e.from_pos) out.from_pos = { x: Math.round(e.from_pos.x), y: Math.round(e.from_pos.y) }
  if (e.to_pos) out.to_pos = { x: Math.round(e.to_pos.x), y: Math.round(e.to_pos.y) }
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
  stableWireSides.clear()
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

// Connectivity warnings surfaced at save time. We don't block the save —
// the user may know the workflow is unfinished — but we tell them what
// looks off so the lack of magic auto-wiring isn't mistaken for the
// canvas being broken.
function connectivityWarnings(graph: WorkflowGraph): string[] {
  const out: string[] = []
  if (graph.nodes.length === 0) return out
  const hasIn = new Set<string>()
  const hasOut = new Set<string>()
  for (const w of graph.wires) {
    hasIn.add(w.to_id)
    hasOut.add(w.from_id)
  }
  const isolated = graph.nodes.filter(n => !hasIn.has(n.id) && !hasOut.has(n.id))
  if (isolated.length > 0) {
    out.push(t('workflow.warnIsolatedNodes', { count: isolated.length }))
  }
  return out
}

async function onSave() {
  if (!canSave.value || !selectedWorkflowId.value) return
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
      // Surface non-blocking validation issues so the user knows what to
      // fix without the canvas silently inferring wires for them.
      for (const w of connectivityWarnings(displayedGraph.value)) {
        toast.show(w, 'warning', 5000)
      }
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

// ── Per-node edits ──────────────────────────────────────────────────────────
// Form-driven node edits land in `editedDraft` and are overlaid on the live
// tree via `displayedSteps`. Versions are NEVER created in the background —
// they only land in the DB when the user presses Save (`onSave`) or the
// orchestrator agent runs a server-side save under user permission.
// `dirtyNodeIds` / `userGraph` / `userWires` / `lockSetDirty` accumulate
// the pending edits so the Save button surfaces them via `canSave`.

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
}

function onWirePatch(wireId: string, patch: Partial<WorkflowWire>) {
  if (!attemptEdit()) return
  applyStructuralOp({ kind: 'wire_edit', wire_id: wireId, patch })
}

// onEmbedNavigate routes the user to the referenced workflow when they
// click the title in the embed InfoPanel. Routes to the same shape the
// user is currently on (e.g. .../agent stays on agent; the editor root
// goes to /workflow/[id]) so context carries through.
function onEmbedNavigate(workflowID: string) {
  const route = useRoute()
  const segments = route.path.split('/').filter(s => s.length > 0)
  // Expected shape: ['workflow', '<id>', ...suffix]. Replace the id and
  // keep any suffix segments (e.g. 'agent', 'schedule', 'artifacts').
  const suffix = segments.length > 2 ? segments.slice(2).join('/') : ''
  const target = suffix ? `/workflow/${workflowID}/${suffix}` : `/workflow/${workflowID}`
  navigateTo(target)
}

// Fold any sketched-but-unattached wires (drag-to-connect that landed
// outside the graph) into real `wire_add` ops before we ship the graph to
// the server. Wires that *can* be promoted (both endpoints are real graph
// nodes) are dropped from `userWires` once they're in the graph. Wires
// whose endpoint is a synthetic Start/End anchor stay in `userWires` —
// the server rejects those endpoints, so the only home for them is the
// canvas-local list. Without that distinction, every save nuked a
// user-drawn wire to End even though the user never deleted it.
// Called at the top of `onSave` so the promoted edges are already part
// of `displayedGraph.value` when we read it for the payload.
function promoteUserWires() {
  if (userWires.value.length === 0) return
  const remaining: UserWire[] = []
  for (const w of userWires.value) {
    const fromReal = !!w.fromId && !!findNodeById(displayedGraph.value, w.fromId)
    const toReal = !!w.toId && !!findNodeById(displayedGraph.value, w.toId)
    if (fromReal && toReal) {
      // Both ends bind to real graph nodes — convert to a persisted wire
      // so it gains structural-op replay and survives reloads. Skip if
      // an identical edge already exists.
      const exists = displayedGraph.value.wires.some(
        e => e.from_id === w.fromId && e.to_id === w.toId,
      )
      if (exists) continue
      applyStructuralOp({
        kind: 'wire_add',
        wire: { id: '', from_id: w.fromId, to_id: w.toId },
      })
      continue
    }
    // Not fully promotable — keep canvas-local. This covers: wires
    // touching a synthetic Start / End anchor; wires whose moving end
    // the user dropped in empty space (floating); wires to spawn-extras
    // that aren't graph nodes yet. The user can remove explicitly via
    // the action pill. Drop only when BOTH ends are truly meaningless
    // (no real node id, no recognised terminal, no floating position).
    const fromKnown = fromReal || !!w.fromId || !!w.fromPos
    const toKnown = toReal || !!w.toId || !!w.toPos
    if (fromKnown && toKnown) remaining.push(w)
  }
  userWires.value = remaining
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
  return true
}

onBeforeUnmount(() => {
  // Tear down placement listeners if the user unmounted mid-gesture.
  if (placingNode.value) cancelPlacing()
  if (placingWire.value) cancelPlacingWire()
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
// close history so the node-details panel takes over the same slot. Same
// rule for wire selection — nodes and wires share a single InfoPanel slot,
// so picking a node must clear `selectedWireId` (mirrors `selectWire`'s
// `selected = new Set()` clear in the opposite direction). Covers every
// way a node can become selected (click, marquee, spawn-from-port, post-
// delete reselection) without having to thread the clear through each.
watch(selected, (cur) => {
  if (cur.size === 0) return
  if (historyOpen.value) {
    historyOpen.value = false
    selectedVersionId.value = null
  }
  if (selectedWireId.value !== null) {
    selectedWireId.value = null
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
const settings = ref<CanvasSettings>({ showGrid: true, snapToGrid: true, wireType: 'step' })

if (import.meta.client) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CanvasSettings>
      settings.value = {
        showGrid: parsed.showGrid ?? true,
        snapToGrid: parsed.snapToGrid ?? true,
        wireType: parsed.wireType ?? 'step',
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
      Side toolbar — slim vertical icon-only column on the left. Split into
      two pills inside a single 50%-vertical container: run / save / history
      / undo / redo on top, then node + wire creation, layout helpers, zoom,
      and settings beneath.
    -->
    <div class="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3 pointer-events-none sm:left-4">
      <div class="flex flex-col items-center rounded-xl border border-neutral-200 bg-white/90 shadow-sm backdrop-blur-md pointer-events-auto">
        <!-- Run / Stop — the primary action sits at the top. When idle a
             green play icon; while running the spinner swaps to a red stop
             on hover so the user can request a cancel. Clicking while
             running calls onStop (currently a UI-only reset). -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:hover:text-emerald-600"
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
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canSave"
          @click="onSave"
        >
          <UIcon name="i-ph-floppy-disk-fill" class="size-3.5" />
          <span class="canvas-tooltip">{{ saving ? t('workflow.saving') : t('workflow.save') }}</span>
        </button>

        <!-- History -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
          :class="historyOpen ? 'text-neutral-900' : 'text-neutral-500'"
          @click="toggleHistory"
        >
          <UIcon name="i-heroicons-clock-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.historyTitle') }}</span>
        </button>

        <span class="h-px w-4 bg-neutral-200" />

        <!-- Undo -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canUndo"
          @click="undo"
        >
          <UIcon name="i-heroicons-arrow-uturn-left-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.undo') }}</span>
        </button>
        <!-- Redo -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="!canRedo"
          @click="redo"
        >
          <UIcon name="i-heroicons-arrow-uturn-right-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.redo') }}</span>
        </button>
      </div>

      <div class="flex flex-col items-center rounded-xl border border-neutral-200 bg-white/90 shadow-sm backdrop-blur-md pointer-events-auto">
        <!-- Add node — clicking attaches a faded ghost to the cursor; the
             next click on the canvas drops a fresh graph node there. -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
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

        <!-- Draw wire — click 1 places the tail (free, or latched to a node
             port circle if the cursor is on one); click 2 places the head
             with the same rules. Cursor becomes a crosshair while armed. -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
          :class="placingWire ? 'text-neutral-900' : 'text-neutral-500'"
          @click="startPlacingWire"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M18.75 7.721h-7.225v1.905h7.224l-3.136 3.136a.953.953 0 1 0 1.347 1.346l4.761-4.761a.95.95 0 0 0 0-1.347L16.96 3.24a.952.952 0 1 0-1.347 1.346zM11.523 9.625a.95.95 0 0 0-.952.952v7.618a2.857 2.857 0 0 1-2.857 2.857H2.952a.952.952 0 1 1 0-1.904h4.762a.95.95 0 0 0 .952-.953v-7.618a2.857 2.857 0 0 1 2.857-2.857z"
            />
          </svg>
          <span class="canvas-tooltip">{{ t('workflow.drawWire') }}</span>
        </button>

        <span class="h-px w-4 bg-neutral-200" />

        <!-- Fit to view -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
          @click="fitToView"
        >
          <UIcon name="i-heroicons-arrows-pointing-out-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.fitToView') }}</span>
        </button>
        <!-- Auto layout -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="displayedGraph.nodes.length === 0"
          @click="resetLayout"
        >
          <UIcon name="i-heroicons-sparkles-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.resetLayoutTitle') }}</span>
        </button>

        <span class="h-px w-4 bg-neutral-200" />

        <!-- Zoom controls -->
        <button
          type="button"
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
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
          class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:hover:text-neutral-500"
          :disabled="scale <= 0.4 + 0.001"
          @click="zoomOut"
        >
          <UIcon name="i-heroicons-minus-20-solid" class="size-3.5" />
          <span class="canvas-tooltip">{{ t('workflow.zoomOut') }}</span>
        </button>

        <span class="h-px w-4 bg-neutral-200" />

        <!-- Settings -->
        <div class="relative">
          <button
            ref="settingsButtonEl"
            type="button"
            class="group/btn relative inline-flex h-6 w-7 items-center justify-center rounded-lg transition-colors hover:text-neutral-900"
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
      :class="placingWire
        ? 'cursor-crosshair'
        : (isPanning ? 'cursor-grabbing' : (marqueeState?.active ? 'cursor-crosshair' : 'cursor-default'))"
      :style="{
        ...(settings.showGrid ? {
          backgroundImage: 'radial-gradient(circle, rgb(188 188 195 / 0.7) 1.25px, transparent 1.25px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        } : {}),
        touchAction: 'none',
      }"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointercancel="onCanvasPointerUp"
      @click="onCanvasClick"
      @contextmenu="onCanvasContextMenu"
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
                viewBox="0 0 3 6"
                refX="3"
                refY="3"
                markerWidth="3"
                markerHeight="6"
                orient="auto-start-reverse"
                overflow="visible"
              >
                <path
                  d="M 0 0 L 3 3 L 0 6"
                  fill="none"
                  stroke="rgb(163 163 163)"
                  stroke-width="1"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
              <marker
                id="wire-arrow-selected"
                viewBox="0 0 3 6"
                refX="3"
                refY="3"
                markerWidth="3"
                markerHeight="6"
                orient="auto-start-reverse"
                overflow="visible"
              >
                <path
                  d="M 0 0 L 3 3 L 0 6"
                  fill="none"
                  stroke="rgb(23 23 23)"
                  stroke-width="1"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </marker>
            </defs>
            <!-- Loop-body highlight — soft tinted rectangle behind the
                 selected back-wire's iterated nodes. Rendered first so
                 it sits beneath wires and node cards. Empty when nothing
                 is selected or the selection isn't a back-wire. -->
            <rect
              v-if="loopBodyBounds"
              :x="loopBodyBounds.x"
              :y="loopBodyBounds.y"
              :width="loopBodyBounds.w"
              :height="loopBodyBounds.h"
              rx="16"
              ry="16"
              fill="var(--color-loop-wire-soft)"
              stroke="var(--color-loop-wire)"
              stroke-width="1"
              stroke-dasharray="4 4"
              style="pointer-events: none"
            />
            <g v-for="w in visibleWires" :key="w.id">
              <!-- When the user is dragging this wire's endpoint OR the
                   whole wire body, the in-flight preview path is rendered
                   separately below; we hide the live wire to avoid a
                   stale double-image. -->
              <template
                v-if="!(w.clickable
                  && ((endpointDrag && endpointDrag.wireId === w.id)
                    || (wireBodyDrag && wireBodyDrag.wireId === w.id && wireBodyDrag.isDragging)))"
              >
              <!-- Transparent fat-stroke hit zone. Enabled for any wire the
                   user can click — real edges and synthetic spine wires.
                   Wider than the visible stroke so short wires between
                   tightly-spaced nodes still have a forgiving click target.
                   First click selects (via `@click`); a pointerdown +
                   move on the ALREADY-selected wire starts a wire-body
                   drag that translates both endpoints (`onWireBodyPointerDown`).
                   Cursor flips to `grab` when selected to advertise the
                   drag affordance. -->
              <path
                v-if="w.clickable"
                :d="w.d"
                :data-wire-id="w.id"
                fill="none"
                stroke="transparent"
                stroke-width="28"
                stroke-linecap="round"
                :class="selectedWireId === w.id ? 'cursor-grab' : 'cursor-pointer'"
                style="pointer-events: stroke"
                @pointerdown.stop="(e) => onWireBodyPointerDown(e, w)"
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
              <!-- Main wire with arrowhead. Selected edge swaps to the
                   neutral-900 tint + matching black arrowhead so the
                   highlight reads the same way as a selected node's
                   border. A marquee-selected wire uses the same black
                   styling so bulk selections read identically to a
                   single-click selection. Back-wires swap to the loop
                   palette via wireStroke. -->
              <path
                :d="w.d"
                fill="none"
                :stroke="wireStroke(w)"
                :stroke-width="wireStrokeWidth(w)"
                :stroke-dasharray="wireDasharray(w)"
                stroke-linecap="round"
                :marker-end="w.clickable && (selectedWireId === w.id || selectedWireIds.has(w.id)) ? 'url(#wire-arrow-selected)' : 'url(#wire-arrow)'"
              />
              <!-- Loop / conditional pill — a rounded-rectangle lozenge
                   sitting at the midpoint of the wire's longest straight
                   segment. Its stroke matches the wire so the wire reads
                   as continuous through the pill; its white fill masks
                   the wire underneath so visually the wire stops at the
                   pill border on each side. Contents:
                     - conditional symbol when wire.condition is set
                     - loop icon + max_iterations count when > 0
                   Clicking the pill selects the underlying wire. -->
              <g
                v-if="hasWirePill(w)"
                :data-wire-pill-id="w.id"
                class="cursor-pointer"
                @click.stop="selectWire(w.id)"
              >
                <rect
                  :x="wirePillGeometry(w).cx - wirePillGeometry(w).w / 2"
                  :y="wirePillGeometry(w).cy - wirePillGeometry(w).h / 2"
                  :width="wirePillGeometry(w).w"
                  :height="wirePillGeometry(w).h"
                  rx="11"
                  ry="11"
                  :stroke="wireStroke(w)"
                  :stroke-width="wireStrokeWidth(w)"
                  fill="white"
                />
                <foreignObject
                  :x="wirePillGeometry(w).cx - wirePillGeometry(w).w / 2"
                  :y="wirePillGeometry(w).cy - wirePillGeometry(w).h / 2"
                  :width="wirePillGeometry(w).w"
                  :height="wirePillGeometry(w).h"
                  style="pointer-events: none"
                >
                  <div class="flex h-full items-center justify-center gap-1 text-[11px] leading-none text-neutral-700">
                    <UIcon
                      v-if="w.condition && w.condition.trim() !== ''"
                      name="i-heroicons-question-mark-circle-20-solid"
                      class="size-3 shrink-0"
                    />
                    <UIcon
                      v-if="(w.maxIterations ?? 0) > 0"
                      name="i-heroicons-arrow-path-20-solid"
                      class="size-3 shrink-0"
                      :style="w.style === 'back-wire' ? { color: 'var(--color-loop-wire-strong)' } : undefined"
                    />
                    <span
                      v-if="(w.maxIterations ?? 0) > 0"
                      class="tabular-nums"
                      :style="w.style === 'back-wire' ? { color: 'var(--color-loop-wire-strong)' } : undefined"
                    >{{ w.maxIterations }}</span>
                  </div>
                </foreignObject>
              </g>
              </template>
            </g>
            <!--
              Rubber-band wire that follows the cursor while the user is
              dragging from a port. Uses the same neutral-900 stroke +
              arrowhead as a selected wire so the preview reads as "the
              wire you're about to commit", with the arrow tip pointing
              at the cursor (the future to-end). Dashed while the cursor
              is still searching, solid once it's snapped on a target.
            -->
            <path
              v-if="tempWireGeom"
              :d="tempWireGeom.d"
              fill="none"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              stroke-linecap="round"
              marker-end="url(#wire-arrow-selected)"
            />
            <!--
              Rubber-band for the click-click draw-wire tool. After the
              first click places the tail, the head trails the cursor
              until the second click commits.
            -->
            <path
              v-if="placingWireGeom"
              :d="placingWireGeom.d"
              fill="none"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              stroke-linecap="round"
              marker-end="url(#wire-arrow-selected)"
            />
            <!--
              Rubber-band for an endpoint-drag on an existing wire. The
              anchored end stays put; the moving end tracks the cursor.
              `buildWirePath` above keeps the path direction matching the
              underlying edge (from → to), so marker-end always lands on
              the to-end — at the cursor when the to-end is being moved,
              at the anchored node when the from-end is being moved.
            -->
            <path
              v-if="endpointDragWireGeom"
              :d="endpointDragWireGeom.d"
              fill="none"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              stroke-linecap="round"
              marker-end="url(#wire-arrow-selected)"
            />
            <!--
              Wire-body drag preview: the whole wire translated by the
              cursor delta. Same stroke as a selected wire so it reads
              as "the wire you're about to drop". Either end clips onto
              a snap target when one is found.
            -->
            <path
              v-if="wireBodyDragGeom"
              :d="wireBodyDragGeom.d"
              fill="none"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              stroke-linecap="round"
              marker-end="url(#wire-arrow-selected)"
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
          </svg>

        <!--
          Wire selection toolbar — compact bar floating next to the selected
          edge. Orientation (horizontal / vertical) follows the wire's
          bounding rect: a wider-than-tall wire gets a horizontal bar above
          its longest straight segment; a taller-than-wide wire gets a
          vertical bar to the left of its longest straight segment. Two
          actions: open the InfoPanel for full editing, and remove the edge.
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
              v-if="w.clickable
                && selectedWireId === w.id
                && selected.size === 0
                && selectedWireIds.size === 0
                && (!endpointDrag || endpointDrag.wireId !== w.id)
                && (!wireBodyDrag || wireBodyDrag.wireId !== w.id || !wireBodyDrag.isDragging)
                && !connecting"
              class="pointer-events-auto absolute z-20 flex items-center rounded-xl border border-neutral-200 bg-white/90 shadow-sm backdrop-blur-md"
              :class="w.toolbarAnchor.orientation === 'horizontal'
                ? '-translate-x-1/2 -translate-y-full'
                : 'flex-col -translate-x-full -translate-y-1/2'"
              :style="w.toolbarAnchor.orientation === 'horizontal'
                ? { left: `${w.toolbarAnchor.x}px`, top: `${w.toolbarAnchor.y - 16}px`, touchAction: 'none' }
                : { left: `${w.toolbarAnchor.x - 16}px`, top: `${w.toolbarAnchor.y}px`, touchAction: 'none' }"
              @pointerdown.stop
            >
              <!-- Edit is only meaningful for persisted wires (`wire:`)
                   — spine + user-extra wires have no editable metadata so
                   the button is hidden rather than opening an empty form. -->
              <button
                v-if="w.selectable"
                type="button"
                class="group/btn relative inline-flex items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                :class="w.toolbarAnchor.orientation === 'horizontal' ? 'h-7 w-6' : 'h-6 w-7'"
                @click.stop="showNodeDetails = true"
              >
                <UIcon name="i-heroicons-pencil-square-20-solid" class="size-3.5" />
                <span :class="w.toolbarAnchor.orientation === 'horizontal' ? 'canvas-tooltip-above' : 'canvas-tooltip-left'">{{ t('workflow.editWire') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                :class="w.toolbarAnchor.orientation === 'horizontal' ? 'h-7 w-6' : 'h-6 w-7'"
                @click.stop="duplicateSelection"
              >
                <UIcon name="i-heroicons-square-2-stack-20-solid" class="size-3.5 -scale-x-100" />
                <span :class="w.toolbarAnchor.orientation === 'horizontal' ? 'canvas-tooltip-above' : 'canvas-tooltip-left'">{{ t('workflow.duplicateWire') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex items-center justify-center rounded-lg text-rose-500 transition-colors hover:text-rose-600"
                :class="w.toolbarAnchor.orientation === 'horizontal' ? 'h-7 w-6' : 'h-6 w-7'"
                @click.stop="deleteSelectedWire"
              >
                <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
                <span :class="w.toolbarAnchor.orientation === 'horizontal' ? 'canvas-tooltip-above' : 'canvas-tooltip-left'">{{ t('workflow.deleteWire') }}</span>
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
            :data-node-id="node.id"
            class="absolute rounded-xl border-2 bg-white shadow-sm transition-shadow"
            :class="[
              nodeRunStatus(node.id) === 'running'
                ? 'border-emerald-500 animate-pulse'
                : connecting?.targetId === node.id
                  ? 'border-neutral-900'
                  : isLockedNode(node.id)
                    ? 'border-amber-500 bg-amber-50/40 hover:shadow-md'
                    : isEmbedNode(node)
                      ? 'hover:shadow-md'
                      : isSelected(node.id)
                        ? 'border-neutral-900 hover:shadow-md'
                        : 'border-neutral-400 hover:border-neutral-500 hover:shadow-md',
              isDraggingNode(node.id) ? 'cursor-grabbing shadow-lg' : 'cursor-grab',
              loopBodyNodeIds.has(node.id) ? 'ring-2 ring-offset-1' : '',
            ]"
            :style="{
              left: `${HOVER_PAD}px`,
              top: `${HOVER_PAD}px`,
              width: `${nodeSize(node).w}px`,
              height: `${nodeSize(node).h}px`,
              touchAction: 'none',
              ...(isEmbedNode(node) ? { borderColor: 'var(--color-embed-border)' } : {}),
              ...(loopBodyNodeIds.has(node.id) ? { boxShadow: '0 0 0 2px var(--color-loop-wire-soft)' } : {}),
            }"
            @pointerdown="(e) => onNodePointerDown(e, node)"
          >
            <!-- Three render branches, mutually exclusive:
                 - Terminals (Start / End): single centred title, no
                   editing.
                 - Embed (workflow_ref set): referenced workflow's name +
                   open icon, NOT inline-editable. The InfoPanel handles
                   navigation + repeat.
                 - Regular: title (rename on dblclick) + optional repeat
                   badge under it. -->
            <div
              v-if="node.terminal"
              class="flex h-full items-center justify-center px-2 text-center"
            >
              <span class="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                {{ nodeTitle(node) }}
              </span>
            </div>
            <div
              v-else-if="isEmbedNode(node)"
              class="flex h-full flex-col items-center justify-center gap-1 px-3 py-2 text-center"
            >
              <div class="flex max-w-full items-center justify-center gap-1.5">
                <UIcon
                  name="i-heroicons-arrow-top-right-on-square"
                  class="size-3.5 shrink-0"
                  :style="{ color: 'var(--color-embed-border)' }"
                />
                <span
                  class="max-w-full truncate text-sm font-medium"
                  :style="{ color: 'var(--color-embed-border)' }"
                >
                  {{ embedDisplayName(node) }}
                </span>
              </div>
              <div
                v-if="(node.node.repeat ?? 0) > 1"
                class="flex items-center gap-1 text-[11px] leading-none"
                :style="{ color: 'var(--color-loop-wire-strong)' }"
              >
                <UIcon name="i-heroicons-arrow-path-20-solid" class="size-3" />
                <span class="tabular-nums">{{ node.node.repeat }}</span>
              </div>
            </div>
            <div v-else class="flex h-full flex-col items-center justify-center gap-1 px-3 py-2 text-center">
              <input
                v-if="renamingNodeId === node.id"
                v-model="renamingValue"
                data-node-rename
                type="text"
                class="max-w-full min-w-0 border-0 bg-transparent p-0 text-center text-sm font-medium text-neutral-900 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
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
              <div
                v-if="(node.node.repeat ?? 0) > 1"
                class="flex items-center gap-1 text-[11px] leading-none"
                :style="{ color: 'var(--color-loop-wire-strong)' }"
              >
                <UIcon name="i-heroicons-arrow-path-20-solid" class="size-3" />
                <span class="tabular-nums">{{ node.node.repeat }}</span>
              </div>
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
              && !endpointDrag
              && !connecting?.isDragging
              && !placingWire
              && !marqueeState?.active
              && !persistentMarquee
              && node.terminal !== 'end'
              && isSelected(node.id)
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
              @pointerdown="(e) => onPortPointerDown(e, node, 'top')"
            >
              <span class="grid size-2.5 place-items-center rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-4 group-hover:bg-neutral-500/80">
                <svg class="hidden size-3 text-white group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </span>
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
              @pointerdown="(e) => onPortPointerDown(e, node, 'bottom')"
            >
              <span class="grid size-2.5 place-items-center rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-4 group-hover:bg-neutral-500/80">
                <svg class="hidden size-3 text-white group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
              </span>
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
              @pointerdown="(e) => onPortPointerDown(e, node, 'left')"
            >
              <span class="grid size-2.5 place-items-center rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-4 group-hover:bg-neutral-500/80">
                <svg class="hidden size-3 text-white group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
              </span>
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
              @pointerdown="(e) => onPortPointerDown(e, node, 'right')"
            >
              <span class="grid size-2.5 place-items-center rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-4 group-hover:bg-neutral-500/80">
                <svg class="hidden size-3 text-white group-hover:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          </template>

          <!--
            Resize handle (bottom-right). Only shown for non-terminal nodes
            and only while the pointer is hovering this node's zone, so the
            canvas stays clean. Drag scales the node; release persists +
            records an undo entry. Snaps to grid when snapToGrid is on.
          -->
          <div
            v-if="!node.terminal && !isEmbedNode(node) && isSelected(node.id) && !isDraggingNode(node.id) && !connecting"
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
              v-if="!node.terminal && selected.size === 1 && selectedWireIds.size === 0 && isSelected(node.id) && !isDraggingNode(node.id) && !connecting"
              class="pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-full items-center rounded-xl border border-neutral-200 bg-white/90 shadow-sm backdrop-blur-md"
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
                class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!selectedWorkflowId || runActive"
                @click.stop="rerunFromNode(node)"
              >
                <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
                <span class="canvas-tooltip-above">{{ t('workflow.rerunFromHere') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                @click.stop="showNodeDetails = true"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="size-3.5"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM10 5.25a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Zm-1 4.25a1 1 0 0 1 2 0v5a1 1 0 1 1-2 0v-5Z"
                  />
                </svg>
                <span class="canvas-tooltip-above">{{ t('workflow.nodeDetails') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg transition-colors"
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
                class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
                @click.stop="duplicateSelection"
              >
                <UIcon name="i-heroicons-square-2-stack-20-solid" class="size-3.5 -scale-x-100" />
                <span class="canvas-tooltip-above">{{ t('workflow.duplicateNode') }}</span>
              </button>
              <button
                type="button"
                class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-rose-500 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
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

        <!--
          Endpoint affordance layer. Rendered AFTER the nodes so the grip
          circles (which sit half-inside a node body) draw on top of the
          card, not behind it. Same coordinate system as the wires layer
          since both are inside the inner-shift wrapper.
        -->
        <svg
          class="absolute left-0 top-0 pointer-events-none"
          :width="canvasBounds.width"
          :height="canvasBounds.height"
          style="overflow: visible"
        >
          <!-- Endpoint grip dots for the selected wire. Each grip is a
               visible white disc with an invisible `ENDPOINT_GRIP_HIT_R`
               hit zone on top, wrapped in a `group` so hovering the hit
               zone fills the visible disc black (`group-hover:fill-…`).
               The transparent disc must come AFTER the visible circle in
               source order so it sits on top in the SVG paint stack and
               receives pointer events first. -->
          <g v-for="w in visibleWires" :key="`dots-${w.id}`">
            <g
              v-if="w.clickable
                && selectedWireId === w.id
                && (!endpointDrag || endpointDrag.wireId !== w.id)
                && (!wireBodyDrag || wireBodyDrag.wireId !== w.id || !wireBodyDrag.isDragging)"
            >
              <g class="group">
                <circle
                  :cx="endpointHandlePt(w.p1, w.fromSide).x"
                  :cy="endpointHandlePt(w.p1, w.fromSide).y"
                  :r="ENDPOINT_CIRCLE_R"
                  class="fill-white stroke-neutral-500 group-hover:fill-neutral-900 group-hover:stroke-neutral-900"
                  stroke-width="1.5"
                  style="pointer-events: none"
                />
                <circle
                  :cx="endpointHandlePt(w.p1, w.fromSide).x"
                  :cy="endpointHandlePt(w.p1, w.fromSide).y"
                  :r="ENDPOINT_GRIP_HIT_R"
                  fill="transparent"
                  class="cursor-grab"
                  style="pointer-events: all"
                  @pointerdown.stop="(e) => onEndpointPointerDown(e, w, 'from')"
                />
              </g>
              <g class="group">
                <circle
                  :cx="endpointHandlePt(w.p2, w.toSide).x"
                  :cy="endpointHandlePt(w.p2, w.toSide).y"
                  :r="ENDPOINT_CIRCLE_R"
                  class="fill-white stroke-neutral-500 group-hover:fill-neutral-900 group-hover:stroke-neutral-900"
                  stroke-width="1.5"
                  style="pointer-events: none"
                />
                <circle
                  :cx="endpointHandlePt(w.p2, w.toSide).x"
                  :cy="endpointHandlePt(w.p2, w.toSide).y"
                  :r="ENDPOINT_GRIP_HIT_R"
                  fill="transparent"
                  class="cursor-grab"
                  style="pointer-events: all"
                  @pointerdown.stop="(e) => onEndpointPointerDown(e, w, 'to')"
                />
              </g>
            </g>
          </g>
          <!-- Snap-target circles, only while an endpoint is being dragged.
               The cursor-over-target signal is `t.active` (computed from
               proximity); when active the circle fills black so it matches
               the hover-to-black behavior on a resting wire's grips. -->
          <g v-if="endpointDrag && endpointDrag.isDragging">
            <circle
              v-for="(t, i) in endpointSnapTargets"
              :key="`snap-${t.nodeId}-${t.side}-${i}`"
              :cx="t.pt.x"
              :cy="t.pt.y"
              :r="ENDPOINT_CIRCLE_R"
              :fill="t.active ? 'rgb(23 23 23)' : 'white'"
              :stroke="t.active ? 'rgb(23 23 23)' : 'rgb(115 115 115)'"
              :stroke-width="t.active ? '2' : '1.5'"
              style="pointer-events: none"
            />
          </g>
          <!-- Snap-target circles while a wire body is being dragged.
               Both endpoints are moving, so any side of any non-fixed
               node is a candidate; the active highlight reflects which
               sides each end is currently over. -->
          <g v-if="wireBodyDrag && wireBodyDrag.isDragging">
            <circle
              v-for="(t, i) in wireBodyDragSnapTargets"
              :key="`body-snap-${t.nodeId}-${t.side}-${i}`"
              :cx="t.pt.x"
              :cy="t.pt.y"
              :r="ENDPOINT_CIRCLE_R"
              :fill="t.active ? 'rgb(23 23 23)' : 'white'"
              :stroke="t.active ? 'rgb(23 23 23)' : 'rgb(115 115 115)'"
              :stroke-width="t.active ? '2' : '1.5'"
              style="pointer-events: none"
            />
          </g>
          <!-- Snap-target circles while the user is drawing a new wire
               out of a port. Same affordance as the endpoint-drag layer
               above, just keyed off `connecting` state so the user can
               aim a fresh wire at a specific side just like rewiring an
               existing one. -->
          <g v-if="connecting && connecting.isDragging">
            <circle
              v-for="(t, i) in connectingSnapTargets"
              :key="`conn-snap-${t.nodeId}-${t.side}-${i}`"
              :cx="t.pt.x"
              :cy="t.pt.y"
              :r="ENDPOINT_CIRCLE_R"
              :fill="t.active ? 'rgb(23 23 23)' : 'white'"
              :stroke="t.active ? 'rgb(23 23 23)' : 'rgb(115 115 115)'"
              :stroke-width="t.active ? '2' : '1.5'"
              style="pointer-events: none"
            />
          </g>
          <!-- Snap-target circles for the click-click draw-wire tool. Same
               white circles as the drag-based wire creation above so the
               two flows have a consistent "this is a wire endpoint" look,
               but rendered any time the tool is armed (not only while the
               cursor is moving) so the targets are visible at rest too. -->
          <g v-if="placingWire">
            <circle
              v-for="(t, i) in placingWireSnapTargets"
              :key="`place-snap-${t.nodeId}-${t.side}-${i}`"
              :cx="t.pt.x"
              :cy="t.pt.y"
              :r="ENDPOINT_CIRCLE_R"
              :fill="t.active ? 'rgb(23 23 23)' : 'white'"
              :stroke="t.active ? 'rgb(23 23 23)' : 'rgb(115 115 115)'"
              :stroke-width="t.active ? '2' : '1.5'"
              style="pointer-events: none"
            />
          </g>
          <!-- Grip dot following the cursor while an endpoint is being
               dragged — gives the user a visual "I'm holding this circle"
               affordance. Sits exactly on the rubber-band's free end so
               the arrowhead (when dragging the to-end) tip kisses it the
               same way it does on a resting wire. -->
          <circle
            v-if="endpointDrag && endpointDrag.isDragging"
            :cx="(endpointDrag.snappedPt ?? endpointDrag.currPos).x"
            :cy="(endpointDrag.snappedPt ?? endpointDrag.currPos).y"
            :r="ENDPOINT_CIRCLE_R"
            fill="white"
            stroke="rgb(23 23 23)"
            stroke-width="2"
            style="pointer-events: none"
          />
          <!-- Grip dot following the cursor while a brand-new wire is
               being drawn out of a port. Same rules as the endpoint-drag
               grip above. -->
          <circle
            v-if="connecting && connecting.isDragging"
            :cx="(connecting.snappedPt ?? connecting.currPos).x"
            :cy="(connecting.snappedPt ?? connecting.currPos).y"
            :r="ENDPOINT_CIRCLE_R"
            fill="white"
            stroke="rgb(23 23 23)"
            stroke-width="2"
            style="pointer-events: none"
          />
          <!-- Both grip dots while a wire body is being dragged. Each
               clips to the snap target when one is active so the user
               sees exactly where each end will land. -->
          <g v-if="wireBodyDrag && wireBodyDrag.isDragging">
            <circle
              :cx="wireBodyDrag.fromSnap
                ? wireBodyDrag.fromSnap.pt.x
                : wireBodyDrag.origFromPos.x + wireBodyDrag.delta.x"
              :cy="wireBodyDrag.fromSnap
                ? wireBodyDrag.fromSnap.pt.y
                : wireBodyDrag.origFromPos.y + wireBodyDrag.delta.y"
              :r="ENDPOINT_CIRCLE_R"
              fill="white"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              style="pointer-events: none"
            />
            <circle
              :cx="wireBodyDrag.toSnap
                ? wireBodyDrag.toSnap.pt.x
                : wireBodyDrag.origToPos.x + wireBodyDrag.delta.x"
              :cy="wireBodyDrag.toSnap
                ? wireBodyDrag.toSnap.pt.y
                : wireBodyDrag.origToPos.y + wireBodyDrag.delta.y"
              :r="ENDPOINT_CIRCLE_R"
              fill="white"
              stroke="rgb(23 23 23)"
              stroke-width="2"
              style="pointer-events: none"
            />
          </g>
        </svg>
        </div>
      </div>

      <!--
        Marquee overlay. Rendered in viewport-relative screen coords (not
        canvas coords) so its stroke stays a constant 1px regardless of
        zoom, matching the FileBrowser marquee. The box itself is purely
        visual — pointer-events: none lets clicks pass through to nodes /
        background. The delete bar above the persistent box opts back in.
      -->
      <div
        v-if="marqueeState?.active && marqueeBoxScreen"
        class="pointer-events-none absolute z-20 rounded-sm border border-dashed border-neutral-700/70 bg-neutral-900/5"
        :style="{
          left: `${marqueeBoxScreen.left}px`,
          top: `${marqueeBoxScreen.top}px`,
          width: `${marqueeBoxScreen.width}px`,
          height: `${marqueeBoxScreen.height}px`,
        }"
      />
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
      <template v-else-if="selectionDetailNode && isEmbedNode(selectionDetailNode)">
        <div class="flex-1 px-4 pt-2 pb-3">
          <p
            v-if="isLockedNode(selectionDetailNode.id)"
            class="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
          >
            {{ t('workflow.lockedHint') }}
          </p>
          <EmbedInfoView
            :key="`${selectionDetailNode.id}:${formInstanceBump}`"
            :node-id="selectionDetailNode.id"
            :node="selectionDetailNode.node"
            :workflow="embedResolved(selectionDetailNode)"
            :locked="isLockedNode(selectionDetailNode.id)"
            @update:patch="onNodePatch"
            @navigate="onEmbedNavigate"
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
    </InfoPanel>

    <!-- Multi-select contextual action bar. Floats above the topmost
         selected item (nodes + wires combined). The vertical gap matches
         the single-node pill — PORT_GAP*2 canvas-px scaled to screen —
         so it reads as the same kind of overlay just covering more items
         at once. -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-2 opacity-0"
    >
      <div
        v-if="(selected.size + selectedWireIds.size) > 1 && multiSelectAnchor"
        class="pointer-events-auto absolute z-50 flex items-center rounded-xl border border-neutral-200 bg-white/90 shadow-sm backdrop-blur-md"
        :style="{
          left: `${multiSelectAnchor.x}px`,
          top: `${multiSelectAnchor.y}px`,
          transform: 'translate(-50%, -100%)',
        }"
        @pointerdown.stop
      >
        <span class="px-2 text-caption font-medium text-neutral-700">
          {{ t('workflow.selectedCount', { n: selected.size + selectedWireIds.size }) }}
        </span>
        <span class="h-3 w-px bg-neutral-200" />
        <button
          type="button"
          class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
          @click.stop="duplicateSelection"
        >
          <UIcon name="i-heroicons-square-2-stack-20-solid" class="size-3.5 -scale-x-100" />
          <span class="canvas-tooltip-above">{{ t('workflow.duplicateSelection') }}</span>
        </button>
        <button
          type="button"
          class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-rose-500 transition-colors hover:text-rose-600"
          @click.stop="deleteMarqueeSelection"
        >
          <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
          <span class="canvas-tooltip-above">{{ t('workflow.deleteSelection') }}</span>
        </button>
        <button
          type="button"
          class="group/btn relative inline-flex h-7 w-6 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
          @click.stop="dismissPersistentMarquee()"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-3.5" />
          <span class="canvas-tooltip-above">{{ t('workflow.clearSelection') }}</span>
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

/* Left-of-button variant used by the vertical wire-selection toolbar so
   tooltips on stacked buttons don't pop over each other. Same chrome as
   `.canvas-tooltip`, but margin-only swap to keep the rendered text on the
   opposite side of the wire from the toolbar itself. */
.canvas-tooltip-left {
  position: absolute;
  right: 100%;
  top: 50%;
  z-index: 20;
  margin-right: 0.5rem;
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
.group\/btn:hover > .canvas-tooltip-left {
  opacity: 1;
}
</style>
