<script setup lang="ts">
import type { WorkflowStep, WorkflowNodeState } from '~/composables/workflows/useWorkflows'
import type { LayoutModel, NodeModel } from '~/composables/workflows/useWorkflowLayout'
import { buildLayout } from '~/composables/workflows/useWorkflowLayout'

const props = defineProps<{
  steps: WorkflowStep[]
  expandedIds: Record<string, boolean>
  nodeStates: Record<string, WorkflowNodeState>
  currentPath: string[]
  readonly?: boolean
  editingId: string | null
  // Drives the End-of-workflow dot's fill: only filled once the active run
  // reaches the 'succeeded' state. Other run states leave it hollow so
  // "completed" reads visually distinct from "started" or "failed".
  runStatus?: string | null
}>()

const emit = defineEmits<{
  update: [id: string, patch: Partial<WorkflowStep>]
  delete: [id: string]
  rerunFrom: [id: string]
  toggleExpand: [id: string]
  beginEdit: [id: string | null]
}>()

const expandedSet = computed(() => {
  const s = new Set<string>()
  for (const [k, v] of Object.entries(props.expandedIds)) {
    if (v) s.add(k)
  }
  return s
})

const layout = computed<LayoutModel>(() =>
  buildLayout(props.steps, expandedSet.value),
)

// Wires read dot positions from this map. Cards register themselves in the
// `cardRefs` map below so the wire engine can also use card bottom edges to
// route horizontal segments through row gaps.
const nodeRefs = new Map<string, HTMLElement>()
const cardRefs = new Map<string, HTMLElement>()
provide('graph-node-refs', nodeRefs)
provide('graph-card-refs', cardRefs)

// Layout constants. Lanes (vertical columns) carry only dots — cards float on
// top of the graph as absolute overlays, anchored to each dot at a fixed
// horizontal gap and vertically centred on the dot.
const LANE_WIDTH = 48          // px between adjacent dot columns
const CARD_GAP = 22            // px from dot center to card left edge
const ROW_GAP = 28             // px of vertical spacing between rows
const PADDING_X = 16
const PADDING_Y = 16
const DEFAULT_CARD_HEIGHT = 56 // fallback before a card is measured

// Per-card measured height. Updated via a single ResizeObserver covering
// every card element in `cardRefs`.
const cardHeights = ref<Map<string, number>>(new Map())

function ensureHeight(id: string, h: number) {
  const existing = cardHeights.value.get(id)
  if (existing !== undefined && Math.abs(existing - h) < 0.5) return
  const next = new Map(cardHeights.value)
  next.set(id, h)
  cardHeights.value = next
}

// Per-row maximum card height. Rows are sized to the tallest card so cards
// never visually overlap each other vertically.
const rowHeights = computed(() => {
  const heights = new Map<number, number>()
  for (const node of layout.value.nodes) {
    const h = cardHeights.value.get(node.id) ?? DEFAULT_CARD_HEIGHT
    const cur = heights.get(node.row) ?? 0
    if (h > cur) heights.set(node.row, h)
  }
  return heights
})

const rowOrigins = computed(() => {
  const ys = new Map<number, number>()
  let y = PADDING_Y
  for (let r = 0; r < layout.value.rowCount; r++) {
    ys.set(r, y)
    const rh = rowHeights.value.get(r) ?? DEFAULT_CARD_HEIGHT
    y += rh + ROW_GAP
  }
  // Total height = last row's bottom (no trailing ROW_GAP) + bottom padding.
  const total = layout.value.rowCount > 0 ? y - ROW_GAP + PADDING_Y : 0
  return { ys, totalHeight: total }
})

function dotCenter(node: NodeModel): { x: number; y: number } {
  const x = PADDING_X + node.col * LANE_WIDTH + LANE_WIDTH / 2
  const yTop = rowOrigins.value.ys.get(node.row) ?? 0
  const rh = rowHeights.value.get(node.row) ?? DEFAULT_CARD_HEIGHT
  return { x, y: yTop + rh / 2 }
}

// Reactive frames for every node — wires read these directly so endpoints
// recompute synchronously with any layout change (card expansion, row
// shift, container resize). No DOM measurement, no rAF debounce.
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
const DOT_RADIUS_SINGLE = 6
const DOT_RADIUS_MULTI = 7
const ROW_GAP_HALF = ROW_GAP / 2

const dotFrames = computed<Map<string, DotFrame>>(() => {
  const m = new Map<string, DotFrame>()
  for (const node of layout.value.nodes) {
    const c = dotCenter(node)
    m.set(node.id, {
      x: c.x,
      y: c.y,
      radius: isMultiDot(node) ? DOT_RADIUS_MULTI : DOT_RADIUS_SINGLE,
    })
  }
  return m
})

const cardFrames = computed<Map<string, CardFrame>>(() => {
  const m = new Map<string, CardFrame>()
  for (const node of layout.value.nodes) {
    if (node.terminal) continue
    const c = dotCenter(node)
    const h = cardHeights.value.get(node.id) ?? DEFAULT_CARD_HEIGHT
    const left = c.x + CARD_GAP
    m.set(node.id, {
      left,
      right: left + CARD_WIDTH,
      top: c.y - h / 2,
      bottom: c.y + h / 2,
    })
  }
  return m
})

const totalWidth = computed(() => {
  // Width must accommodate the last column's lane center plus the
  // overlay card's width. Dot center is at PADDING_X + col*LANE + LANE/2.
  // Card extends CARD_GAP + CARD_WIDTH to the right. Add right padding so
  // cards never clip against the container's right edge.
  const lanes = Math.max(layout.value.columnCount, 1)
  const lastDotX = PADDING_X + (lanes - 1) * LANE_WIDTH + LANE_WIDTH / 2
  return lastDotX + CARD_GAP + CARD_WIDTH + PADDING_X
})

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

function statusOf(node: NodeModel): Status {
  const state = props.nodeStates[node.id]
  const fromState = state?.status as Status | undefined
  if (fromState) return fromState
  const path = props.currentPath
  if (path.length > 0 && path[path.length - 1] === node.id) return 'running'
  return 'pending'
}

function dotClass(node: NodeModel): string {
  // `transition-colors` (not `transition-all`) — we want status colour
  // changes to animate, but `top`/`left` must update instantly so the dot
  // stays locked in step with the wires (which can't CSS-transition path
  // shape). Same restriction applies to the multi-dot rings below.
  const base = 'absolute block size-3 rounded-full border-2 transition-colors'
  // Start anchor is always filled — the workflow's beginning is fixed.
  if (node.terminal === 'start') return `${base} bg-neutral-900 border-neutral-900`
  // End anchor stays hollow until the active run reaches 'succeeded'.
  // Any other state (idle, running, failed, cancelled) leaves it as an
  // outline so a finished workflow reads visually distinct from a
  // workflow that merely *has* an end.
  if (node.terminal === 'end') {
    return props.runStatus === 'succeeded'
      ? `${base} bg-neutral-900 border-neutral-900`
      : `${base} bg-white border-neutral-400`
  }
  switch (statusOf(node)) {
    case 'succeeded':
      return `${base} bg-emerald-500 border-emerald-500`
    case 'running':
      return `${base} border-blue-500 bg-blue-500/50 animate-pulse`
    case 'failed':
      return `${base} border-rose-500 bg-rose-100`
    case 'skipped':
      return `${base} border-neutral-300 bg-neutral-100`
    default:
      return `${base} border-neutral-300 bg-white`
  }
}

// Multi-dot styling: nodes that have child detail (any kind) render as a
// small outer ring with an inner status circle. The outer circumference
// only carries a color hint; only the inner circle is filled per status,
// so "running" pulses inside the ring and "pending" leaves a hollow dot.
function isMultiDot(node: NodeModel): boolean {
  return (node.step.children?.length ?? 0) > 0
}

function multiOuterClass(node: NodeModel): string {
  const base = 'absolute flex size-3.5 items-center justify-center rounded-full border-2 bg-white transition-colors'
  switch (statusOf(node)) {
    case 'succeeded':
      return `${base} border-emerald-500`
    case 'running':
      return `${base} border-blue-500`
    case 'failed':
      return `${base} border-rose-500`
    case 'skipped':
      return `${base} border-neutral-300`
    default:
      return `${base} border-neutral-300`
  }
}

function multiInnerClass(node: NodeModel): string {
  const base = 'block size-1.5 rounded-full transition-colors'
  switch (statusOf(node)) {
    case 'succeeded':
      return `${base} bg-emerald-500`
    case 'running':
      return `${base} bg-blue-500/60 animate-pulse`
    case 'failed':
      return `${base} bg-rose-300`
    case 'skipped':
      return `${base} bg-neutral-200`
    default:
      return `${base} bg-transparent`
  }
}

// Position is updated reactively every frame as ResizeObserver propagates
// card height changes through `cardHeights → rowOrigins → dotCenter`.
// No CSS transition on `top/left` — the per-frame Vue updates already
// drive the animation, and adding a CSS ease on top would lag behind the
// card's own transition.
function dotStyle(node: NodeModel) {
  const c = dotCenter(node)
  return {
    left: `${c.x}px`,
    top: `${c.y}px`,
    transform: 'translate(-50%, -50%)',
    opacity: node.displayState === 'dimmed' ? 0.6 : 1,
    transition: 'background-color 200ms ease-out, border-color 200ms ease-out, opacity 200ms ease-out',
  } satisfies Record<string, string | number>
}

const CARD_WIDTH = 340

function cardStyle(node: NodeModel) {
  const c = dotCenter(node)
  return {
    position: 'absolute',
    left: `${c.x + CARD_GAP}px`,
    top: `${c.y}px`,
    transform: 'translateY(-50%)',
    width: `${CARD_WIDTH}px`,
  } satisfies Record<string, string>
}

function registerDot(id: string, el: Element | ComponentPublicInstance | null) {
  if (!el) {
    nodeRefs.delete(id)
    return
  }
  if (el instanceof HTMLElement) {
    nodeRefs.set(id, el)
  }
}

const childCountFor = (id: string) => {
  const node = layout.value.nodes.find(n => n.id === id)
  return node?.step.children?.length ?? 0
}

const containerEl = ref<HTMLElement | null>(null)

// One ResizeObserver covers every card. We observe new cards on each layout
// change (after `cardRefs` has been populated by the v-for mount cycle) and
// stop observing cards that have been removed. The observer's callback is
// the only place that writes to `cardHeights`.
let cardObserver: ResizeObserver | null = null
const observedCards = new Set<HTMLElement>()

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  cardObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement
      const id = elToId(el)
      if (!id) continue
      ensureHeight(id, entry.contentRect.height)
    }
  })
})

onBeforeUnmount(() => {
  cardObserver?.disconnect()
  cardObserver = null
  observedCards.clear()
})

function elToId(el: HTMLElement): string | null {
  for (const [id, e] of cardRefs.entries()) {
    if (e === el) return id
  }
  return null
}

// After cards mount/unmount, sync the observer's set of targets and seed
// initial heights for newly-observed cards (the ResizeObserver will fire its
// own initial entry, but seeding avoids a one-frame collapsed render).
watch(
  () => layout.value.nodes,
  () => {
    nextTick(() => {
      if (!cardObserver) return
      const live = new Set<HTMLElement>()
      for (const [id, el] of cardRefs.entries()) {
        live.add(el)
        if (!observedCards.has(el)) {
          cardObserver.observe(el)
          observedCards.add(el)
          ensureHeight(id, el.getBoundingClientRect().height)
        }
      }
      for (const el of observedCards) {
        if (!live.has(el)) {
          cardObserver.unobserve(el)
          observedCards.delete(el)
        }
      }
    })
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div class="w-full overflow-x-auto">
    <div
      ref="containerEl"
      class="relative mx-auto"
      :style="{
        width: `${totalWidth}px`,
        height: `${rowOrigins.totalHeight}px`,
      }"
    >
      <!--
        Wires render first in DOM order so dots and cards paint *over* the
        wire ends. Combined with the stroke-cap inset in WorkflowGraphWires,
        this guarantees no visible overlap between a wire and a dot, even
        with sub-pixel rendering quirks.
      -->
      <WorkflowGraphWires
        :wires="layout.wires"
        :dot-frames="dotFrames"
        :card-frames="cardFrames"
        :row-gap-half="ROW_GAP_HALF"
      />

      <template v-for="node in layout.nodes" :key="`d-${node.id}`">
        <span
          v-if="isMultiDot(node)"
          :ref="(el) => registerDot(node.id, el as Element | ComponentPublicInstance | null)"
          :class="multiOuterClass(node)"
          :style="dotStyle(node)"
        >
          <span :class="multiInnerClass(node)" />
        </span>
        <span
          v-else
          :ref="(el) => registerDot(node.id, el as Element | ComponentPublicInstance | null)"
          :class="dotClass(node)"
          :style="dotStyle(node)"
        />
      </template>

      <WorkflowGraphNode
        v-for="node in layout.nodes"
        :key="`c-${node.id}`"
        :node="node"
        :state="nodeStates[node.id]"
        :is-current="currentPath.length > 0 && currentPath[currentPath.length - 1] === node.id"
        :is-expanded="!!expandedIds[node.id]"
        :is-editing="editingId === node.id"
        :has-children="childCountFor(node.id) > 0"
        :readonly="readonly"
        :style="cardStyle(node)"
        @update="(id, patch) => emit('update', id, patch)"
        @delete="(id) => emit('delete', id)"
        @rerun-from="(id) => emit('rerunFrom', id)"
        @toggle-expand="(id) => emit('toggleExpand', id)"
        @begin-edit="(id) => emit('beginEdit', id)"
      />
    </div>
  </div>
</template>
