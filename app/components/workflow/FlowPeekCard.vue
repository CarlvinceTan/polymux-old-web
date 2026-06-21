<script setup lang="ts">
import type { Ref } from 'vue'
import type { ChatFlowPeek } from '~/composables/types'
import { buildLayout, WORKFLOW_START_ID, WORKFLOW_END_ID } from '~/composables/workflows/useWorkflowLayout'

// FlowPeekCard is the inline chat preview the orchestrator surfaces (via the
// ShowWorkflow tool) after building or editing a workflow graph — the
// replacement for an ASCII sketch. It spans the full message-column width, shows
// a non-interactive peek of the graph on the canvas' dotted backdrop, and on
// click switches the page to the Flow (node) view. The SVG rendering mirrors
// MiniWorkflowCanvas so the peek reads identically to the real canvas, but sized
// responsively (width 100%) instead of the fixed thumbnail dimensions.
type ViewMode = 'chat' | 'viewport' | 'flow'

const props = defineProps<{ peek: ChatFlowPeek }>()

const { t } = useI18n()

// Provided by pages/workflow/[id].vue. Mutating it switches the active view.
const viewMode = inject<Ref<ViewMode>>('chat-view-mode')
const chatTitle = inject<Ref<string>>('chat-title')

const displayTitle = computed(() => {
  const tt = chatTitle?.value?.trim()
  return tt && tt !== 'New Workflow' ? tt : t('workflow.peekTitle')
})

// Node count is the user's authored nodes (the synthetic start/end terminals
// the layout adds are not in graph.nodes).
const nodeCount = computed(() => props.peek.graph.nodes.length)

// Widest fan-out — surfaced only when the graph actually branches in parallel.
const parallelBranches = computed(() => {
  const out = new Map<string, number>()
  for (const w of props.peek.graph.wires) {
    if (!w.from_id) continue
    out.set(w.from_id, (out.get(w.from_id) ?? 0) + 1)
  }
  let max = 0
  for (const n of out.values()) if (n > max) max = n
  return max
})

const meta = computed(() => {
  const parts = [t('workflow.peekNodeCount', { n: nodeCount.value })]
  if (parallelBranches.value >= 2) parts.push(t('workflow.peekParallel', { n: parallelBranches.value }))
  return parts.join(' · ')
})

const DEFAULT_W = 160
const DEFAULT_H = 60
const MAX_NODES = 40

const projection = computed(() => {
  const layout = buildLayout(props.peek.graph)
  const rendered = layout.nodes.slice(0, MAX_NODES)
  const colW = 200
  const rowH = 90
  const nodes = rendered.map((n) => {
    const x = n.node.position?.x ?? n.col * colW
    const y = n.node.position?.y ?? n.row * rowH
    const w = n.node.size?.w ?? DEFAULT_W
    const h = n.node.size?.h ?? DEFAULT_H
    return {
      id: n.id,
      x,
      y,
      w,
      h,
      title: n.node.title ?? (n.terminal === 'start' ? 'Start' : n.terminal === 'end' ? 'End' : '·'),
      isTerminal: Boolean(n.terminal),
      isEmbed: typeof n.node.workflow_ref === 'string' && n.node.workflow_ref.trim() !== '',
    }
  })
  const map = new Map(nodes.map(n => [n.id, n]))
  const wires: { id: string, x1: number, y1: number, x2: number, y2: number, isBack: boolean }[] = []
  for (const w of layout.wires) {
    const a = map.get(w.fromId)
    const b = map.get(w.toId)
    if (!a || !b) continue
    // Skip the synthetic terminal connectors — they only anchor the layout.
    if (a.id === WORKFLOW_START_ID || b.id === WORKFLOW_END_ID) continue
    wires.push({
      id: w.id,
      x1: a.x + a.w / 2,
      y1: a.y + a.h / 2,
      x2: b.x + b.w / 2,
      y2: b.y + b.h / 2,
      isBack: w.style === 'back-wire',
    })
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x + n.w > maxX) maxX = n.x + n.w
    if (n.y + n.h > maxY) maxY = n.y + n.h
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100
  }
  const PAD = 24
  return {
    nodes,
    wires,
    bbox: { x: minX - PAD, y: minY - PAD, w: (maxX - minX) + PAD * 2, h: (maxY - minY) + PAD * 2 },
  }
})

function openFlow() {
  if (viewMode) viewMode.value = 'flow'
}
</script>

<template>
  <button
    type="button"
    data-testid="flow-peek-card"
    :aria-label="t('workflow.peekAlt')"
    class="group my-2 block w-full overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm ring-1 ring-neutral-950/5 transition hover:border-neutral-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    @click="openFlow"
  >
    <!-- Graph peek on the canvas' dotted backdrop -->
    <div class="flow-peek-canvas h-[188px] w-full">
      <svg
        :viewBox="`${projection.bbox.x} ${projection.bbox.y} ${projection.bbox.w} ${projection.bbox.h}`"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        class="block size-full"
        style="pointer-events: none"
        role="img"
        :aria-label="t('workflow.peekAlt')"
      >
        <line
          v-for="w in projection.wires"
          :key="w.id"
          :x1="w.x1"
          :y1="w.y1"
          :x2="w.x2"
          :y2="w.y2"
          :stroke="w.isBack ? 'var(--color-loop-wire)' : 'rgb(163 163 163)'"
          :stroke-width="w.isBack ? 1.5 : 1.2"
          :stroke-dasharray="w.isBack ? '4 3' : undefined"
          stroke-linecap="round"
        />
        <g v-for="n in projection.nodes" :key="n.id">
          <rect
            :x="n.x"
            :y="n.y"
            :width="n.w"
            :height="n.h"
            rx="7"
            ry="7"
            :fill="n.isTerminal ? 'rgb(229 229 229)' : 'white'"
            :stroke="n.isEmbed ? 'var(--color-embed-border)' : 'rgb(189 189 189)'"
            stroke-width="1"
          />
          <foreignObject
            :x="n.x + 6"
            :y="n.y + 6"
            :width="Math.max(20, n.w - 12)"
            :height="Math.max(20, n.h - 12)"
          >
            <div class="flex h-full items-center justify-center overflow-hidden text-center">
              <span
                class="line-clamp-2 text-[10px] font-medium leading-tight text-neutral-700"
                :style="n.isEmbed ? { color: 'var(--color-embed-border)' } : undefined"
              >{{ n.title }}</span>
            </div>
          </foreignObject>
        </g>
      </svg>
    </div>

    <!-- Meta bar -->
    <div class="flex items-center gap-2 border-t border-neutral-200 px-3.5 py-2.5">
      <svg class="size-[15px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1.4" />
        <rect x="15" y="15" width="6" height="6" rx="1.4" />
        <rect x="15" y="3" width="6" height="6" rx="1.4" />
        <path d="M9 6h3a2 2 0 0 1 2 2M6 9v3a2 2 0 0 0 2 2h4" />
      </svg>
      <span class="truncate text-[13px] font-semibold text-neutral-900">{{ displayTitle }}</span>
      <span class="shrink-0 text-xs text-neutral-500">· {{ meta }}</span>
      <span class="flex-1" />
      <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 transition-colors group-hover:text-neutral-900">
        {{ t('workflow.peekOpenFlow') }}
        <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
    </div>
  </button>
</template>

<style scoped>
.flow-peek-canvas {
  background-color: var(--color-neutral-50);
  background-image: radial-gradient(var(--color-neutral-300) 1px, transparent 1px);
  background-size: 16px 16px;
  background-position: -1px -1px;
}
</style>
