import type { WorkflowNode } from '~/composables/workflows/useWorkflows'
import type { NodeModel } from '~/composables/workflows/useWorkflowLayout'

const WORKFLOW_START_ID = '__workflow_start__'
const WORKFLOW_END_ID = '__workflow_end__'

// Canvas layout metrics — keep aligned with WorkflowNodeCanvas.vue.
export const SNAP_GRID = 24
export const NODE_W = 240
export const NODE_H = 96
export const TERMINAL_W = 96
export const TERMINAL_H = 48
export const COL_GAP = 120
export const ROW_GAP = 96
export const LAYOUT_ORIGIN = 48
export const NODE_MIN_W = 140
export const NODE_MIN_H = 60
export const NODE_MAX_W = 520
export const NODE_MAX_H = 260
export const NODE_TEXT_PAD_X = 24
export const LAYOUT_NODE_GAP = 8

const SIZE_SNAP = SNAP_GRID * 2
const AVG_CHAR_WIDTH = 8.5
const ITERATIONS_BADGE_H = 24

export interface LayoutSize {
  w: number
  h: number
}

export interface LayoutRect extends LayoutSize {
  id: string
  x: number
  y: number
  terminal?: 'start' | 'end'
}

function snapSize(value: number): number {
  return Math.round(value / SIZE_SNAP) * SIZE_SNAP
}

function displayTitle(node: WorkflowNode, terminal?: NodeModel['terminal']): string {
  if (terminal === 'start') return 'Start'
  if (terminal === 'end') return 'End'
  if (node.title) return node.title
  if (node.actions && node.actions.length > 0 && node.actions[0]) return node.actions[0]
  return node.id || 'Untitled'
}

/** Content-based node box estimate (no DOM measurement). */
export function estimateNodeSize(node: WorkflowNode, terminal?: NodeModel['terminal']): LayoutSize {
  if (terminal === 'start' || terminal === 'end') {
    return { w: TERMINAL_W, h: TERMINAL_H }
  }

  const title = displayTitle(node, terminal)
  const textW = title.length * AVG_CHAR_WIDTH + NODE_TEXT_PAD_X
  let w = NODE_W
  if (textW > NODE_W) {
    w = snapSize(textW)
    w = Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, w))
    w = snapSize(w)
  }

  let h = NODE_H
  if ((node.iterations ?? 0) > 1) {
    h = Math.min(NODE_MAX_H, snapSize(NODE_H + ITERATIONS_BADGE_H))
    h = snapSize(h)
  }

  return { w, h }
}

export function cellCenter(col: number, row: number): { x: number, y: number } {
  return {
    x: LAYOUT_ORIGIN + col * (NODE_W + COL_GAP) + NODE_W / 2,
    y: LAYOUT_ORIGIN + row * (NODE_H + ROW_GAP) + NODE_H / 2,
  }
}

export function positionFromCell(col: number, row: number, size: LayoutSize): { x: number, y: number } {
  const center = cellCenter(col, row)
  return {
    x: center.x - size.w / 2,
    y: center.y - size.h / 2,
  }
}

/** Keep real nodes on columns strictly between Start (0) and End (maxLayer + 1). */
export function clampIntermediateColumns(nodes: NodeModel[], maxLayer: number) {
  for (const n of nodes) {
    if (n.terminal) continue
    if (n.col < 1) n.col = 1
    if (n.col > maxLayer) n.col = maxLayer
  }
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = LAYOUT_NODE_GAP): boolean {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y
}

function separateRects(a: LayoutRect, b: LayoutRect, gap = LAYOUT_NODE_GAP): boolean {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (overlapX <= 0 || overlapY <= 0) return false

  if (overlapX < overlapY) {
    const push = overlapX + gap
    if (a.x + a.w / 2 <= b.x + b.w / 2) {
      a.x -= push / 2
      b.x += push / 2
    }
    else {
      a.x += push / 2
      b.x -= push / 2
    }
  }
  else {
    const push = overlapY + gap
    if (a.y + a.h / 2 <= b.y + b.h / 2) {
      a.y -= push / 2
      b.y += push / 2
    }
    else {
      a.y += push / 2
      b.y -= push / 2
    }
  }
  return true
}

/** Iteratively separate overlapping node boxes. */
export function resolveLayoutOverlaps(rects: LayoutRect[], maxPasses = 64): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!
        const b = rects[j]!
        if (rectsOverlap(a, b) && separateRects(a, b)) moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Intermediate nodes must sit horizontally between Start and End (strict
 * centerline ordering on the left-to-right flow axis).
 */
export function enforceIntermediateHorizontalBetween(
  rects: LayoutRect[],
  startId = WORKFLOW_START_ID,
  endId = WORKFLOW_END_ID,
): void {
  const start = rects.find(r => r.id === startId)
  const end = rects.find(r => r.id === endId)
  if (!start || !end) return

  const minCenterX = start.x + start.w / 2
  const maxCenterX = end.x + end.w / 2
  if (maxCenterX <= minCenterX) return

  const epsilon = 0.5
  for (const r of rects) {
    if (r.terminal) continue
    const cx = r.x + r.w / 2
    const lo = minCenterX + epsilon
    const hi = maxCenterX - epsilon
    if (hi <= lo) continue
    const clamped = Math.min(hi, Math.max(lo, cx))
    if (Math.abs(clamped - cx) > 0.01) {
      r.x += clamped - cx
    }
  }
}

export interface AutoLayoutGeometry {
  id: string
  position: { x: number, y: number }
  size: LayoutSize
  terminal?: NodeModel['terminal']
}

export function computeAutoLayoutGeometry(models: NodeModel[]): AutoLayoutGeometry[] {
  const rects: LayoutRect[] = models.map((m) => {
    const size = estimateNodeSize(m.node, m.terminal)
    const position = positionFromCell(m.col, m.row, size)
    return {
      id: m.id,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      terminal: m.terminal,
    }
  })

  resolveLayoutOverlaps(rects)
  enforceIntermediateHorizontalBetween(rects)
  resolveLayoutOverlaps(rects)

  return rects.map(r => ({
    id: r.id,
    position: { x: r.x, y: r.y },
    size: { w: r.w, h: r.h },
    terminal: r.terminal,
  }))
}
