<script setup lang="ts">
import type { WorkflowStep, WorkflowNodeState } from '~/composables/useWorkflows'

const props = defineProps<{
  step: WorkflowStep
  depth: number
  states: Record<string, WorkflowNodeState>
  currentPath: string[]
  readonly?: boolean
  editingId: string | null
  expandedIds: Record<string, boolean>
  ancestorPath: string[]
}>()

const emit = defineEmits<{
  update: [id: string, patch: Partial<WorkflowStep>]
  delete: [id: string]
  rerunFrom: [id: string]
  toggleExpand: [id: string]
  beginEdit: [id: string | null]
}>()

const { t } = useI18n()

const kind = computed(() => props.step.kind ?? 'directive')
const id = computed(() => props.step.id ?? '')
const state = computed(() => props.states[id.value])
const pathInclusive = computed(() => [...props.ancestorPath, id.value])
const isCurrent = computed(() =>
  props.currentPath.length > 0 && props.currentPath[props.currentPath.length - 1] === id.value,
)
const status = computed(() => {
  if (state.value?.status) return state.value.status
  if (isCurrent.value) return 'running'
  return 'pending'
})

const isExpanded = computed(() => !!props.expandedIds[id.value])
const isEditing = computed(() => props.editingId === id.value)

const title = computed(() => {
  if (kind.value === 'loop') return t('workflow.loop')
  if (kind.value === 'parallel') return t('workflow.parallel')
  if (props.step.description) return props.step.description
  if (props.step.action && props.step.target) return `${props.step.action} → ${props.step.target}`
  if (props.step.action) return props.step.action
  return t('workflow.untitledNode')
})

const subtitle = computed(() => {
  if (kind.value === 'loop') return props.step.condition ?? ''
  if (kind.value === 'parallel') return (props.step.shared_context_keys ?? []).join(', ')
  if (props.step.action && props.step.target && props.step.description) {
    return `${props.step.action} · ${props.step.target}`
  }
  if (props.step.value) return props.step.value
  return ''
})

const hasChildren = computed(() =>
  Array.isArray(props.step.children) && props.step.children.length > 0,
)

const dotClasses = computed(() => {
  const base = 'size-3 rounded-full border-2 transition-all'
  switch (status.value) {
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
})

const editDraft = ref<WorkflowStep>({ ...props.step })

watch(() => props.step, (next) => {
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
  editDraft.value = { ...props.step }
  emit('beginEdit', null)
}

function onDoubleClick() {
  if (props.readonly) return
  emit('beginEdit', id.value)
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="group flex items-start gap-3 py-2"
      :style="{ paddingLeft: `${depth * 20}px` }"
    >
      <div class="flex flex-col items-center pt-1.5">
        <span :class="dotClasses" />
        <span
          v-if="hasChildren && isExpanded"
          class="mt-1 w-px flex-1 bg-neutral-200"
          aria-hidden="true"
        />
      </div>

      <div class="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 shadow-sm">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span
                v-if="kind !== 'directive'"
                class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="kind === 'loop' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'"
              >
                {{ kind }}
              </span>
              <span
                v-if="kind === 'loop' && state?.iteration"
                class="text-[10px] font-medium text-neutral-400"
              >
                #{{ state.iteration }}
              </span>
              <button
                v-if="hasChildren"
                type="button"
                class="flex size-4 items-center justify-center rounded hover:bg-neutral-100"
                @click="emit('toggleExpand', id)"
              >
                <UIcon
                  :name="isExpanded ? 'i-heroicons-chevron-down-20-solid' : 'i-heroicons-chevron-right-20-solid'"
                  class="size-3.5 text-neutral-500"
                />
              </button>
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

            <div v-else class="mt-1.5 flex flex-col gap-1.5">
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
      </div>
    </div>

    <div v-if="hasChildren && isExpanded">
      <WorkflowNode
        v-for="child in step.children"
        :key="child.id ?? ''"
        :step="child"
        :depth="depth + 1"
        :states="states"
        :current-path="currentPath"
        :readonly="readonly"
        :editing-id="editingId"
        :expanded-ids="expandedIds"
        :ancestor-path="pathInclusive"
        @update="(id, patch) => emit('update', id, patch)"
        @delete="(id) => emit('delete', id)"
        @rerun-from="(id) => emit('rerunFrom', id)"
        @toggle-expand="(id) => emit('toggleExpand', id)"
        @begin-edit="(id) => emit('beginEdit', id)"
      />
    </div>
  </div>
</template>
