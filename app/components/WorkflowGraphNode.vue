<script setup lang="ts">
import type { WorkflowStep, WorkflowNodeState } from '~/composables/useWorkflows'
import type { NodeModel } from '~/composables/useWorkflowLayout'

const props = defineProps<{
  node: NodeModel
  state?: WorkflowNodeState | null
  isCurrent: boolean
  isExpanded: boolean
  isEditing: boolean
  hasChildren: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  update: [id: string, patch: Partial<WorkflowStep>]
  delete: [id: string]
  rerunFrom: [id: string]
  toggleExpand: [id: string]
  beginEdit: [id: string | null]
}>()

const { t } = useI18n()

const step = computed(() => props.node.step)
const kind = computed(() => props.node.kind)
const id = computed(() => props.node.id)

const dimmed = computed(() => props.node.displayState === 'dimmed')

const terminal = computed(() => props.node.terminal ?? null)
const terminalLabel = computed(() => {
  if (terminal.value === 'start') return t('workflow.startNode')
  if (terminal.value === 'end') return t('workflow.endNode')
  return ''
})

const title = computed(() => {
  if (kind.value === 'loop') return t('workflow.loop')
  if (kind.value === 'parallel') return t('workflow.parallel')
  if (kind.value === 'conditional') return step.value.description || t('workflow.untitledNode')
  if (step.value.description) return step.value.description
  if (step.value.action && step.value.target) return `${step.value.action} → ${step.value.target}`
  if (step.value.action) return step.value.action
  return t('workflow.untitledNode')
})

const subtitle = computed(() => {
  if (kind.value === 'loop') return step.value.condition ?? ''
  if (kind.value === 'parallel') return (step.value.shared_context_keys ?? []).join(', ')
  if (step.value.action && step.value.target && step.value.description) {
    return `${step.value.action} · ${step.value.target}`
  }
  if (step.value.value) return step.value.value
  return ''
})

// Directives expand IN-PLACE: their children are low-level playwright
// actions, surfaced as a scrollable list inside the card. Control-flow
// kinds (loop/parallel/conditional) expand as graph subnodes instead.
const showInlineDetails = computed(() =>
  kind.value === 'directive' && props.hasChildren && props.isExpanded,
)

function humanizeChild(child: WorkflowStep): string {
  if (child.description && child.description.trim().length > 0) return child.description
  const action = child.action ?? ''
  const target = child.target ?? ''
  const value = child.value ?? ''
  if (action && target && value) return `${action} ${target} = ${value}`
  if (action && target) return `${action} ${target}`
  if (action) return action
  return t('workflow.untitledNode')
}

const editDraft = ref<WorkflowStep>({ ...props.node.step })

watch(() => props.node.step, (next) => {
  editDraft.value = { ...next }
})

function commitEdit() {
  emit('update', id.value, {
    action: editDraft.value.action,
    target: editDraft.value.target,
    value: editDraft.value.value,
    description: editDraft.value.description,
    condition: editDraft.value.condition,
    annotation: editDraft.value.annotation,
  })
  emit('beginEdit', null)
}

function cancelEdit() {
  editDraft.value = { ...props.node.step }
  emit('beginEdit', null)
}

function onDoubleClick() {
  if (props.readonly) return
  emit('beginEdit', id.value)
}

// Toggle expansion when the user clicks anywhere on the card. The chevron
// affordance was removed at the user's request — the card itself is the
// hit target. Clicks that originate from interactive children (action
// buttons, edit-form inputs) are skipped via a `closest()` check so they
// don't fire both their own handler and the toggle.
function onCardClick(event: MouseEvent) {
  if (!props.hasChildren) return
  if (props.isEditing) return
  const target = event.target as HTMLElement | null
  if (target?.closest('button, input, textarea, select, label, a')) return
  emit('toggleExpand', id.value)
}

// Card refs are read by the wire engine to find each row's bottom edge so
// horizontal wire hops are routed through the row gap (where no card lives),
// avoiding visible overlap with card backgrounds.
const cardRefs = inject<Map<string, HTMLElement> | null>('graph-card-refs', null)
const cardEl = ref<HTMLElement | null>(null)
onMounted(() => {
  if (cardEl.value && cardRefs) cardRefs.set(id.value, cardEl.value)
})
onBeforeUnmount(() => {
  if (cardRefs) cardRefs.delete(id.value)
})
watch(id, (next, prev) => {
  if (!cardRefs || !cardEl.value) return
  if (prev) cardRefs.delete(prev)
  cardRefs.set(next, cardEl.value)
})
</script>

<template>
  <!--
    Synthetic terminal markers (start / end of workflow) get a minimal
    label, no card chrome, no actions, no expansion. They're injected by
    the layout engine (see useWorkflowLayout) and never persisted.
  -->
  <div
    v-if="terminal"
    class="text-xs font-medium uppercase tracking-wide text-neutral-500"
  >
    {{ terminalLabel }}
  </div>

  <div
    v-else
    ref="cardEl"
    class="group relative min-w-0 rounded-md border bg-white px-3 py-2 shadow-sm transition-opacity"
    :class="[
      dimmed
        ? 'border-neutral-200/80 bg-neutral-50/70 opacity-60'
        : 'border-neutral-200',
      hasChildren && !isEditing ? 'cursor-pointer hover:border-neutral-300' : '',
    ]"
    @click="onCardClick"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span
            v-if="kind !== 'directive'"
            class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="kind === 'loop'
              ? 'bg-amber-100 text-amber-800'
              : kind === 'parallel'
                ? 'bg-violet-100 text-violet-800'
                : 'bg-sky-100 text-sky-800'"
          >
            {{ kind }}
          </span>
          <span
            v-if="kind === 'loop' && state?.iteration"
            class="text-[10px] font-medium text-neutral-400"
          >
            #{{ state.iteration }}
          </span>
        </div>

        <div
          v-if="!isEditing"
          class="cursor-text truncate pt-1 text-sm font-medium text-neutral-900"
          @dblclick="onDoubleClick"
        >
          {{ title }}
        </div>
        <div
          v-if="!isEditing && subtitle"
          class="truncate pt-0.5 text-xs text-neutral-500"
        >
          {{ subtitle }}
        </div>

        <div v-else-if="isEditing" class="mt-1.5 flex flex-col gap-1.5">
          <template v-if="kind === 'directive'">
            <input
              v-model="editDraft.action"
              class="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
              :placeholder="t('workflow.actionPlaceholder')"
            >
            <input
              v-model="editDraft.target"
              class="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
              :placeholder="t('workflow.targetPlaceholder')"
            >
            <input
              v-model="editDraft.value"
              class="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
              :placeholder="t('workflow.valuePlaceholder')"
            >
            <input
              v-model="editDraft.description"
              class="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
              :placeholder="t('workflow.descriptionPlaceholder')"
            >
          </template>
          <template v-else-if="kind === 'loop'">
            <input
              v-model="editDraft.condition"
              class="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
              :placeholder="t('workflow.conditionPlaceholder')"
            >
          </template>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="rounded bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-800"
              @click="commitEdit"
            >
              {{ t('workflow.save') }}
            </button>
            <button
              type="button"
              class="rounded border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
              @click="cancelEdit"
            >
              {{ t('workflow.cancel') }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!readonly && !isEditing"
        class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        @click.stop
      >
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded hover:bg-neutral-100"
          :title="t('workflow.rerunFromHere')"
          @click="emit('rerunFrom', id)"
        >
          <UIcon name="i-heroicons-play-20-solid" class="size-3.5 text-neutral-500" />
        </button>
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded hover:bg-rose-50"
          :title="t('workflow.deleteNode')"
          @click="emit('delete', id)"
        >
          <UIcon name="i-heroicons-trash-20-solid" class="size-3.5 text-rose-500" />
        </button>
      </div>
    </div>

    <!--
      Inline details panel (directive only). Always rendered, but its
      grid row collapses to 0fr when hidden and animates to 1fr when
      shown. The grid trick gives a smooth height transition with
      content-driven sizing that pure max-height can't deliver.
      ResizeObserver fires on every animation frame as the card grows/
      shrinks, which propagates `cardHeights` → `rowOrigins` →
      `dotFrames` synchronously, so dots and wires track the card
      smoothly without a separate animation loop.
    -->
    <div
      class="grid transition-[grid-template-rows] duration-500 ease-out"
      :class="hasChildren && kind === 'directive' ? (isExpanded ? 'mt-2 grid-rows-[1fr] border-t border-neutral-100 pt-2' : 'grid-rows-[0fr]') : 'grid-rows-[0fr]'"
      @click.stop
    >
      <div class="overflow-hidden">
        <ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-neutral-600">
          <li
            v-for="(child, idx) in step.children ?? []"
            :key="child.id ?? idx"
            class="flex items-start gap-2"
          >
            <span class="mt-1 size-1 shrink-0 rounded-full bg-neutral-300" />
            <span class="break-words">{{ humanizeChild(child) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
