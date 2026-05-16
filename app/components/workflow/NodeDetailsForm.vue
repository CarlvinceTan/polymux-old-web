<script setup lang="ts">
import type { WorkflowNode } from '~/composables/workflows/useWorkflows'

const props = defineProps<{
  nodeId: string
  node: WorkflowNode
  locked?: boolean
}>()

const emit = defineEmits<{
  'update:patch': [nodeId: string, patch: Partial<WorkflowNode>]
  focus: [nodeId: string]
  blur: [nodeId: string]
}>()

const { t } = useI18n()

const action = ref(props.node.action ?? '')
const target = ref(props.node.target ?? '')
const value = ref(props.node.value ?? '')
const description = ref(props.node.description ?? '')
const annotation = ref(props.node.annotation ?? '')

// 350ms idle commit for text fields. Each field has its own timer so typing
// in one input doesn't delay the commit on another.
const idleTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleIdleCommit(key: string, fn: () => void) {
  clearTimeout(idleTimers[key])
  idleTimers[key] = setTimeout(fn, 350)
}

function commit(patch: Partial<WorkflowNode>) {
  if (props.locked) return
  emit('update:patch', props.nodeId, patch)
}

function commitAction() { commit({ action: action.value }) }
function commitTarget() { commit({ target: target.value }) }
function commitValue() { commit({ value: value.value }) }
function commitDescription() { commit({ description: description.value }) }
function commitAnnotation() { commit({ annotation: annotation.value }) }

const focusInput = () => emit('focus', props.nodeId)
const blurInput = () => emit('blur', props.nodeId)

const labelCls = 'text-[11px] text-neutral-400'
const inputCls = 'min-w-0 w-full bg-transparent border-0 px-1.5 py-1 -mx-1.5 rounded-sm outline-none font-mono text-[12px] text-neutral-800 placeholder:text-neutral-300 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400'
const textareaCls = inputCls + ' resize-none leading-snug font-sans'
</script>

<template>
  <div class="space-y-5">
    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {{ t('workflow.toolUse') }}
      </div>
      <div class="mt-2 grid grid-cols-[80px_1fr] items-center gap-x-3 gap-y-1.5">
        <label :class="labelCls" for="nd-action">action</label>
        <input
          id="nd-action"
          v-model="action"
          :disabled="locked"
          :class="inputCls"
          :placeholder="t('workflow.actionPlaceholder')"
          type="text"
          @input="scheduleIdleCommit('action', commitAction)"
          @blur="commitAction(); blurInput()"
          @keyup.enter="commitAction"
          @focus="focusInput"
        />

        <label :class="labelCls" for="nd-target">target</label>
        <input
          id="nd-target"
          v-model="target"
          :disabled="locked"
          :class="inputCls"
          :placeholder="t('workflow.targetPlaceholder')"
          type="text"
          @input="scheduleIdleCommit('target', commitTarget)"
          @blur="commitTarget(); blurInput()"
          @keyup.enter="commitTarget"
          @focus="focusInput"
        />

        <label :class="labelCls" for="nd-value">value</label>
        <input
          id="nd-value"
          v-model="value"
          :disabled="locked"
          :class="inputCls"
          :placeholder="t('workflow.valuePlaceholder')"
          type="text"
          @input="scheduleIdleCommit('value', commitValue)"
          @blur="commitValue(); blurInput()"
          @keyup.enter="commitValue"
          @focus="focusInput"
        />
      </div>
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        description
      </div>
      <textarea
        v-model="description"
        :disabled="locked"
        :class="textareaCls + ' mt-2 min-h-[3.5rem]'"
        :placeholder="t('workflow.descriptionPlaceholder')"
        rows="3"
        @input="scheduleIdleCommit('description', commitDescription)"
        @blur="commitDescription(); blurInput()"
        @focus="focusInput"
      />
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        annotation
      </div>
      <textarea
        v-model="annotation"
        :disabled="locked"
        :class="textareaCls + ' mt-2 min-h-[2.5rem]'"
        :placeholder="t('workflow.annotationPlaceholder')"
        rows="2"
        @input="scheduleIdleCommit('annotation', commitAnnotation)"
        @blur="commitAnnotation(); blurInput()"
        @focus="focusInput"
      />
    </section>
  </div>
</template>
