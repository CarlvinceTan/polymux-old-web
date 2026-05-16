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
// graph is a DAG, so we can layer by longest forward path. Nodes with no
// forward in-wire become entry candidates at layer 1 (layer 0 is reserved
// for the synthetic Start terminal).
function assignLayers(nodes: WorkflowNode[], wires: readonly WorkflowWire[]): Map<string, number> {
  const forwardWires = wires.filter(w => !(w.max_iterations && w.max_iterations > 0))
  const incoming = new Map<string, number>()
  for (const n of nodes) incoming.set(n.id, 0)
  for (const w of forwardWires) incoming.set(w.to_id, (incoming.get(w.to_id) ?? 0) + 1)

  const layer = new Map<string, number>()
  const queue: string[] = []
  for (const n of nodes) {
    if ((incoming.get(n.id) ?? 0) === 0) {
      layer.set(n.id, 1)
      queue.push(n.id)
    }
  }
  // Topological BFS — every time a node is dequeued its outgoing forward
  // wires lower their target's pending-incoming count; once that count hits
  // zero, the target's layer is the max(parent.layer + 1).
  const outgoing = new Map<string, WorkflowWire[]>()
  for (const w of forwardWires) {
    if (!outgoing.has(w.from_id)) outgoing.set(w.from_id, [])
    outgoing.get(w.from_id)!.push(w)
  }
  const pending = new Map(incoming)
  while (queue.length > 0) {
    const id = queue.shift()!
    const myLayer = layer.get(id)!
    for (const w of outgoing.get(id) ?? []) {
      const cur = layer.get(w.to_id) ?? 1
      if (myLayer + 1 > cur) layer.set(w.to_id, myLayer + 1)
      const left = (pending.get(w.to_id) ?? 0) - 1
      pending.set(w.to_id, left)
      if (left <= 0) queue.push(w.to_id)
    }
  }
  // Any node not visited (only reachable via back-wires) keeps its default
  // layer of 1 so it still renders.
  for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, 1)
  return layer
}

function wireId(wire: WorkflowWire): string {
  return `wire:${wire.id}`
}

function spineWireId(fromId: string, toId: string): string {
  return `spine:${fromId}->${toId}`
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

  // Spine wires: Start → first-column entries (nodes with no forward incoming
  // wires); last-column exits (nodes with no forward outgoing wires) → End.
  // Track which real nodes have forward incoming / outgoing wires so spine
  // wires don't double-up where real wires already exist.
  //
  // Fully isolated nodes (no real wires of any kind) DON'T get spine wires —
  // a freshly placed node should sit free until the user wires it. The user
  // explicitly opts in by drawing a wire from a port.
  const hasForwardIn = new Set<string>()
  const hasForwardOut = new Set<string>()
  const hasAnyWire = new Set<string>()
  for (const w of graph.wires) {
    hasAnyWire.add(w.from_id)
    hasAnyWire.add(w.to_id)
    if (w.max_iterations && w.max_iterations > 0) continue
    hasForwardIn.add(w.to_id)
    hasForwardOut.add(w.from_id)
  }
  for (const n of graph.nodes) {
    if (!hasAnyWire.has(n.id)) continue
    if (!hasForwardIn.has(n.id)) {
      wires.push({
        id: spineWireId(WORKFLOW_START_ID, n.id),
        fromId: WORKFLOW_START_ID,
        toId: n.id,
        style: 'forward',
      })
    }
    if (!hasForwardOut.has(n.id)) {
      wires.push({
        id: spineWireId(n.id, WORKFLOW_END_ID),
        fromId: n.id,
        toId: WORKFLOW_END_ID,
        style: 'forward',
      })
    }
  }
  // Empty graph: connect Start directly to End so the spine reads.
  if (graph.nodes.length === 0) {
    wires.push({
      id: spineWireId(WORKFLOW_START_ID, WORKFLOW_END_ID),
      fromId: WORKFLOW_START_ID,
      toId: WORKFLOW_END_ID,
      style: 'forward',
    })
  }

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
