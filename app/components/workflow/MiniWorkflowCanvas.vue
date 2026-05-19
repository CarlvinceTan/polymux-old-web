<script setup lang="ts">
import type { WorkflowGraph } from '~/composables/workflows/useWorkflows'
import { buildLayout, WORKFLOW_START_ID, WORKFLOW_END_ID } from '~/composables/workflows/useWorkflowLayout'

// MiniWorkflowCanvas renders a non-interactive thumbnail of a workflow
// graph for use inside the InfoPanel of an embed node. Reuses
// `buildLayout` so node positions match what the main canvas would
// render, then projects the result through preserveAspectRatio so the
// thumbnail fits the panel's fixed dimensions regardless of graph size.
//
// No interaction, no animation, no port spawning — pointer events are
// disabled at the root. Recursive embeds inside the thumbnail render as
// a small chip rather than recursing again (which would risk infinite
// loops if the user has a chain of embeds open).
const props = withDefaults(defineProps<{
  graph: WorkflowGraph
  width?: number
  height?: number
  maxNodes?: number
}>(), {
  width: 316,
  height: 220,
  maxNodes: 30,
})

const { t } = useI18n()

interface ProjectedNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  title: string
  isTerminal: boolean
  isEmbed: boolean
}

interface ProjectedWire {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  isBack: boolean
}

interface Projection {
  nodes: ProjectedNode[]
  wires: ProjectedWire[]
  bbox: { x: number, y: number, w: number, h: number }
  truncated: number
}

const DEFAULT_W = 160
const DEFAULT_H = 60

const projection = computed<Projection>(() => {
  const layout = buildLayout(props.graph)
  // Cap rendered nodes so a 200-node graph doesn't kill the SVG.
  const allNodes = layout.nodes
  const renderedNodes = allNodes.slice(0, props.maxNodes)
  const truncated = Math.max(0, allNodes.length - renderedNodes.length)

  const colW = 200
  const rowH = 90
  const nodes: ProjectedNode[] = renderedNodes.map((n) => {
    const persistedPos = n.node.position
    const persistedSize = n.node.size
    const x = persistedPos?.x ?? (n.col * colW)
    const y = persistedPos?.y ?? (n.row * rowH)
    const w = persistedSize?.w ?? DEFAULT_W
    const h = persistedSize?.h ?? DEFAULT_H
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

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const wires: ProjectedWire[] = []
  for (const w of layout.wires) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    if (!a || !b) continue
    if (a.id === WORKFLOW_START_ID || b.id === WORKFLOW_END_ID) {
      // Skip synthetic terminal wires — they exist only to anchor the
      // layout and would render as visually noisy connectors.
      continue
    }
    wires.push({
      id: w.id,
      x1: a.x + a.w / 2,
      y1: a.y + a.h / 2,
      x2: b.x + b.w / 2,
      y2: b.y + b.h / 2,
      isBack: w.style === 'back-wire',
    })
  }

  // Compute bbox with padding.
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
  const PAD = 16
  return {
    nodes,
    wires,
    bbox: {
      x: minX - PAD,
      y: minY - PAD,
      w: (maxX - minX) + PAD * 2,
      h: (maxY - minY) + PAD * 2,
    },
    truncated,
  }
})
</script>

<template>
  <div class="relative">
    <svg
      :viewBox="`${projection.bbox.x} ${projection.bbox.y} ${projection.bbox.w} ${projection.bbox.h}`"
      :width="props.width"
      :height="props.height"
      preserveAspectRatio="xMidYMid meet"
      class="rounded-lg border border-neutral-200 bg-neutral-50"
      style="pointer-events: none"
      role="img"
      :aria-label="t('workflow.embedThumbnailAlt')"
    >
      <g v-for="w in projection.wires" :key="w.id">
        <line
          :x1="w.x1"
          :y1="w.y1"
          :x2="w.x2"
          :y2="w.y2"
          :stroke="w.isBack ? 'var(--color-loop-wire)' : 'rgb(163 163 163)'"
          :stroke-width="w.isBack ? 1.5 : 1"
          :stroke-dasharray="w.isBack ? '4 3' : undefined"
          stroke-linecap="round"
        />
      </g>
      <g v-for="n in projection.nodes" :key="n.id">
        <rect
          :x="n.x"
          :y="n.y"
          :width="n.w"
          :height="n.h"
          rx="6"
          ry="6"
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
    <div
      v-if="projection.truncated > 0"
      class="mt-1 text-[11px] text-neutral-400"
    >
      {{ t('workflow.embedThumbnailTruncated', { n: projection.truncated }) }}
    </div>
  </div>
</template>
