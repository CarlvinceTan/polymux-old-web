import type { WorkflowStep } from '~/composables/useWorkflows'

// The layout-time set of kinds. The runtime data model only emits 'directive',
// 'loop', 'parallel' today (see polymux/internal/agent/tools_orchestrator.go);
// 'conditional' is accepted here so the renderer is ready when the orchestrator
// starts emitting it.
export type LayoutNodeKind = 'directive' | 'loop' | 'parallel' | 'conditional'

export type DisplayState = 'active' | 'dimmed'

export interface NodeModel {
  id: string
  step: WorkflowStep
  kind: LayoutNodeKind
  col: number
  row: number
  displayState: DisplayState
  // Synthetic terminal anchor injected by the layout engine. Not present in
  // the persisted WorkflowStep JSON — purely a UI marker so column 0 always
  // reads "Start of workflow → … → End of workflow".
  terminal?: 'start' | 'end'
}

export type WireStyle = 'straight' | 'fork-right' | 'join-left' | 'back-edge'

export interface WireModel {
  id: string
  fromId: string
  toId: string
  style: WireStyle
  label?: string
}

export interface LayoutModel {
  columnCount: number
  rowCount: number
  nodes: NodeModel[]
  wires: WireModel[]
}

interface BuildState {
  nodes: NodeModel[]
  wires: WireModel[]
  pending: PendingJoin[]
}

interface PendingJoin {
  fromIds: string[]
  parentCol: number
  bottomRow: number
}

interface FrameResult {
  height: number
  firstId: string | null
  lastId: string | null
}

const EMPTY_FRAME: FrameResult = { height: 0, firstId: null, lastId: null }

function resolveKind(step: WorkflowStep): LayoutNodeKind {
  const k = (step.kind ?? 'directive') as string
  if (k === 'directive' || k === 'loop' || k === 'parallel' || k === 'conditional') return k
  return 'directive'
}

function nodeIdFor(step: WorkflowStep, fallback: string): string {
  return step.id && step.id.length > 0 ? step.id : fallback
}

// Deterministic wire IDs so the same logical edge keeps its identity across
// layout passes (e.g. when expandedIds toggles). The wire animation engine
// in WorkflowGraphWires looks up `animations.get(wire.id)` to interpolate
// from the current visual position to the new endpoints; a sequence-based
// id reshuffles every rebuild, so animations would snap instead of glide.
function wireId(fromId: string, toId: string, style: WireStyle, suffix?: string): string {
  return suffix
    ? `${style}:${fromId}->${toId}:${suffix}`
    : `${style}:${fromId}->${toId}`
}

export const WORKFLOW_START_ID = '__workflow_start__'
export const WORKFLOW_END_ID = '__workflow_end__'

export function buildLayout(steps: WorkflowStep[], expandedIds: ReadonlySet<string>): LayoutModel {
  const state: BuildState = { nodes: [], wires: [], pending: [] }

  // Always-present "Start of workflow" terminal at the top of column 0.
  state.nodes.push({
    id: WORKFLOW_START_ID,
    step: {},
    kind: 'directive',
    col: 0,
    row: 0,
    displayState: 'active',
    terminal: 'start',
  })

  // Real top-level steps occupy rows 1..(1+r.height-1) so the start terminal
  // can sit at row 0.
  const r = layoutInto(steps, 0, 1, expandedIds, state, 'r')

  // Always-present "End of workflow" terminal at the bottom of column 0,
  // immediately after the deepest real row consumed by the top-level pass.
  const endRow = 1 + r.height
  state.nodes.push({
    id: WORKFLOW_END_ID,
    step: {},
    kind: 'directive',
    col: 0,
    row: endRow,
    displayState: 'active',
    terminal: 'end',
  })

  // Wire the terminals into the spine. Straight wires only — terminals
  // share column 0 with the top-level real steps.
  if (r.firstId) {
    state.wires.push({ id: wireId(WORKFLOW_START_ID, r.firstId, 'straight'), fromId: WORKFLOW_START_ID, toId: r.firstId, style: 'straight' })
  }
  if (r.lastId) {
    state.wires.push({ id: wireId(r.lastId, WORKFLOW_END_ID, 'straight'), fromId: r.lastId, toId: WORKFLOW_END_ID, style: 'straight' })
  }
  else {
    // Empty workflow: connect Start directly to End so the spine still reads.
    state.wires.push({ id: wireId(WORKFLOW_START_ID, WORKFLOW_END_ID, 'straight'), fromId: WORKFLOW_START_ID, toId: WORKFLOW_END_ID, style: 'straight' })
  }

  // Resolve pending join-left wires. The target is the placed node sitting at
  // (parentCol, bottomRow) — i.e. the next sibling in the parent's column.
  // For a control-flow parent that is the last top-level step, this resolves
  // naturally to the End terminal sitting at (0, endRow).
  const placement = new Map<string, NodeModel>()
  for (const n of state.nodes) placement.set(`${n.col}:${n.row}`, n)

  for (const p of state.pending) {
    const target = placement.get(`${p.parentCol}:${p.bottomRow}`)
    if (!target) continue
    for (const fromId of p.fromIds) {
      state.wires.push({
        id: wireId(fromId, target.id, 'join-left'),
        fromId,
        toId: target.id,
        style: 'join-left',
      })
    }
  }

  const columnCount = state.nodes.reduce((m, n) => Math.max(m, n.col), 0) + 1
  const rowCount = state.nodes.reduce((m, n) => Math.max(m, n.row), 0) + 1
  return {
    columnCount,
    rowCount,
    nodes: state.nodes,
    wires: state.wires,
  }
}

function layoutInto(
  steps: WorkflowStep[],
  col: number,
  startRow: number,
  expandedIds: ReadonlySet<string>,
  state: BuildState,
  pathPrefix: string,
): FrameResult {
  let row = startRow
  let prevId: string | null = null
  let firstId: string | null = null
  let lastId: string | null = null

  steps.forEach((step, idx) => {
    const synthId = `${pathPrefix}/${idx}`
    const id = nodeIdFor(step, synthId)
    const kind = resolveKind(step)
    const childCount = step.children?.length ?? 0
    const expanded = childCount > 0 && expandedIds.has(id)
    // Only control-flow kinds dim themselves on expansion — their action
    // lives in their subnodes. A directive expanded inline (playwright
    // actions list inside the card) is still itself the active step.
    const dimsWhenExpanded = kind === 'loop' || kind === 'parallel' || kind === 'conditional'

    state.nodes.push({
      id,
      step,
      kind,
      col,
      row,
      displayState: expanded && dimsWhenExpanded ? 'dimmed' : 'active',
    })

    if (prevId) {
      state.wires.push({ id: wireId(prevId, id, 'straight'), fromId: prevId, toId: id, style: 'straight' })
    }

    let h = 0
    if (expanded) {
      h = expandSubtree(step, kind, id, col, row, expandedIds, state, synthId)
    }

    if (firstId === null) firstId = id
    lastId = id
    prevId = id
    row += 1 + h
  })

  return { height: row - startRow, firstId, lastId }
}

function expandSubtree(
  step: WorkflowStep,
  kind: LayoutNodeKind,
  parentId: string,
  parentCol: number,
  parentRow: number,
  expandedIds: ReadonlySet<string>,
  state: BuildState,
  pathPrefix: string,
): number {
  const children = step.children ?? []

  switch (kind) {
    case 'directive':
      // Directive children are playwright-level actions, rendered as an
      // expandable details list inside the parent card (see
      // WorkflowGraphNode). They are not separate graph nodes, so
      // expansion adds no rows / wires here.
      return 0

    case 'loop': {
      const mid = Math.ceil(children.length / 2)
      const left = children.slice(0, mid)
      const right = children.slice(mid)

      const leftR = layoutInto(left, parentCol + 1, parentRow + 1, expandedIds, state, `${pathPrefix}.l1`)
      const rightR: FrameResult = right.length
        ? layoutInto(right, parentCol + 2, parentRow + 1, expandedIds, state, `${pathPrefix}.l2`)
        : EMPTY_FRAME

      if (leftR.firstId) {
        state.wires.push({ id: wireId(parentId, leftR.firstId, 'fork-right'), fromId: parentId, toId: leftR.firstId, style: 'fork-right' })
      }
      if (leftR.lastId && rightR.firstId) {
        // Mid-hop: drawn as a smooth diagonal so the body still reads in
        // document order. Same wire style as fork-right; the renderer
        // distinguishes by source/target columns.
        state.wires.push({ id: wireId(leftR.lastId, rightR.firstId, 'fork-right', 'midhop'), fromId: leftR.lastId, toId: rightR.firstId, style: 'fork-right' })
      }

      const bodyLastId = rightR.lastId ?? leftR.lastId
      const bodyFirstId = leftR.firstId
      if (bodyLastId && bodyFirstId && bodyLastId !== bodyFirstId) {
        state.wires.push({
          id: wireId(bodyLastId, bodyFirstId, 'back-edge'),
          fromId: bodyLastId,
          toId: bodyFirstId,
          style: 'back-edge',
          label: step.condition,
        })
      }

      const h = Math.max(leftR.height, rightR.height)
      if (bodyLastId) {
        state.pending.push({
          fromIds: [bodyLastId],
          parentCol,
          bottomRow: parentRow + 1 + h,
        })
      }
      return h
    }

    case 'parallel':
    case 'conditional': {
      const branchResults: FrameResult[] = []
      let maxH = 0
      for (let i = 0; i < children.length; i++) {
        const branchCol = parentCol + 1 + i
        const tag = kind === 'conditional' ? 'c' : 'p'
        const r = layoutInto([children[i]], branchCol, parentRow + 1, expandedIds, state, `${pathPrefix}.${tag}${i}`)
        branchResults.push(r)
        if (r.firstId) {
          state.wires.push({
            id: wireId(parentId, r.firstId, 'fork-right'),
            fromId: parentId,
            toId: r.firstId,
            style: 'fork-right',
            label: kind === 'conditional' ? caseLabel(children[i], i) : undefined,
          })
        }
        if (r.height > maxH) maxH = r.height
      }
      const branchLasts = branchResults
        .map(r => r.lastId)
        .filter((x): x is string => !!x)
      if (branchLasts.length > 0) {
        state.pending.push({
          fromIds: branchLasts,
          parentCol,
          bottomRow: parentRow + 1 + maxH,
        })
      }
      return maxH
    }
  }
}

function caseLabel(step: WorkflowStep, idx: number): string {
  const trimmed = (step.annotation ?? step.description ?? '').trim()
  if (trimmed.length > 0) return trimmed.length > 28 ? `${trimmed.slice(0, 27)}…` : trimmed
  return `case ${idx + 1}`
}
