<script setup lang="ts">
import type { WorkflowStep, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'
import type { NodeModel, WireModel } from '~/composables/workflows/useWorkflowLayout'
import { buildLayout } from '~/composables/workflows/useWorkflowLayout'

const props = defineProps<{
  sessionId: string
}>()

const { t } = useI18n()
const toast = useAppToast()
const { sessions } = useWorkflowList()
const { currentWorkspace } = useWorkspaces()
const { workflows, fetchWorkflows, getWorkflow, startRun } = useWorkflows()

const workspaceId = computed(() => {
  const s = sessions.value.find(s => s.id === props.sessionId)
  return s?.workspace_id ?? currentWorkspace.value?.id ?? ''
})

const draftSteps = useState<WorkflowStep[]>(`workflow-draft-steps:${props.sessionId}`, () => [])
const selectedWorkflowKey = computed(() => `polymux_workflow_for_session_${props.sessionId}`)

const selectedWorkflowId = ref<string | null>(null)
const loadedSteps = ref<WorkflowStep[]>([])

async function loadSelected() {
  if (!workspaceId.value) return
  await fetchWorkflows(workspaceId.value)
  if (!import.meta.client) return
  const stored = localStorage.getItem(selectedWorkflowKey.value)
  let id: string | null = null
  if (stored && workflows.value.some(w => w.id === stored)) id = stored
  else id = workflows.value[0]?.id ?? null
  selectedWorkflowId.value = id
  if (!id) {
    loadedSteps.value = []
    return
  }
  const wf = await getWorkflow(workspaceId.value, id) as WorkflowWithLatest | null
  loadedSteps.value = (wf?.latest_version?.steps ?? []) as WorkflowStep[]
}

watch(workspaceId, () => { void loadSelected() }, { immediate: true })
// React to draft updates (orchestrator publishing) and saved-workflow ticks.
const lastSavedAt = useState<number>('workflow-last-saved-at', () => 0)
watch(lastSavedAt, () => { void loadSelected() })

const displayedSteps = computed<WorkflowStep[]>(() => {
  if (draftSteps.value.length > 0) return draftSteps.value
  return loadedSteps.value
})

// Auto-expand all nodes for layout — the canvas shows everything at once.
const expandedSet = computed(() => {
  const s = new Set<string>()
  const walk = (nodes: WorkflowStep[]) => {
    for (const n of nodes) {
      if (n.id) s.add(n.id)
      if (n.children) walk(n.children)
    }
  }
  walk(displayedSteps.value)
  return s
})

const layout = computed(() => buildLayout(displayedSteps.value, expandedSet.value))

// ── Node positions ──────────────────────────────────────────────────────────
// Default grid from buildLayout columns/rows; user drags overlay per-node deltas
// persisted to localStorage so the user's hand-arranged canvas survives reloads.
const NODE_W = 220
const NODE_H = 84
const COL_GAP = 90
const ROW_GAP = 50
const positionsKey = computed(() => `polymux_node_positions_${props.sessionId}_${selectedWorkflowId.value ?? 'draft'}`)

interface Pt { x: number; y: number }
const overrides = ref<Record<string, Pt>>({})

watch(positionsKey, (key) => {
  overrides.value = {}
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) overrides.value = JSON.parse(raw) as Record<string, Pt>
  }
  catch {}
}, { immediate: true })

function persistOverrides() {
  if (!import.meta.client) return
  try {
    localStorage.setItem(positionsKey.value, JSON.stringify(overrides.value))
  }
  catch {}
}

function defaultPos(node: NodeModel): Pt {
  return {
    x: 40 + node.col * (NODE_W + COL_GAP),
    y: 40 + node.row * (NODE_H + ROW_GAP),
  }
}

function nodePos(node: NodeModel): Pt {
  return overrides.value[node.id] ?? defaultPos(node)
}

const canvasBounds = computed(() => {
  let maxX = 800
  let maxY = 600
  for (const n of layout.value.nodes) {
    const p = nodePos(n)
    if (p.x + NODE_W + 80 > maxX) maxX = p.x + NODE_W + 80
    if (p.y + NODE_H + 80 > maxY) maxY = p.y + NODE_H + 80
  }
  return { width: maxX, height: maxY }
})

// ── Pan / zoom ──────────────────────────────────────────────────────────────
const scale = ref(1)
const offset = ref<Pt>({ x: 0, y: 0 })
const viewportEl = ref<HTMLElement | null>(null)

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const delta = -e.deltaY * 0.0015
  const newScale = Math.max(0.4, Math.min(2, scale.value * (1 + delta)))
  scale.value = newScale
}

let isPanning = false
let panStart = { x: 0, y: 0 }
let offsetStart = { x: 0, y: 0 }

function onCanvasPointerDown(e: PointerEvent) {
  // Pan with middle button or space-less right-area drag (background click).
  const target = e.target as HTMLElement
  if (target.closest('[data-node]')) return
  if (e.button !== 0 && e.button !== 1) return
  isPanning = true
  panStart = { x: e.clientX, y: e.clientY }
  offsetStart = { ...offset.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  // Background click clears selection.
  if (e.button === 0) selected.value = new Set()
}
function onCanvasPointerMove(e: PointerEvent) {
  if (!isPanning) return
  offset.value = {
    x: offsetStart.x + (e.clientX - panStart.x),
    y: offsetStart.y + (e.clientY - panStart.y),
  }
}
function onCanvasPointerUp(e: PointerEvent) {
  if (!isPanning) return
  isPanning = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function fitToView() {
  if (!viewportEl.value) return
  const rect = viewportEl.value.getBoundingClientRect()
  const pad = 60
  const w = canvasBounds.value.width
  const h = canvasBounds.value.height
  const sx = (rect.width - pad * 2) / w
  const sy = (rect.height - pad * 2) / h
  const s = Math.min(1, Math.max(0.4, Math.min(sx, sy)))
  scale.value = s
  offset.value = {
    x: (rect.width - w * s) / 2,
    y: (rect.height - h * s) / 2,
  }
}

onMounted(() => { nextTick(fitToView) })
watch(() => layout.value.nodes.length, () => { nextTick(fitToView) })

// ── Selection ───────────────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set())

function isSelected(id: string) { return selected.value.has(id) }

function selectNode(id: string, additive: boolean) {
  const next = new Set(additive ? selected.value : [])
  if (additive && next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

const selectionDetailNode = computed<NodeModel | null>(() => {
  if (selected.value.size !== 1) return null
  const id = [...selected.value][0]!
  return layout.value.nodes.find(n => n.id === id) ?? null
})

// ── Drag node ───────────────────────────────────────────────────────────────
let dragging: { startX: number; startY: number; ids: string[]; origins: Record<string, Pt> } | null = null

function onNodePointerDown(e: PointerEvent, node: NodeModel) {
  e.stopPropagation()
  if (node.terminal) return
  if (!selected.value.has(node.id)) {
    selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey)
  }
  else if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const next = new Set(selected.value)
    next.delete(node.id)
    selected.value = next
    return
  }
  const ids = selected.value.size > 1 ? [...selected.value] : [node.id]
  const origins: Record<string, Pt> = {}
  for (const id of ids) {
    const n = layout.value.nodes.find(x => x.id === id)
    if (n) origins[id] = nodePos(n)
  }
  dragging = { startX: e.clientX, startY: e.clientY, ids, origins }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onNodePointerMove(e: PointerEvent) {
  if (!dragging) return
  const dx = (e.clientX - dragging.startX) / scale.value
  const dy = (e.clientY - dragging.startY) / scale.value
  const next = { ...overrides.value }
  for (const id of dragging.ids) {
    const o = dragging.origins[id]
    if (!o) continue
    next[id] = { x: o.x + dx, y: o.y + dy }
  }
  overrides.value = next
}
function onNodePointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = null
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  persistOverrides()
}

// ── Wires ──────────────────────────────────────────────────────────────────
interface WireGeom { id: string; d: string }
const wireGeoms = computed<WireGeom[]>(() => {
  const out: WireGeom[] = []
  const nodeMap = new Map(layout.value.nodes.map(n => [n.id, n]))
  for (const w of layout.value.wires as WireModel[]) {
    const a = nodeMap.get(w.fromId)
    const b = nodeMap.get(w.toId)
    if (!a || !b) continue
    const pa = nodePos(a)
    const pb = nodePos(b)
    const x1 = pa.x + NODE_W
    const y1 = pa.y + NODE_H / 2
    const x2 = pb.x
    const y2 = pb.y + NODE_H / 2
    const cx = (x1 + x2) / 2
    out.push({ id: `${w.fromId}->${w.toId}`, d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` })
  }
  return out
})

// ── Actions ────────────────────────────────────────────────────────────────
function badgeClass(kind: string) {
  switch (kind) {
    case 'loop': return 'bg-amber-100 text-amber-800'
    case 'parallel': return 'bg-violet-100 text-violet-800'
    case 'sequence': return 'bg-emerald-100 text-emerald-800'
    case 'conditional': return 'bg-fuchsia-100 text-fuchsia-800'
    default: return 'bg-sky-100 text-sky-800'
  }
}

function nodeTitle(n: NodeModel) {
  const s = n.step
  if (n.terminal === 'start') return t('workflow.startNode')
  if (n.terminal === 'end') return t('workflow.endNode')
  if (s.description) return s.description
  if (s.action && s.target) return `${s.action} → ${s.target}`
  if (s.action) return s.action
  return t('workflow.untitledNode')
}

async function rerunSelected() {
  if (selected.value.size === 0) return
  if (!selectedWorkflowId.value) {
    toast.show(t('workflow.runFailedToast'), 'error', 3000)
    return
  }
  const id = [...selected.value][0]!
  const r = await startRun(workspaceId.value, selectedWorkflowId.value, {
    session_id: props.sessionId,
    resume_from_node_id: id,
  })
  if (!r) toast.show(t('workflow.runFailedToast'), 'error', 3000)
}

function deleteSelected() {
  if (selected.value.size === 0) return
  if (!window.confirm(t('workflow.confirmDelete'))) return
  // Delete local override entry; we don't mutate persisted workflow steps from
  // here — those edits live in WorkflowDock. This pruned set is purely visual
  // for the canvas session.
  const next = { ...overrides.value }
  for (const id of selected.value) delete next[id]
  overrides.value = next
  hidden.value = new Set([...hidden.value, ...selected.value])
  selected.value = new Set()
  persistOverrides()
}

const hidden = ref<Set<string>>(new Set())

const visibleNodes = computed(() => layout.value.nodes.filter(n => !hidden.value.has(n.id)))
const visibleWires = computed(() => wireGeoms.value.filter((w) => {
  const [from, to] = w.id.split('->')
  return !hidden.value.has(from!) && !hidden.value.has(to!)
}))
</script>

<template>
  <div class="relative flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-neutral-50">
    <!-- Top toolbar -->
    <div class="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
      <div class="flex items-center gap-2 pointer-events-auto rounded-xl bg-white/90 backdrop-blur-md border border-neutral-200 px-2.5 py-1.5 shadow-sm">
        <span class="text-caption font-semibold uppercase tracking-wider text-neutral-500">
          {{ t('chat.nodeView') }}
        </span>
        <span class="h-3.5 w-px bg-neutral-200" />
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-caption text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          @click="fitToView"
        >
          <UIcon name="i-heroicons-arrows-pointing-out-20-solid" class="size-3.5" />
          {{ t('workflow.fitToView') }}
        </button>
        <span class="h-3.5 w-px bg-neutral-200" />
        <span class="font-mono text-caption tabular-nums text-neutral-500">
          {{ Math.round(scale * 100) }}%
        </span>
      </div>
    </div>

    <!-- Canvas -->
    <div
      ref="viewportEl"
      class="relative h-full w-full select-none overflow-hidden"
      :class="isPanning ? 'cursor-grabbing' : 'cursor-grab'"
      :style="{
        backgroundImage: 'radial-gradient(circle, rgb(212 212 216 / 0.6) 1px, transparent 1px)',
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      }"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @wheel="onWheel"
    >
      <div
        v-if="layout.nodes.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2 text-center text-caption text-neutral-400">
          <UIcon name="i-heroicons-share-20-solid" class="size-8 text-neutral-300" />
          <p>{{ t('workflow.nodeCanvasEmpty') }}</p>
        </div>
      </div>

      <div
        class="absolute left-0 top-0 origin-top-left"
        :style="{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width: `${canvasBounds.width}px`,
          height: `${canvasBounds.height}px`,
        }"
      >
        <!-- Wires layer -->
        <svg
          class="pointer-events-none absolute inset-0"
          :width="canvasBounds.width"
          :height="canvasBounds.height"
        >
          <path
            v-for="w in visibleWires"
            :key="w.id"
            :d="w.d"
            fill="none"
            stroke="rgb(163 163 163)"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>

        <!-- Nodes -->
        <div
          v-for="node in visibleNodes"
          :key="node.id"
          data-node
          class="absolute rounded-xl border bg-white shadow-sm transition-shadow"
          :class="[
            isSelected(node.id) ? 'border-neutral-900 ring-2 ring-neutral-900/20' : 'border-neutral-200 hover:border-neutral-400',
            node.terminal ? 'cursor-default opacity-70' : 'cursor-grab active:cursor-grabbing',
          ]"
          :style="{
            left: `${nodePos(node).x}px`,
            top: `${nodePos(node).y}px`,
            width: `${NODE_W}px`,
            height: `${NODE_H}px`,
          }"
          @pointerdown="(e) => onNodePointerDown(e, node)"
          @pointermove="onNodePointerMove"
          @pointerup="onNodePointerUp"
        >
          <div class="flex h-full flex-col gap-1 px-3 py-2">
            <div class="flex items-center gap-1.5">
              <span
                v-if="!node.terminal"
                class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="badgeClass(node.kind)"
              >
                {{ node.kind }}
              </span>
              <span
                v-else
                class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500"
              >
                {{ node.terminal }}
              </span>
            </div>
            <div class="flex-1 truncate text-sm font-medium text-neutral-900">
              {{ nodeTitle(node) }}
            </div>
            <div
              v-if="!node.terminal && (node.step.target || node.step.value)"
              class="truncate text-[11px] text-neutral-500"
            >
              {{ node.step.target ?? node.step.value }}
            </div>
          </div>

          <!-- I/O ports — purely decorative anchors to read like n8n. -->
          <span
            v-if="!node.terminal"
            class="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-neutral-300 bg-white"
          />
          <span
            v-if="!node.terminal"
            class="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-neutral-300 bg-white"
          />
        </div>
      </div>
    </div>

    <!-- Right detail panel: rounded, inset from edges. -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-x-4 opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-4 opacity-0"
    >
      <aside
        v-if="selectionDetailNode"
        class="absolute right-3 top-3 bottom-3 z-40 flex w-[340px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      >
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <div class="min-w-0">
            <div class="truncate text-caption font-semibold uppercase tracking-wider text-neutral-500">
              {{ t('workflow.nodeDetails') }}
            </div>
            <div class="truncate pt-0.5 text-sm font-medium text-neutral-900">
              {{ nodeTitle(selectionDetailNode) }}
            </div>
          </div>
          <button
            type="button"
            class="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            :title="t('workflow.clearSelection')"
            @click="selected = new Set()"
          >
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <div class="space-y-3">
            <div>
              <div class="text-caption font-semibold uppercase tracking-wider text-neutral-400">
                {{ t('workflow.toolUse') }}
              </div>
              <div class="mt-1.5 space-y-1.5 text-sm">
                <div v-if="selectionDetailNode.step.action" class="flex gap-2">
                  <span class="w-20 shrink-0 text-caption text-neutral-500">action</span>
                  <span class="font-mono text-[12px] text-neutral-900">{{ selectionDetailNode.step.action }}</span>
                </div>
                <div v-if="selectionDetailNode.step.target" class="flex gap-2">
                  <span class="w-20 shrink-0 text-caption text-neutral-500">target</span>
                  <span class="break-all font-mono text-[12px] text-neutral-900">{{ selectionDetailNode.step.target }}</span>
                </div>
                <div v-if="selectionDetailNode.step.value" class="flex gap-2">
                  <span class="w-20 shrink-0 text-caption text-neutral-500">value</span>
                  <span class="break-all font-mono text-[12px] text-neutral-900">{{ selectionDetailNode.step.value }}</span>
                </div>
                <div v-if="selectionDetailNode.step.condition" class="flex gap-2">
                  <span class="w-20 shrink-0 text-caption text-neutral-500">condition</span>
                  <span class="break-all font-mono text-[12px] text-neutral-900">{{ selectionDetailNode.step.condition }}</span>
                </div>
                <div
                  v-if="!selectionDetailNode.step.action && !selectionDetailNode.step.target && !selectionDetailNode.step.value && !selectionDetailNode.step.condition"
                  class="text-caption text-neutral-400"
                >
                  {{ t('workflow.noToolUse') }}
                </div>
              </div>
            </div>

            <div v-if="(selectionDetailNode.step.children?.length ?? 0) > 0">
              <div class="text-caption font-semibold uppercase tracking-wider text-neutral-400">
                children · {{ selectionDetailNode.step.children!.length }}
              </div>
              <ul class="mt-1.5 space-y-1 text-[12px] text-neutral-700">
                <li
                  v-for="(child, idx) in selectionDetailNode.step.children"
                  :key="child.id ?? idx"
                  class="flex items-start gap-2 rounded border border-neutral-100 bg-neutral-50 px-2 py-1.5"
                >
                  <span class="mt-1 size-1 shrink-0 rounded-full bg-neutral-400" />
                  <span class="break-words">
                    {{ child.description || `${child.action ?? ''} ${child.target ?? ''}`.trim() || t('workflow.untitledNode') }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <footer class="flex shrink-0 items-center gap-1.5 border-t border-neutral-200 px-3 py-2">
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-caption font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!selectedWorkflowId"
            @click="rerunSelected"
          >
            <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
            {{ t('workflow.rerunFromHere') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-caption font-medium text-rose-600 transition-colors hover:bg-rose-50"
            @click="deleteSelected"
          >
            <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
            {{ t('workflow.deleteNode') }}
          </button>
        </footer>
      </aside>
    </Transition>

    <!-- Multi-select contextual action bar (mirrors FileBrowser ContextualActionBar). -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="selected.size > 1"
        class="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-neutral-200 bg-white/90 px-4 py-2.5 shadow-lg backdrop-blur-lg"
      >
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100">
          <UIcon name="i-heroicons-squares-plus-20-solid" class="size-4 text-neutral-700" />
        </div>
        <span class="text-sm font-medium text-neutral-950">
          {{ t('workflow.selectedCount', { n: selected.size }) }}
        </span>
        <div class="h-5 w-px bg-neutral-200" />
        <div class="flex items-center gap-1">
          <button
            class="flex size-7 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
            :title="t('workflow.rerunFromHere')"
            @click="rerunSelected"
          >
            <UIcon name="i-heroicons-play-20-solid" class="size-3.5" />
          </button>
          <button
            class="flex size-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            :title="t('workflow.deleteNode')"
            @click="deleteSelected"
          >
            <UIcon name="i-heroicons-trash-20-solid" class="size-3.5" />
          </button>
        </div>
        <button
          class="flex size-6 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          :title="t('workflow.clearSelection')"
          @click="selected = new Set()"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-3" />
        </button>
      </div>
    </Transition>
  </div>
</template>
