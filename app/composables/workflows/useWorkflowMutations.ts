import type { WorkflowGraph, WorkflowNode, WorkflowWire } from '~/composables/workflows/useWorkflows'

// Shared mutation ops for the workflow graph. User-driven drag-to-connect
// and orchestrator-driven granular tools both run through `applyOp`, so the
// rules (dangling-endpoint protection, lock enforcement) are enforced in
// exactly one place — and the TS implementation mirrors the Go one in
// `polymux/internal/workflow/mutations.go`.
export type WorkflowOp =
  | { kind: 'node_add', node: WorkflowNode }
  | { kind: 'node_edit', node_id: string, patch: Partial<WorkflowNode> }
  | { kind: 'node_remove', node_id: string }
  | { kind: 'wire_add', wire: WorkflowWire }
  | { kind: 'wire_edit', wire_id: string, patch: Partial<WorkflowWire> }
  | { kind: 'wire_remove', wire_id: string }

export interface ApplyResult {
  ok: true
  graph: WorkflowGraph
}

export interface ApplyError {
  ok: false
  error: string
}

function cloneGraph(g: WorkflowGraph): WorkflowGraph {
  return {
    nodes: g.nodes.map(n => ({ ...n })),
    wires: g.wires.map(w => ({ ...w })),
  }
}

function findNodeIndex(nodes: WorkflowNode[], id: string): number {
  return nodes.findIndex(n => n.id === id)
}

function findWireIndex(wires: WorkflowWire[], id: string): number {
  return wires.findIndex(w => w.id === id)
}

export function findNodeById(graph: WorkflowGraph, id: string): WorkflowNode | null {
  const idx = findNodeIndex(graph.nodes, id)
  return idx < 0 ? null : graph.nodes[idx]!
}

export function findWireById(graph: WorkflowGraph, id: string): WorkflowWire | null {
  const idx = findWireIndex(graph.wires, id)
  return idx < 0 ? null : graph.wires[idx]!
}

function newID(prefix: 'node' | 'wire'): string {
  // crypto.randomUUID is available in browsers + recent Node; fall back to
  // a coarser timestamp-based id when not present (e.g. very old runtimes).
  const uuid = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${uuid}`
}

export function applyOp(graph: WorkflowGraph, op: WorkflowOp): ApplyResult | ApplyError {
  const next = cloneGraph(graph)
  switch (op.kind) {
    case 'node_add': {
      const node: WorkflowNode = { ...op.node }
      if (!node.id || node.id.trim() === '') node.id = newID('node')
      if (findNodeIndex(next.nodes, node.id) >= 0) {
        return { ok: false, error: `duplicate node id: ${node.id}` }
      }
      next.nodes.push(node)
      // Surface the assigned id back to the caller via the op envelope so
      // subsequent wire_add ops can reference it without diffing the graph.
      op.node.id = node.id
      return { ok: true, graph: next }
    }
    case 'node_edit': {
      const idx = findNodeIndex(next.nodes, op.node_id)
      if (idx < 0) return { ok: false, error: `node not found: ${op.node_id}` }
      const cur = next.nodes[idx]!
      // Only non-empty patch fields overwrite; absent fields are preserved.
      const merged: WorkflowNode = { ...cur }
      for (const [k, v] of Object.entries(op.patch)) {
        if (v !== undefined && v !== '') {
          (merged as unknown as Record<string, unknown>)[k] = v
        }
      }
      next.nodes[idx] = merged
      return { ok: true, graph: next }
    }
    case 'node_remove': {
      const idx = findNodeIndex(next.nodes, op.node_id)
      if (idx < 0) return { ok: false, error: `node not found: ${op.node_id}` }
      const removed = next.nodes[idx]!
      next.nodes.splice(idx, 1)
      // Wires touching the removed node DON'T cascade-delete anymore —
      // the node and its wires are independent canvas objects. The
      // touching end becomes detached (empty id + floating pos) at the
      // side-centre / centre of where the node used to be, so the wire
      // visually stays put. A wire whose BOTH ends pointed at the
      // removed node is now a zero-length floating loop with nothing
      // to anchor it; drop those.
      const cx = (removed.position?.x ?? 0) + (removed.size?.w ?? 240) / 2
      const cy = (removed.position?.y ?? 0) + (removed.size?.h ?? 96) / 2
      const sideCentre = (side: string | undefined): { x: number; y: number } => {
        const x0 = removed.position?.x ?? 0
        const y0 = removed.position?.y ?? 0
        const w = removed.size?.w ?? 240
        const h = removed.size?.h ?? 96
        switch (side) {
          case 'left': return { x: x0, y: y0 + h / 2 }
          case 'right': return { x: x0 + w, y: y0 + h / 2 }
          case 'top': return { x: x0 + w / 2, y: y0 }
          case 'bottom': return { x: x0 + w / 2, y: y0 + h }
          default: return { x: cx, y: cy }
        }
      }
      const detached: WorkflowWire[] = []
      for (const w of next.wires) {
        const touchesFrom = w.from_id === op.node_id
        const touchesTo = w.to_id === op.node_id
        if (!touchesFrom && !touchesTo) {
          detached.push(w)
          continue
        }
        if (touchesFrom && touchesTo) continue
        const replaced: WorkflowWire = { ...w }
        if (touchesFrom) {
          replaced.from_id = ''
          replaced.from_pos = sideCentre(w.from_side)
        }
        if (touchesTo) {
          replaced.to_id = ''
          replaced.to_pos = sideCentre(w.to_side)
        }
        detached.push(replaced)
      }
      next.wires = detached
      return { ok: true, graph: next }
    }
    case 'wire_add': {
      const wire: WorkflowWire = { ...op.wire }
      // Each end must be ANCHORED (id refers to a node) or DETACHED
      // (id empty and *_pos carries a floating position). Both ends
      // can't be empty simultaneously — that's a wire that points
      // nowhere and would have no resting geometry.
      const fromAnchored = !!wire.from_id
      const toAnchored = !!wire.to_id
      const fromDetached = !fromAnchored && !!wire.from_pos
      const toDetached = !toAnchored && !!wire.to_pos
      if (!fromAnchored && !fromDetached) {
        return { ok: false, error: 'wire_add: from_id or from_pos is required' }
      }
      if (!toAnchored && !toDetached) {
        return { ok: false, error: 'wire_add: to_id or to_pos is required' }
      }
      if (fromAnchored && findNodeIndex(next.nodes, wire.from_id) < 0) {
        return { ok: false, error: `wire_add: from_id ${wire.from_id} does not match any node` }
      }
      if (toAnchored && findNodeIndex(next.nodes, wire.to_id) < 0) {
        return { ok: false, error: `wire_add: to_id ${wire.to_id} does not match any node` }
      }
      if (!wire.id || wire.id.trim() === '') wire.id = newID('wire')
      if (findWireIndex(next.wires, wire.id) >= 0) {
        return { ok: false, error: `duplicate wire id: ${wire.id}` }
      }
      next.wires.push(wire)
      op.wire.id = wire.id
      return { ok: true, graph: next }
    }
    case 'wire_edit': {
      const idx = findWireIndex(next.wires, op.wire_id)
      if (idx < 0) return { ok: false, error: `wire not found: ${op.wire_id}` }
      const cur = next.wires[idx]!
      // Endpoints are immutable on edit — rewire via remove + re-add.
      const patch = { ...op.patch }
      delete patch.from_id
      delete patch.to_id
      delete patch.id
      const merged: WorkflowWire = { ...cur }
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined && v !== '') {
          (merged as unknown as Record<string, unknown>)[k] = v
        }
      }
      next.wires[idx] = merged
      return { ok: true, graph: next }
    }
    case 'wire_remove': {
      const idx = findWireIndex(next.wires, op.wire_id)
      if (idx < 0) return { ok: false, error: `wire not found: ${op.wire_id}` }
      next.wires.splice(idx, 1)
      return { ok: true, graph: next }
    }
  }
}

// Every node/wire id the op reads or writes — used by the conflict guard so
// we can tell whether an incoming orchestrator patch overlaps with a node
// the user is currently editing.
export function idsTouchedByOp(op: WorkflowOp): string[] {
  switch (op.kind) {
    case 'node_add': return op.node.id ? [op.node.id] : []
    case 'node_edit': return [op.node_id]
    case 'node_remove': return [op.node_id]
    case 'wire_add': {
      const out: string[] = []
      if (op.wire.id) out.push(op.wire.id)
      if (op.wire.from_id) out.push(op.wire.from_id)
      if (op.wire.to_id) out.push(op.wire.to_id)
      return out
    }
    case 'wire_edit': return [op.wire_id]
    case 'wire_remove': return [op.wire_id]
  }
}

export function useWorkflowMutations() {
  return { applyOp, findNodeById, findWireById, idsTouchedByOp }
}
