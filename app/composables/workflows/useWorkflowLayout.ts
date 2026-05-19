import type { WorkflowGraph, WorkflowNode, WorkflowWire } from '~/composables/workflows/useWorkflows'

// Generic DAG layout for the graph model. Nodes are laid out in columns by
// longest forward path from the synthetic Start; back-wires (target column
// < source column) are rendered as curved arrows so cycles read naturally.
// Within each column nodes are ordered by insertion order so the graph
// stays deterministic across re-layouts.

export type DisplayState = 'active' | 'dimmed'

export interface NodeModel {
  id: string
  node: WorkflowNode
  col: number
  row: number
  displayState: DisplayState
  terminal?: 'start' | 'end'
}

export type WireStyle = 'forward' | 'back-wire'

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

// buildAdjacency returns a forward-only adjacency map. Wires with a
// non-zero max_iterations are treated as back-wires for layering purposes
// (they're allowed to cycle so they can't drive column assignment).
function buildAdjacency(wires: readonly WorkflowWire[]): Map<string, WorkflowWire[]> {
  const out = new Map<string, WorkflowWire[]>()
  for (const w of wires) {
    if (!out.has(w.from_id)) out.set(w.from_id, [])
    out.get(w.from_id)!.push(w)
  }
  return out
}

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

export function buildLayout(graph: WorkflowGraph): LayoutModel {
  const nodes: NodeModel[] = []
  const wires: WireModel[] = []

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

  // Real wires: forward or back-wire depending on layer direction.
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

  // Build the unused adjacency map only for completeness; not currently used
  // beyond layering. Kept as a hook for future styling decisions.
  void buildAdjacency(graph.wires)

  const columnCount = endCol + 1
  let rowCount = 1
  for (const n of nodes) if (n.row + 1 > rowCount) rowCount = n.row + 1
  return { columnCount, rowCount, nodes, wires }
}
