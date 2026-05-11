<script setup lang="ts">
import type { WorkflowStep, WorkflowVersion, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'
import { VersionConflictError } from '~/composables/workflows/useWorkflows'
import type { NodeModel, WireModel } from '~/composables/workflows/useWorkflowLayout'
import { buildLayout } from '~/composables/workflows/useWorkflowLayout'
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
const isRunActive = computed(() => {
  const s = workflowRun?.runStatus.value
  return s === 'running' || s === 'pending'
})

const workspaceId = computed(() => {
  const s = sessions.value.find(s => s.id === props.sessionId)
  return s?.workspace_id ?? currentWorkspace.value?.id ?? ''
})

const draftSteps = useState<WorkflowStep[]>(`workflow-draft-steps:${props.sessionId}`, () => [])
const selectedWorkflowKey = computed(() => `polymux_workflow_for_session_${props.sessionId}`)

const selectedWorkflowId = ref<string | null>(null)
const loadedSteps = ref<WorkflowStep[]>([])
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
    loadedSteps.value = []
    latestVersionId.value = null
    latestVersionNumber.value = 0
    return
  }
  const wf = await getWorkflow(workspaceId.value, id) as WorkflowWithLatest | null
  loadedSteps.value = (wf?.latest_version?.steps ?? []) as WorkflowStep[]
  latestVersionId.value = wf?.latest_version?.id ?? null
  latestVersionNumber.value = wf?.latest_version?.version ?? 0
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

const displayedSteps = computed<WorkflowStep[]>(() => {
  // When the user has picked a version from history, the canvas previews
  // that version's steps. Edits while previewing are gated behind a revert
  // confirm — see `attemptEdit` / `confirmRevert` below.
  if (previewedVersion.value) return previewedVersion.value.steps as WorkflowStep[]
  if (draftSteps.value.length > 0) return draftSteps.value
  return loadedSteps.value
})

// Auto-expand all nodes for layout — the canvas shows everything at once.
const expandedSet = computed(() => {
  const s = new Set<string>()
  const walk = (nodes: WorkflowStep[]) => {
    for (const n of nodes) {
      if (n.id) s.add(n.id)
      if (n.children) walk(n.children)
    }
  }
  walk(displayedSteps.value)
  return s
})

// -- Parallel collapse / expand state ------------------------------------
// Parallel parents start collapsed (no children in the layout). Clicking the
// node toggles it into the expandedIds set so the layout engine generates
// grouped child nodes. The canvas auto-expands parallel nodes by default
// (they go into expandedSet above); this collapsedParallelIds set is used
// by the *node canvas* to override that and keep them collapsed until clicked.
const collapsedParallelIds = ref<Set<string>>(new Set())

// The expandedSet used by buildLayout needs to exclude collapsed parallel IDs.
const canvasExpandedSet = computed(() => {
  const base = expandedSet.value
  const collapsed = collapsedParallelIds.value
  if (collapsed.size === 0) return base
  const result = new Set<string>()
  for (const id of base) {
    if (!collapsed.has(id)) result.add(id)
  }
  return result
})

const layout = computed(() => buildLayout(displayedSteps.value, canvasExpandedSet.value))

// Bootstrap initial collapsed set by walking displayedSteps directly.
// We must NOT watch `layout` here — modifying collapsedParallelIds would
// invalidate canvasExpandedSet, which invalidates layout, which retriggers
// this watch, infinite-looping until Vue bails (which leaves the canvas in
// a broken half-rendered state).
const collapsedInitialized = ref(false)
watch(displayedSteps, (steps) => {
  if (collapsedInitialized.value) return
  if (steps.length === 0) return
  const next = new Set<string>()
  const walk = (nodes: WorkflowStep[]) => {
    for (const n of nodes) {
      if (n.kind === 'parallel' && n.children?.length && n.id) {
        next.add(n.id)
      }
      if (n.children) walk(n.children)
    }
  }
  walk(steps)
  collapsedParallelIds.value = next
  collapsedInitialized.value = true
}, { immediate: true })

function toggleParallelCollapse(nodeId: string) {
  const next = new Set(collapsedParallelIds.value)
  if (next.has(nodeId)) {
    next.delete(nodeId)
  } else {
    next.add(nodeId)
  }
  collapsedParallelIds.value = next
}

// ── Node positions ──────────────────────────────────────────────────────────
// Default grid from buildLayout columns/rows; user drags overlay per-node deltas
// persisted to localStorage so the user's hand-arranged canvas survives reloads.
const NODE_W = 220
const NODE_H = 84
// Generous gaps so the bezier curves between nodes have room to bow without
// passing through a neighbouring node — the auto layout sits this far apart
// in both axes by default; users can pull nodes closer manually if they want.
const COL_GAP = 120
const ROW_GAP = 80
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
const extrasKey = computed(() => `polymux_extra_nodes_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

interface Pt { x: number; y: number }
const overrides = ref<Record<string, Pt>>({})

// Extra nodes spawned interactively from a hover port. They live entirely in
// the canvas (not in the persisted workflow steps) — they're a quick way for
// the user to sketch out additional structure visually. Persisted in
// localStorage alongside position overrides so the sketch survives reloads.
interface ExtraNode {
  id: string
  parentId: string
  pos: Pt
}
const extraNodes = ref<ExtraNode[]>([])

// User-drawn wires between two existing nodes (i.e. the user dragged from a
// port and released over another node's hover zone). Same persistence model
// as extras — the wire is a session-local sketch, not a workflow edit.
interface UserWire {
  id: string
  fromId: string
  toId: string
}
const userWires = ref<UserWire[]>([])
const userWiresKey = computed(() => `polymux_user_wires_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

watch(positionsKey, (key) => {
  overrides.value = {}
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) overrides.value = JSON.parse(raw) as Record<string, Pt>
  }
  catch {}
}, { immediate: true })

watch(extrasKey, (key) => {
  extraNodes.value = []
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) extraNodes.value = JSON.parse(raw) as ExtraNode[]
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

function persistOverrides() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(positionsKey.value, JSON.stringify(overrides.value))
  }
  catch {}
}

function persistExtras() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(extrasKey.value, JSON.stringify(extraNodes.value))
  }
  catch {}
}

function persistUserWires() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(userWiresKey.value, JSON.stringify(userWires.value))
  }
  catch {}
}

function defaultPos(node: NodeModel): Pt {
  return {
    x: 40 + node.col * (NODE_W + COL_GAP),
    y: 40 + node.row * (NODE_H + ROW_GAP),
  }
}

// Treat extras as full first-class NodeModels so the rest of the rendering
// pipeline (selection, drag, wires, fit-to-view) doesn't need a special path.
function extraToNodeModel(e: ExtraNode): NodeModel {
  return {
    id: e.id,
    step: { id: e.id, kind: 'directive' },
    kind: 'directive',
    col: 0,
    row: 0,
    displayState: 'active',
  }
}

const allNodes = computed<NodeModel[]>(() => [
  ...layout.value.nodes,
  ...extraNodes.value.map(extraToNodeModel),
])

interface FlatWire { id: string; fromId: string; toId: string }
const allWires = computed<FlatWire[]>(() => [
  ...layout.value.wires.map(w => ({ id: w.id, fromId: w.fromId, toId: w.toId })),
  ...extraNodes.value.map(e => ({
    id: `straight:${e.parentId}->${e.id}`,
    fromId: e.parentId,
    toId: e.id,
  })),
  ...userWires.value,
])

function nodePos(node: NodeModel): Pt {
  const ovr = overrides.value[node.id]
  if (ovr) return ovr
  const ext = extraNodes.value.find(e => e.id === node.id)
  if (ext) return ext.pos
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
    if (p.x - 80 < minX) minX = p.x - 80
    if (p.y - 80 < minY) minY = p.y - 80
    if (p.x + NODE_W + 80 > maxX) maxX = p.x + NODE_W + 80
    if (p.y + NODE_H + 80 > maxY) maxY = p.y + NODE_H + 80
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
  // Background click clears selection.
  if (e.button === 0) selected.value = new Set()
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
    if (p.x < nMinX) nMinX = p.x
    if (p.y < nMinY) nMinY = p.y
    if (p.x + NODE_W > nMaxX) nMaxX = p.x + NODE_W
    if (p.y + NODE_H > nMaxY) nMaxY = p.y + NODE_H
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

onMounted(() => { nextTick(fitToView) })
watch(() => layout.value.nodes.length, () => { nextTick(fitToView) })

// ── Undo / redo history ─────────────────────────────────────────────────────
// Snapshots cover every piece of canvas-local draft state that a user action
// can mutate: position overrides, spawned nodes, user-drawn wires, and the
// hidden-from-view set. They DON'T touch the persisted workflow on the
// backend — the saved version stays put until the user explicitly saves
// elsewhere. The pointer indexes into a linear history; recording a new
// state truncates any forward branch (standard editor undo semantics).
interface CanvasSnapshot {
  overrides: Record<string, Pt>
  extraNodes: ExtraNode[]
  userWires: UserWire[]
  hidden: string[]
}
const HISTORY_LIMIT = 100
const history = ref<CanvasSnapshot[]>([])
const historyPointer = ref(-1)

function snapshotCurrent(): CanvasSnapshot {
  return {
    overrides: { ...overrides.value },
    extraNodes: extraNodes.value.map(e => ({ ...e, pos: { ...e.pos } })),
    userWires: userWires.value.map(w => ({ ...w })),
    hidden: [...hidden.value],
  }
}

function applySnapshot(s: CanvasSnapshot) {
  overrides.value = { ...s.overrides }
  extraNodes.value = s.extraNodes.map(e => ({ ...e, pos: { ...e.pos } }))
  userWires.value = s.userWires.map(w => ({ ...w }))
  hidden.value = new Set(s.hidden)
  persistOverrides()
  persistExtras()
  persistUserWires()
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

function selectNode(id: string, additive: boolean) {
  const next = new Set(additive ? selected.value : [])
  if (additive && next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const selectionDetailNode = computed<NodeModel | null>(() => {
  if (selected.value.size !== 1) return null
  const id = [...selected.value][0]!
  return allNodes.value.find(n => n.id === id) ?? null
})

// ── Drag node ───────────────────────────────────────────────────────────────
// Document-level move/up handlers (rather than pointer capture) so a fast drag
// that outruns the moving node element keeps tracking — capture-based drag in
// here used to "stick" when the cursor crossed the canvas edge or another
// element repainted under the pointer mid-frame.
const draggingIds = ref<Set<string>>(new Set())

// Node-details panel only opens for a *click* on a node, not for a grab
// that turns into a drag. Each pointerdown resets this; the pointerup
// handler sets it true only when no drag movement occurred. X-close clears
// selection (which closes the panel via `selectionDetailNode`), so this
// flag doesn't need a separate reset path.
const showNodeDetails = ref(false)

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
        for (const other of visibleNodes.value) {
          if (ids.includes(other.id)) continue
          const op = nodePos(other)
          // X candidates: left, centre, right
          const xCandidates: Array<[number, number]> = [
            [nx, op.x],
            [nx + NODE_W / 2, op.x + NODE_W / 2],
            [nx + NODE_W, op.x + NODE_W],
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
            [ny + NODE_H / 2, op.y + NODE_H / 2],
            [ny + NODE_H, op.y + NODE_H],
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
    persistOverrides()
    // Skip the history entry if nothing actually moved (a click counts as
    // a zero-pixel drag and shouldn't fill the undo stack).
    const moved = ids.some((id) => {
      const o = origins[id]
      const cur = overrides.value[id]
      return o && cur && (Math.abs(o.x - cur.x) > 0.5 || Math.abs(o.y - cur.y) > 0.5)
    })
    if (moved) recordHistory()
    // Pure click (no drag) re-opens the details panel; a drag leaves it
    // closed so the user can keep working without the panel popping in.
    else showNodeDetails.value = true
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

// ── Port click → spawn a new linked node ────────────────────────────────────
let spawnCounter = 0

function spawnFromPort(parent: NodeModel, side: Side) {
  if (!attemptEdit()) return
  const pp = nodePos(parent)
  let x = pp.x
  let y = pp.y
  switch (side) {
    case 'right': x = pp.x + NODE_W + SPAWN_GAP; break
    case 'left': x = pp.x - NODE_W - SPAWN_GAP; break
    case 'top': y = pp.y - NODE_H - SPAWN_GAP; break
    case 'bottom': y = pp.y + NODE_H + SPAWN_GAP; break
  }
  spawnCounter += 1
  const id = `local-${Date.now()}-${spawnCounter}`
  extraNodes.value = [
    ...extraNodes.value,
    { id, parentId: parent.id, pos: { x, y } },
  ]
  persistExtras()
  // Don't force active = new id here — the pointer is still inside the
  // parent's zone, so its pointerleave hasn't fired yet. Forcing active
  // here would leave activeHoverNodeId stuck on the new node when the
  // pointer eventually leaves the parent. Let the natural enter/leave
  // dance pick up focus when the user moves to the spawned node.
  selected.value = new Set([id])
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
    if (
      wfPos.x >= p.x - HOVER_PAD
      && wfPos.x <= p.x + NODE_W + HOVER_PAD
      && wfPos.y >= p.y - HOVER_PAD
      && wfPos.y <= p.y + NODE_H + HOVER_PAD
    ) {
      return n.id
    }
  }
  return null
}

function addUserWire(fromId: string, toId: string) {
  if (fromId === toId) return
  // Skip exact duplicates from any source (layout, extra, or prior user wire).
  if (allWires.value.some(w => w.fromId === fromId && w.toId === toId)) return
  const id = `user:${fromId}->${toId}-${Date.now()}`
  userWires.value = [...userWires.value, { id, fromId, toId }]
  persistUserWires()
  recordHistory()
}

function onPortPointerDown(e: PointerEvent, parent: NodeModel, side: Side) {
  e.stopPropagation()
  e.preventDefault()
  if (e.button !== 0) return
  portPreview.value = null
  const pp = nodePos(parent)
  const port = pointOnSide(pp, side)
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
  let x = ppos.x
  let y = ppos.y
  switch (pp.side) {
    case 'right': x = ppos.x + NODE_W + SPAWN_GAP; break
    case 'left': x = ppos.x - NODE_W - SPAWN_GAP; break
    case 'top': y = ppos.y - NODE_H - SPAWN_GAP; break
    case 'bottom': y = ppos.y + NODE_H + SPAWN_GAP; break
  }
  return { parent, pos: { x, y }, side: pp.side }
})

const ghostWireGeom = computed<{ d: string } | null>(() => {
  const g = ghostPreview.value
  if (!g) return null
  const pa = nodePos(g.parent)
  const pb = g.pos
  const sides = chooseSides(pa, pb)
  const p1 = pointOnSide(pa, sides.from)
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
    const tCenter = { x: tp.x + NODE_W / 2, y: tp.y + NODE_H / 2 }
    const ddx = tCenter.x - sourcePort.x
    const ddy = tCenter.y - sourcePort.y
    if (Math.abs(ddx) >= Math.abs(ddy)) {
      targetSide = ddx >= 0 ? 'left' : 'right'
    }
    else {
      targetSide = ddy >= 0 ? 'top' : 'bottom'
    }
    endPort = pointOnSide(tp, targetSide)
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

// ── Wires ──────────────────────────────────────────────────────────────────
// Each wire picks the nearest side of its source and target nodes so the
// connection always reads as the shortest natural arc — bottom→top for a
// vertical chain, right→left for a horizontal one, or a corner-to-corner
// curve for diagonals. The bezier control handles are pushed *away* from
// each port along its outward normal, which makes the curve enter and leave
// each node perpendicular to the chosen edge instead of clipping the corner.
type WireType = 'fluid' | 'linear' | 'step'
type Side = 'top' | 'bottom' | 'left' | 'right'

function pointOnSide(pos: Pt, side: Side): Pt {
  switch (side) {
    case 'right': return { x: pos.x + NODE_W, y: pos.y + NODE_H / 2 }
    case 'left': return { x: pos.x, y: pos.y + NODE_H / 2 }
    case 'top': return { x: pos.x + NODE_W / 2, y: pos.y }
    case 'bottom': return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H }
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
  return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 }
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
    for (const fromSide of aCandidates) {
      const p1 = pointOnSide(pa, fromSide)
      for (const toSide of bCandidates) {
        const p2 = pointOnSide(pb, toSide)
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

interface WireGeom { id: string; d: string }

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
  const wt = settings.value.wireType ?? 'fluid'
  for (const w of allWires.value) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    if (!a || !b) continue
    const pa = nodePos(a)
    const pb = nodePos(b)
    const assigned = sides.get(w.id)
    const fromSide: Side = assigned?.fromSide ?? 'right'
    const toSide: Side = assigned?.toSide ?? 'left'
    const p1 = pointOnSide(pa, fromSide)
    const p2 = pointOnSide(pb, toSide)
    out.push({
      id: `${w.fromId}->${w.toId}`,
      d: buildWirePath(p1, p2, fromSide, toSide, wt),
    })
  }
  return out
})

// ── Actions ────────────────────────────────────────────────────────────────

// visibleNodesFinal just uses visibleNodes (the hidden set is for user-deleted nodes)
const visibleNodesFinal = computed(() => visibleNodes.value)

function badgeClass(kind: string) {
  switch (kind) {
    case 'loop': return 'bg-amber-100 text-amber-800'
    case 'parallel': return 'bg-violet-100 text-violet-800'
    case 'sequence': return 'bg-emerald-100 text-emerald-800'
    default: return 'bg-sky-100 text-sky-800'
  }
}

function nodeTitle(n: NodeModel) {
  const s = n.step
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
  const r = await startRun(workspaceId.value, selectedWorkflowId.value, {
    session_id: props.sessionId,
    resume_from_node_id: id,
  })
  if ('error' in r) toast.show(`${t('workflow.runFailedToast')}: ${r.error}`, 'error', 5000)
}

function deleteSelected() {
  if (selected.value.size === 0) return
  // Terminals can't be removed — the spine always needs a Start and End.
  const deletable = [...selected.value].filter(id => !isTerminalId(id))
  if (deletable.length === 0) return
  if (!attemptEdit()) return
  // Delete local override entry; we don't mutate persisted workflow steps
  // here. This pruned set is purely visual for the canvas session.
  const next = { ...overrides.value }
  for (const id of deletable) delete next[id]
  overrides.value = next
  // Spawned (extra) nodes get fully removed; layout-derived nodes are just
  // hidden from view since they're owned by the persisted workflow.
  const deletableSet = new Set(deletable)
  const remainingExtras = extraNodes.value.filter(e => !deletableSet.has(e.id))
  const purgedExtraIds = new Set(extraNodes.value.filter(e => deletableSet.has(e.id)).map(e => e.id))
  if (remainingExtras.length !== extraNodes.value.length) {
    extraNodes.value = remainingExtras
    persistExtras()
  }
  // Drop user wires that referenced any removed node — otherwise they'd
  // dangle and pollute persistence on reload.
  const remainingUserWires = userWires.value.filter(
    w => !deletableSet.has(w.fromId) && !deletableSet.has(w.toId),
  )
  if (remainingUserWires.length !== userWires.value.length) {
    userWires.value = remainingUserWires
    persistUserWires()
  }
  const hiddenAdditions = deletable.filter(id => !purgedExtraIds.has(id))
  hidden.value = new Set([...hidden.value, ...hiddenAdditions])
  selected.value = new Set()
  persistOverrides()
  recordHistory()
}

const hidden = ref<Set<string>>(new Set())

const visibleNodes = computed(() => allNodes.value.filter(n => !hidden.value.has(n.id)))
const visibleWires = computed(() => wireGeoms.value.filter((w) => {
  const [from, to] = w.id.split('->')
  return !hidden.value.has(from!) && !hidden.value.has(to!)
}))

// ── Layout actions ──────────────────────────────────────────────────────────
const hasOverrides = computed(
  () => Object.keys(overrides.value).length > 0
    || extraNodes.value.length > 0
    || userWires.value.length > 0,
)

function resetLayout() {
  overrides.value = {}
  hidden.value = new Set()
  extraNodes.value = []
  userWires.value = []
  persistOverrides()
  persistExtras()
  persistUserWires()
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
// no steps, mid-save, previewing a past version, or — most subtly — the
// currently displayed steps serialise the same as the latest saved
// version (so a no-op save would just duplicate the head version).
function stepsSignature(steps: WorkflowStep[] | undefined | null): string {
  if (!steps || steps.length === 0) return '[]'
  return JSON.stringify(steps)
}

const canSave = computed(() => {
  if (!selectedWorkflowId.value) return false
  if (saving.value) return false
  if (inPreviewMode.value) return false
  const current = displayedSteps.value
  if (current.length === 0) return false
  if (stepsSignature(current) === stepsSignature(loadedSteps.value)) return false
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
  // Replace the live draft with the version's steps and clear canvas-local
  // sketch state (overrides, extras, user wires) because they referenced
  // node IDs from a different snapshot.
  draftSteps.value = v.steps as WorkflowStep[]
  overrides.value = {}
  extraNodes.value = []
  userWires.value = []
  hidden.value = new Set()
  selected.value = new Set()
  selectedVersionId.value = null
  persistOverrides()
  persistExtras()
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
      loadedSteps.value = result.version.steps as WorkflowStep[]
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
  const stepsDiffer = draftSteps.value.length > 0
    && stepsSignature(draftSteps.value) !== stepsSignature(loadedSteps.value)
  const hasLocalEdits = hasOverrides.value
  if (!stepsDiffer && !hasLocalEdits) return null
  return { kind: selectedWorkflowId.value ? 'user-unsaved' : 'agent-draft' }
})
const canRun = computed(() => !!selectedWorkflowId.value && !running.value)

async function onSave() {
  if (!canSave.value || !selectedWorkflowId.value) return
  saving.value = true
  try {
    const created = await createVersion(workspaceId.value, selectedWorkflowId.value, {
      steps: displayedSteps.value as WorkflowStep[],
      expected_version: latestVersionNumber.value,
      source: 'user',
      impact_level: 'preference',
    })
    if (created) {
      toast.show(t('workflow.savedToast'), 'info', 3000)
      // Re-pull the workflow so latestVersionNumber updates and the next
      // save passes the correct expected_version.
      await loadSelected()
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

function onSettingsDocClick(ev: MouseEvent) {
  if (!showSettings.value) return
  const t = ev.target as Node | null
  if (!t) return
  if (settingsButtonEl.value?.contains(t)) return
  if (settingsMenuEl.value?.contains(t)) return
  showSettings.value = false
}

watch(showSettings, (open) => {
  if (open) document.addEventListener('mousedown', onSettingsDocClick)
  else document.removeEventListener('mousedown', onSettingsDocClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onSettingsDocClick)
})
</script>

<template>
  <div class="relative flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-neutral-50">
    <!--
      Side toolbar — slim vertical icon-only column on the left. Single
      merged pill: history / save / run at the top, then layout helpers,
      zoom, undo-redo, and settings stacked beneath.
    -->
    <div class="absolute left-3 top-[112px] bottom-[180px] z-30 flex flex-col gap-2 pointer-events-none sm:left-4">
      <div class="flex h-full w-10 flex-col items-center justify-between gap-0.5 overflow-hidden rounded-xl border border-neutral-200 bg-white/90 px-1 py-1.5 shadow-sm backdrop-blur-md pointer-events-auto">
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
              class="absolute left-full top-0 ml-2 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
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
        v-if="layout.nodes.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2 text-center text-caption text-neutral-400">
          <UIcon name="i-heroicons-share-20-solid" class="size-8 text-neutral-300" />
          <p>{{ t('workflow.nodeCanvasEmpty') }}</p>
        </div>
      </div>

      <div
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
            class="pointer-events-none absolute left-0 top-0"
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
              <!-- Wire shadow for depth -->
              <path
                :d="w.d"
                fill="none"
                stroke="rgb(0 0 0 / 0.04)"
                stroke-width="3"
                stroke-linecap="round"
              />
              <!-- Main wire with arrowhead -->
              <path
                :d="w.d"
                fill="none"
                stroke="rgb(163 163 163)"
                stroke-width="1.5"
                stroke-linecap="round"
                marker-end="url(#wire-arrow)"
              />
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
          Each node lives inside an invisible hover zone HOVER_PAD wider on
          every side. When the pointer enters the zone we mark the node as
          the active hover target, which reveals the four side ports just
          outside the card. The card itself is positioned at (HOVER_PAD,
          HOVER_PAD) inside the zone so its on-screen coordinates still
          match nodePos(). data-node lives on the zone so a click anywhere
          inside it is treated as "on a node" by the canvas pan handler.
        -->
        <div
          v-for="node in visibleNodesFinal"
          :key="node.id"
          data-node
          class="absolute"
          :style="{
            left: `${nodePos(node).x - HOVER_PAD}px`,
            top: `${nodePos(node).y - HOVER_PAD}px`,
            width: `${NODE_W + HOVER_PAD * 2}px`,
            height: `${NODE_H + HOVER_PAD * 2}px`,
          }"
          @pointerenter="onZoneEnter(node.id)"
          @pointerleave="onZoneLeave(node.id)"
        >
          <!-- Card -->
          <div
            class="absolute rounded-xl border bg-white shadow-sm transition-shadow"
            :class="[
              connecting?.targetId === node.id
                ? 'border-blue-400 ring-2 ring-blue-300/50'
                : isSelected(node.id)
                  ? 'border-neutral-900 ring-2 ring-neutral-900/20'
                  : 'border-neutral-200 hover:border-neutral-400 hover:shadow-md',
              node.terminal ? 'opacity-80' : '',
              isDraggingNode(node.id) ? 'cursor-grabbing shadow-lg' : 'cursor-grab',
            ]"
            :style="{
              left: `${HOVER_PAD}px`,
              top: `${HOVER_PAD}px`,
              width: `${NODE_W}px`,
              height: `${NODE_H}px`,
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
              class="flex h-full items-center justify-center px-3 py-2 text-center"
            >
              <span class="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                {{ nodeTitle(node) }}
              </span>
            </div>
            <div v-else class="flex h-full flex-col items-center justify-center gap-1 px-3 py-2 text-center">
              <span class="max-w-full truncate text-sm font-medium text-neutral-900">
                {{ nodeTitle(node) }}
              </span>
              <span
                v-if="node.kind === 'parallel' || node.kind === 'loop'"
                class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="badgeClass(node.kind)"
              >
                {{ node.kind }}
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
                left: `${HOVER_PAD + NODE_W / 2}px`,
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
                left: `${HOVER_PAD + NODE_W / 2}px`,
                top: `${HOVER_PAD + NODE_H + PORT_GAP}px`,
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
                top: `${HOVER_PAD + NODE_H / 2}px`,
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
                left: `${HOVER_PAD + NODE_W + PORT_GAP}px`,
                top: `${HOVER_PAD + NODE_H / 2}px`,
                touchAction: 'none',
              }"
              @pointerenter="onPortHover(node, 'right')"
              @pointerleave="onPortLeave(node, 'right')"
              @pointerdown="(e) => onPortPointerDown(e, node, 'right')"
            >
              <span class="block size-2.5 rounded-full bg-neutral-400/50 transition-all duration-150 group-hover:size-3 group-hover:bg-neutral-500/70" />
            </button>
          </template>
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
        </div>
      </div>
    </div>

    <!-- Right detail panel: rounded, inset from edges. -->
    <InfoPanel
      :open="!!selectionDetailNode && showNodeDetails"
      :title="selectionDetailNode ? nodeTitle(selectionDetailNode) : ''"
      @close="selected = new Set()"
    >
      <template v-if="selectionDetailNode">
        <div class="flex-1 px-4 pt-2 pb-3">
          <div class="space-y-5">
            <section>
              <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                {{ t('workflow.toolUse') }}
              </div>
              <dl class="mt-2 space-y-1.5 text-sm">
                <div v-if="selectionDetailNode.step.action" class="grid grid-cols-[64px_1fr] gap-3">
                  <dt class="text-[11px] text-neutral-400">action</dt>
                  <dd class="min-w-0 break-all font-mono text-[12px] text-neutral-800">{{ selectionDetailNode.step.action }}</dd>
                </div>
                <div v-if="selectionDetailNode.step.target" class="grid grid-cols-[64px_1fr] gap-3">
                  <dt class="text-[11px] text-neutral-400">target</dt>
                  <dd class="min-w-0 break-all font-mono text-[12px] text-neutral-800">{{ selectionDetailNode.step.target }}</dd>
                </div>
                <div v-if="selectionDetailNode.step.value" class="grid grid-cols-[64px_1fr] gap-3">
                  <dt class="text-[11px] text-neutral-400">value</dt>
                  <dd class="min-w-0 break-all font-mono text-[12px] text-neutral-800">{{ selectionDetailNode.step.value }}</dd>
                </div>
                <div v-if="selectionDetailNode.step.condition" class="grid grid-cols-[64px_1fr] gap-3">
                  <dt class="text-[11px] text-neutral-400">condition</dt>
                  <dd class="min-w-0 break-all font-mono text-[12px] text-neutral-800">{{ selectionDetailNode.step.condition }}</dd>
                </div>
                <p
                  v-if="!selectionDetailNode.step.action && !selectionDetailNode.step.target && !selectionDetailNode.step.value && !selectionDetailNode.step.condition"
                  class="text-[11px] text-neutral-400"
                >
                  {{ t('workflow.noToolUse') }}
                </p>
              </dl>
            </section>

            <section v-if="(selectionDetailNode.step.children?.length ?? 0) > 0">
              <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                children · {{ selectionDetailNode.step.children!.length }}
              </div>
              <ul class="mt-2 space-y-0.5 text-[12px] text-neutral-700">
                <li
                  v-for="(child, idx) in selectionDetailNode.step.children"
                  :key="child.id ?? idx"
                  class="min-w-0 break-words py-1 leading-snug"
                >
                  {{ child.description || `${child.action ?? ''} ${child.target ?? ''}`.trim() || t('workflow.untitledNode') }}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </template>

      <template v-if="selectionDetailNode" #footer>
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
</style>
