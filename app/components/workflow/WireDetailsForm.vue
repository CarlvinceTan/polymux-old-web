<script setup lang="ts">
import type { WorkflowWire } from '~/composables/workflows/useWorkflows'

const props = defineProps<{
  wireId: string
  wire: WorkflowWire
}>()

const emit = defineEmits<{
  'update:patch': [wireId: string, patch: Partial<WorkflowWire>]
}>()

const { t } = useI18n()

const label = ref(props.wire.label ?? '')
const condition = ref(props.wire.condition ?? '')
const maxIterationsText = ref(
  typeof props.wire.max_iterations === 'number' && props.wire.max_iterations > 0
    ? String(props.wire.max_iterations)
    : '',
)

const idleTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleIdleCommit(key: string, fn: () => void) {
  clearTimeout(idleTimers[key])
  idleTimers[key] = setTimeout(fn, 350)
}

function commit(patch: Partial<WorkflowWire>) {
  emit('update:patch', props.wireId, patch)
}

function commitLabel() { commit({ label: label.value }) }
function commitCondition() { commit({ condition: condition.value }) }
function commitMaxIterations() {
  const n = Number.parseInt(maxIterationsText.value.trim(), 10)
  commit({ max_iterations: Number.isFinite(n) && n > 0 ? n : 0 })
}

const labelCls = 'text-[11px] font-semibold uppercase tracking-wider text-neutral-700'
const inputCls = 'min-w-0 w-full bg-transparent border-0 px-1.5 py-1 -mx-1.5 rounded-sm outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300'
const textareaCls = inputCls + ' resize-none leading-snug'
</script>

<template>
  <div class="space-y-3">
    <section>
      <div :class="labelCls">
        {{ t('workflow.wireLabelLabel') }}
      </div>
      <div class="mt-1.5 grid grid-cols-[80px_1fr] items-center gap-x-3 gap-y-1.5">
        <label class="text-[11px] text-neutral-600" for="we-label">label</label>
        <input
          id="we-label"
          v-model="label"
          :class="inputCls"
          :placeholder="t('workflow.wireLabelPlaceholder')"
          type="text"
          @input="scheduleIdleCommit('label', commitLabel)"
          @blur="commitLabel"
          @keyup.enter="commitLabel"
        />

        <label class="text-[11px] text-neutral-600" for="we-max">{{ t('workflow.wireMaxIterationsLabel') }}</label>
        <input
          id="we-max"
          v-model="maxIterationsText"
          :class="inputCls"
          :placeholder="t('workflow.wireMaxIterationsPlaceholder')"
          type="text"
          inputmode="numeric"
          @input="scheduleIdleCommit('max', commitMaxIterations)"
          @blur="commitMaxIterations"
          @keyup.enter="commitMaxIterations"
        />
      </div>
    </section>

    <section>
      <div :class="labelCls">
        {{ t('workflow.wireConditionLabel') }}
      </div>
      <textarea
        v-model="condition"
        name="wire-condition"
        :class="textareaCls + ' mt-1.5 min-h-[2.75rem]'"
        :placeholder="t('workflow.wireConditionPlaceholder')"
        rows="3"
        @input="scheduleIdleCommit('condition', commitCondition)"
        @blur="commitCondition"
      />
    </section>
  </div>
</template>
