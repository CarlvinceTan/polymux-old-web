<script setup lang="ts">
import type { WireModel, WireStyle } from '~/composables/workflows/useWorkflowLayout'

interface DotFrame {
  x: number
  y: number
  radius: number
}
interface CardFrame {
  left: number
  right: number
  top: number
  bottom: number
}

const props = defineProps<{
  wires: WireModel[]
  dotFrames: Map<string, DotFrame>
  cardFrames: Map<string, CardFrame>
  rowGapHalf: number
}>()

// Wires anchor at each dot's top / bottom edge (radius offset from center)
// so the visible segment touches the dot exactly at its boundary, never
// inside it. Coordinates are derived from the parent's reactive frame
// state, so they recompute synchronously whenever a card resizes, a row
// shifts, or the container moves — no DOM measurement or rAF debounce.

interface Point { x: number; y: number }

// `stroke-linecap="round"` paints a semicircular cap at each path endpoint
// extending half a stroke-width outward (and inward, for the start cap).
// Pulling the anchor outward by that amount lets the cap fill exactly to
// the dot's outer edge instead of crossing into the dot.
const STROKE_HALF = 0.75

function dotAnchor(nodeId: string, side: 'top' | 'bottom'): Point | null {
  const f = props.dotFrames.get(nodeId)
  if (!f) return null
  const offset = f.radius + STROKE_HALF
  return { x: f.x, y: side === 'top' ? f.y - offset : f.y + offset }
}

function rowGapY(nodeId: string): number | null {
  const f = props.cardFrames.get(nodeId)
  if (!f) return null
  return f.bottom + props.rowGapHalf
}

function rowGapAboveY(nodeId: string): number | null {
  const f = props.cardFrames.get(nodeId)
  if (!f) return null
  return f.top - props.rowGapHalf
}

const FALLBACK_STEP_Y = 22
const BACK_OFFSET = 64

function pathPoints(wire: WireModel): Point[] | null {
  const sBottom = dotAnchor(wire.fromId, 'bottom')
  const tTop = dotAnchor(wire.toId, 'top')
  if (!sBottom || !tTop) return null

  switch (wire.style) {
    case 'straight':
      return [sBottom, tTop]

    case 'fork-right':
    case 'join-left': {
      const measured = rowGapY(wire.fromId)
      const turnY = measured ?? sBottom.y + FALLBACK_STEP_Y
      return [
        sBottom,
        { x: sBottom.x, y: turnY },
        { x: tTop.x, y: turnY },
        tTop,
      ]
    }

    case 'back-edge': {
      const rightX = Math.max(sBottom.x, tTop.x) + BACK_OFFSET
      const downY = rowGapY(wire.fromId) ?? sBottom.y + FALLBACK_STEP_Y
      const upY = rowGapAboveY(wire.toId) ?? tTop.y - FALLBACK_STEP_Y
      return [
        sBottom,
        { x: sBottom.x, y: downY },
        { x: rightX, y: downY },
        { x: rightX, y: upY },
        { x: tTop.x, y: upY },
        tTop,
      ]
    }
  }
}

function buildPath(points: Point[], radius = 10): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    const inDx = Math.sign(curr.x - prev.x)
    const inDy = Math.sign(curr.y - prev.y)
    const outDx = Math.sign(next.x - curr.x)
    const outDy = Math.sign(next.y - curr.y)
    const inLen = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y)
    const outLen = Math.abs(next.x - curr.x) + Math.abs(next.y - curr.y)
    const r = Math.max(0, Math.min(radius, inLen / 2, outLen / 2))
    if (r === 0) {
      d += ` L ${curr.x} ${curr.y}`
      continue
    }
    const startX = curr.x - inDx * r
    const startY = curr.y - inDy * r
    const endX = curr.x + outDx * r
    const endY = curr.y + outDy * r
    d += ` L ${startX} ${startY}`
    d += ` Q ${curr.x} ${curr.y} ${endX} ${endY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function midpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length % 2 === 1) return points[(points.length - 1) / 2]
  const a = points[points.length / 2 - 1]
  const b = points[points.length / 2]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

interface Resolved {
  id: string
  d: string
  style: WireStyle
  label?: string
  labelX?: number
  labelY?: number
}

// Wires are pure-reactive again: every frame, the ResizeObserver in
// `WorkflowGraph` updates `cardHeights` from the actively-transitioning
// card. That triggers `rowOrigins → dotFrames → cardFrames → resolved`
// in the same Vue render cycle as the dots' new positions. There is no
// separate JS easing here — the card's CSS `grid-template-rows`
// transition is the single timeline, and everything else follows it.
const resolved = computed<Resolved[]>(() => {
  const out: Resolved[] = []
  for (const wire of props.wires) {
    const points = pathPoints(wire)
    if (!points) continue
    const d = buildPath(points)
    const mid = midpoint(points)
    out.push({
      id: wire.id,
      d,
      style: wire.style,
      label: wire.label,
      labelX: wire.label ? mid.x : undefined,
      labelY: wire.label ? mid.y - 4 : undefined,
    })
  }
  return out
})
</script>

<template>
  <svg
    class="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-neutral-300"
    aria-hidden="true"
  >
    <defs>
      <marker
        id="wire-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
      </marker>
    </defs>

    <path
      v-for="w in resolved"
      :key="w.id"
      :d="w.d"
      stroke="currentColor"
      stroke-width="1.5"
      fill="none"
      stroke-linejoin="round"
      stroke-linecap="round"
      :stroke-dasharray="w.style === 'back-edge' ? '4 3' : undefined"
      :marker-end="w.style === 'back-edge' ? 'url(#wire-arrow)' : undefined"
    />

    <text
      v-for="w in resolved.filter(x => x.label)"
      :key="`label-${w.id}`"
      :x="w.labelX"
      :y="w.labelY"
      class="fill-neutral-400 text-[10px]"
      text-anchor="middle"
    >
      {{ w.label }}
    </text>
  </svg>
</template>
