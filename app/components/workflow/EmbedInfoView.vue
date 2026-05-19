<script setup lang="ts">
import type { WorkflowNode, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'

// EmbedInfoView is the InfoPanel form for an embed node — a node whose
// workflow_ref points at another saved workflow. Renders read-only:
//   - Clickable workflow title at the top (navigates to that workflow).
//   - Mini read-only canvas thumbnail of the referenced workflow's graph.
//   - A `repeat` numeric input — the one editable property, since it
//     controls how many times the embed is invoked and isn't content
//     belonging to the referenced workflow.
//
// Everything else (title, actions, details, notes) is omitted because
// it's derived from the referenced workflow at runtime.
const props = defineProps<{
  nodeId: string
  node: WorkflowNode
  workflow: WorkflowWithLatest | null
  loading?: boolean
  locked?: boolean
}>()

const emit = defineEmits<{
  'update:patch': [nodeId: string, patch: Partial<WorkflowNode>]
  navigate: [workflowId: string]
}>()

const { t } = useI18n()

const repeatText = ref(
  typeof props.node.repeat === 'number' && props.node.repeat > 1
    ? String(props.node.repeat)
    : '',
)

const idleTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleIdleCommit(key: string, fn: () => void) {
  clearTimeout(idleTimers[key])
  idleTimers[key] = setTimeout(fn, 350)
}

function commitRepeat() {
  if (props.locked) return
  const trimmed = repeatText.value.trim()
  if (trimmed === '') {
    emit('update:patch', props.nodeId, { repeat: 0 })
    return
  }
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 0) {
    emit('update:patch', props.nodeId, { repeat: 0 })
    return
  }
  emit('update:patch', props.nodeId, { repeat: Math.min(100, n) })
}

function onTitleClick() {
  const id = props.node.workflow_ref?.trim() ?? ''
  if (!id) return
  emit('navigate', id)
}

const inputCls = 'min-w-0 w-full bg-transparent border-0 px-1.5 py-1 -mx-1.5 rounded-sm outline-none font-mono text-[12px] text-neutral-800 placeholder:text-neutral-300 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400'
</script>

<template>
  <div class="space-y-4">
    <section>
      <button
        type="button"
        class="group flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-neutral-100"
        :disabled="!props.workflow"
        @click="onTitleClick"
      >
        <UIcon
          name="i-heroicons-arrow-top-right-on-square"
          class="size-3.5 shrink-0 text-neutral-400 group-hover:text-neutral-700"
          :style="{ color: 'var(--color-embed-border)' }"
        />
        <span
          class="min-w-0 flex-1 truncate text-sm font-semibold"
          :style="{ color: 'var(--color-embed-border)' }"
        >
          {{ props.workflow?.name ?? (props.loading ? '…' : t('workflow.embedMissing')) }}
        </span>
      </button>
    </section>

    <section>
      <MiniWorkflowCanvas
        v-if="props.workflow?.latest_version?.steps"
        :graph="props.workflow.latest_version.steps"
        :width="308"
        :height="200"
      />
      <p
        v-else-if="props.loading"
        class="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-[11px] text-neutral-400"
      >
        {{ t('workflow.embedLoading') }}
      </p>
      <p
        v-else
        class="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-[11px] text-neutral-400"
      >
        {{ t('workflow.embedEmpty') }}
      </p>
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {{ t('workflow.repeatLabel') }}
      </div>
      <input
        id="embed-repeat"
        v-model="repeatText"
        :disabled="locked"
        :class="inputCls + ' mt-2'"
        :placeholder="t('workflow.repeatPlaceholder')"
        type="text"
        inputmode="numeric"
        @input="scheduleIdleCommit('repeat', commitRepeat)"
        @blur="commitRepeat"
        @keyup.enter="commitRepeat"
      />
      <p class="mt-1 text-[10px] text-neutral-400">
        {{ t('workflow.repeatHelp') }}
      </p>
    </section>
  </div>
</template>
