import type { WorkflowGraph, WorkflowNode, WorkflowWire, WireSide } from '~/composables/workflows/useWorkflows'
import {
  clampIntermediateColumns,
  computeAutoLayoutGeometry,
  type AutoLayoutGeometry,
} from '~/composables/workflows/workflowLayoutMetrics'

// Generic DAG layout for the graph model. Nodes are laid out in columns by
// longest forward path from the synthetic Start; back-wires (target column
// < source column) are rendered as curved arrows so cycles read naturally.
// Within each column nodes start in insertion order so the graph stays
// deterministic across re-layouts. Forward fan-outs are then nudged to keep
// parallel targets symmetric around their source.

export type DisplayState = 'active' | 'dimmed'

export interface NodeModel {
  id: string
  node: WorkflowNode
  col: number
  row: number
  displayState: DisplayState
  terminal?: 'start' | 'end'
}

// 'terminal' wires are the synthetic Start→entry / exit→End anchor connectors.
// They exist only in the layout (never in the saved graph, never seen by the
// executor) and render distinct + non-interactive so they read as anchors, not
// editable edges.
export type WireStyle = 'forward' | 'back-wire' | 'terminal'

export interface WireModel {
  id: string
  fromId: string
  toId: string
  style: WireStyle
  label?: string
  condition?: string
  maxIterations?: number
}

export interface LayoutModel {
  columnCount: number
  rowCount: number
  nodes: NodeModel[]
  wires: WireModel[]
}

export const WORKFLOW_START_ID = '__workflow_start__'
export const WORKFLOW_END_ID = '__workflow_end__'

type LayoutSide = WireSide

// assignLayers walks the graph from the entry set, treating capped wires
// (max_iterations > 0) as if they didn't exist for layering. The remaining
// graph is layered by longest forward path: each layer is the set of nodes
// whose forward-incoming wires have all already been placed. Cycles (where
// no zero-incoming node remains but the worklist still has entries) are
// broken by force-promoting the node with the fewest remaining incoming
// wires — that edge becomes effectively a back-wire for layout purposes,
// which is the same treatment that an explicit `max_iterations` wire gets.
function assignLayers(nodes: WorkflowNode[], wires: readonly WorkflowWire[]): Map<string, number> {
  const forwardWires = wires.filter(w => !(w.max_iterations && w.max_iterations > 0))

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const n of nodes) {
    incoming.set(n.id, 0)
    outgoing.set(n.id, [])
  }
  for (const w of forwardWires) {
    // Detached endpoints (either end's id is empty, persisted via
    // from_pos / to_pos instead) aren't part of the flow graph — they
    // can't contribute layering pressure. Skipping also avoids the
    // `outgoing.get("")` undefined-push crash that previously took out
    // the whole layout when a draw-wire-tool sketch was on the canvas.
    if (!w.from_id || !w.to_id) continue
    const outList = outgoing.get(w.from_id)
    if (!outList) continue
    incoming.set(w.to_id, (incoming.get(w.to_id) ?? 0) + 1)
    outList.push(w.to_id)
  }

  const layer = new Map<string, number>()
  const remaining = new Set(nodes.map(n => n.id))
  let currentLayer = 1

  while (remaining.size > 0) {
    // Nodes with all forward in-wires already placed are ready for the
    // current layer.
    let layerIds = [...remaining].filter(id => (incoming.get(id) ?? 0) === 0)

    if (layerIds.length === 0) {
      // Pure-cycle blockage: nothing has zero remaining incoming. Force
      // one node onto this layer to unblock — picking the one with the
      // fewest remaining incoming so we break the smallest cycle.
      let minInc = Infinity
      let pick: string | null = null
      for (const id of remaining) {
        const inc = incoming.get(id) ?? 0
        if (inc < minInc) {
          minInc = inc
          pick = id
        }
      }
      if (pick != null) layerIds = [pick]
      else break
    }

    for (const id of layerIds) {
      layer.set(id, currentLayer)
      remaining.delete(id)
      for (const t of outgoing.get(id) ?? []) {
        if (remaining.has(t)) incoming.set(t, (incoming.get(t) ?? 0) - 1)
      }
    }
    currentLayer++
  }

  // Defensive: anything still unlayered (shouldn't happen) gets layer 1 so
  // it still renders.
  for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, 1)
  return layer
}

function wireId(wire: WorkflowWire): string {
  return `wire:${wire.id}`
}

function sideFromLayout(from: NodeModel, to: NodeModel): LayoutSide | null {
  if (to.col > from.col) return 'right'
  if (to.col < from.col) return 'left'
  if (to.row > from.row) return 'bottom'
  if (to.row < from.row) return 'top'
  return null
}

function centeredOffset(index: number, count: number): number {
  return index - (count - 1) / 2
}

function preferFanoutSymmetry(
  placement: Map<string, NodeModel>,
  wires: readonly WorkflowWire[],
  nodeOrder: Map<string, number>,
) {
  const forwardIncoming = new Map<string, number>()
  for (const w of wires) {
    if (!w.from_id || !w.to_id) continue
    if ((w.max_iterations ?? 0) > 0) continue
    if (!placement.has(w.from_id) || !placement.has(w.to_id)) continue
    forwardIncoming.set(w.to_id, (forwardIncoming.get(w.to_id) ?? 0) + 1)
  }

  const groups = new Map<string, Map<LayoutSide, NodeModel[]>>()
  const seen = new Set<string>()
  for (const w of wires) {
    if (!w.from_id || !w.to_id) continue
    if ((w.max_iterations ?? 0) > 0) continue
    if ((forwardIncoming.get(w.to_id) ?? 0) > 1) continue
    const from = placement.get(w.from_id)
    const to = placement.get(w.to_id)
    if (!from || !to || from.id === to.id) continue
    const side = sideFromLayout(from, to)
    if (!side) continue
    const key = `${from.id}:${side}:${to.id}`
    if (seen.has(key)) continue
    seen.add(key)
    let bySide = groups.get(from.id)
    if (!bySide) {
      bySide = new Map<LayoutSide, NodeModel[]>()
      groups.set(from.id, bySide)
    }
    const list = bySide.get(side) ?? []
    list.push(to)
    bySide.set(side, list)
  }

  const sourceIds = [...groups.keys()].sort((a, b) => {
    const sourceA = placement.get(a)
    const sourceB = placement.get(b)
    if (!sourceA || !sourceB) return (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0)
    if (sourceA.col !== sourceB.col) return sourceA.col - sourceB.col
    if (sourceA.row !== sourceB.row) return sourceA.row - sourceB.row
    return (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0)
  })

  for (const sourceId of sourceIds) {
    const bySide = groups.get(sourceId)
    const source = placement.get(sourceId)
    if (!source || !bySide) continue
    for (const [side, targets] of bySide) {
      if (targets.length < 2) continue
      const horizontal = side === 'left' || side === 'right'
      targets.sort((a, b) => {
        const axisDelta = horizontal ? a.row - b.row : a.col - b.col
        if (axisDelta !== 0) return axisDelta
        return (nodeOrder.get(a.id) ?? 0) - (nodeOrder.get(b.id) ?? 0)
      })
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]!
        const offset = centeredOffset(i, targets.length)
        if (horizontal) target.row = source.row + offset
        else target.col = source.col + offset
      }
    }
  }
}

export function buildLayout(graph: WorkflowGraph): LayoutModel {
  const nodes: NodeModel[] = []
  const wires: WireModel[] = []
  const nodeOrder = new Map<string, number>(graph.nodes.map((n, i) => [n.id, i] as [string, number]))

  // Layer real nodes by longest forward path. Layer 0 is the Start
  // terminal; real nodes start at layer 1; End sits at the deepest layer + 1.
  const layer = assignLayers(graph.nodes, graph.wires)
  const byLayer = new Map<number, WorkflowNode[]>()
  for (const n of graph.nodes) {
    const l = layer.get(n.id)!
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(n)
  }

  // Place the Start terminal at (0, 0).
  nodes.push({
    id: WORKFLOW_START_ID,
    node: { id: WORKFLOW_START_ID },
    col: 0,
    row: 0,
    displayState: 'active',
    terminal: 'start',
  })

  // Compute the maximum layer for End placement.
  let maxLayer = 0
  for (const l of byLayer.keys()) if (l > maxLayer) maxLayer = l

  // Place real nodes column-by-column. Within a column, row is insertion
  // order from graph.nodes (stable, deterministic).
  const placement = new Map<string, NodeModel>()
  const layerOrder = [...byLayer.keys()].sort((a, b) => a - b)
  for (const l of layerOrder) {
    const layerNodes = byLayer.get(l) ?? []
    for (let i = 0; i < layerNodes.length; i++) {
      const n = layerNodes[i]!
      const model: NodeModel = {
        id: n.id,
        node: n,
        col: l,
        row: i,
        displayState: 'active',
      }
      nodes.push(model)
      placement.set(n.id, model)
    }
  }

  preferFanoutSymmetry(placement, graph.wires, nodeOrder)

  // Fan-out symmetry can spread targets into Start/End columns; pull real
  // nodes back onto the interior columns so they stay between the terminals.
  clampIntermediateColumns(nodes, maxLayer)

  // Place End terminal one column past the deepest real layer.
  const endCol = Math.max(maxLayer + 1, 1)
  nodes.push({
    id: WORKFLOW_END_ID,
    node: { id: WORKFLOW_END_ID },
    col: endCol,
    row: 0,
    displayState: 'active',
    terminal: 'end',
  })

  // No spine / auto-inferred wires. Start + End are pure visual anchors
  // — execution doesn't need an edge to either — and silently inserting
  // Start→entry connections behind the user's back made it look like
  // creating one wire created two. Connectivity warnings surface at
  // save time as a toast instead (see `connectivityWarnings`).

  // Real wires (including explicit Start/End anchor wires): forward or
  // back-wire depending on layer direction.
  for (const w of graph.wires) {
    const from = placement.get(w.from_id)
    const to = placement.get(w.to_id)
    const isBackWire = (w.max_iterations ?? 0) > 0 || (from && to && to.col <= from.col)
    wires.push({
      id: wireId(w),
      fromId: w.from_id,
      toId: w.to_id,
      style: isBackWire ? 'back-wire' : 'forward',
      label: w.label,
      condition: w.condition,
      maxIterations: w.max_iterations,
    })
  }

  // No auto-spine: Start and End connect ONLY where the user has drawn an
  // explicit anchor wire (from_id === WORKFLOW_START_ID / to_id ===
  // WORKFLOW_END_ID). Those live in graph.wires and are rendered by the loop
  // above like any other wire, so a node only attaches to Start/End when the
  // user wires it — which is what lets the executor run only what flows from
  // Start.

  const columnCount = endCol + 1
  let rowCount = 1
  for (const n of nodes) if (n.row + 1 > rowCount) rowCount = Math.ceil(n.row + 1)
  return { columnCount, rowCount, nodes, wires }
}

/** Topological layout plus content-sized boxes, overlap separation, and
 *  horizontal-between-terminal enforcement. Used by the Auto Layout button. */
export function buildAutoLayoutGeometry(graph: WorkflowGraph): AutoLayoutGeometry[] {
  const layout = buildLayout(graph)
  return computeAutoLayoutGeometry(layout.nodes)
}
