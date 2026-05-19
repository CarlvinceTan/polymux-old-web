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

const title = ref(props.node.title ?? '')
const actions = ref<string[]>([...(props.node.actions ?? [])])
const details = ref(props.node.details ?? '')
const notes = ref(props.node.notes ?? '')
const repeatText = ref(
  typeof props.node.repeat === 'number' && props.node.repeat > 1
    ? String(props.node.repeat)
    : '',
)

// 350ms idle commit for text fields. Each field has its own timer so typing
// in one input doesn't delay the commit on another. For the actions list we
// key timers by row index — every editable row shares the same "actions"
// patch shape (we always send the whole array), but the debounce is per-row
// so a fast typist in row 2 doesn't reset the timer for row 1.
const idleTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleIdleCommit(key: string, fn: () => void) {
  clearTimeout(idleTimers[key])
  idleTimers[key] = setTimeout(fn, 350)
}

function commit(patch: Partial<WorkflowNode>) {
  if (props.locked) return
  emit('update:patch', props.nodeId, patch)
}

function commitTitle() { commit({ title: title.value }) }
function commitDetails() { commit({ details: details.value }) }
function commitNotes() { commit({ notes: notes.value }) }
function commitRepeat() {
  if (props.locked) return
  const trimmed = repeatText.value.trim()
  if (trimmed === '') {
    commit({ repeat: 0 })
    return
  }
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 0) {
    commit({ repeat: 0 })
    return
  }
  commit({ repeat: Math.min(100, n) })
}
function commitActions() {
  // Send the whole array — the server / applyOp uses replace-the-whole-list
  // semantics for the actions slice. Empty trailing strings are kept so the
  // user can keep typing in a blank row; ValidateGraph treats all-empty as
  // "no actions".
  commit({ actions: [...actions.value] })
}

function addAction() {
  if (props.locked) return
  actions.value = [...actions.value, '']
  commitActions()
}

function removeAction(idx: number) {
  if (props.locked) return
  const next = actions.value.slice()
  next.splice(idx, 1)
  actions.value = next
  commitActions()
}

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
        {{ t('workflow.title') }}
      </div>
      <input
        id="nd-title"
        v-model="title"
        :disabled="locked"
        :class="inputCls + ' mt-2'"
        :placeholder="t('workflow.titlePlaceholder')"
        type="text"
        @input="scheduleIdleCommit('title', commitTitle)"
        @blur="commitTitle(); blurInput()"
        @keyup.enter="commitTitle"
        @focus="focusInput"
      />
    </section>

    <section>
      <div class="flex items-center justify-between">
        <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
          {{ t('workflow.actions') }}
        </div>
        <button
          type="button"
          class="text-[11px] text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="locked"
          @click="addAction"
        >
          + {{ t('workflow.addAction') }}
        </button>
      </div>
      <ul v-if="actions.length > 0" class="mt-2 space-y-1.5">
        <li
          v-for="(_, idx) in actions"
          :key="idx"
          class="flex items-start gap-1.5"
        >
          <textarea
            v-model="actions[idx]"
            :disabled="locked"
            :class="textareaCls + ' min-h-[2rem]'"
            :placeholder="t('workflow.actionItemPlaceholder')"
            rows="1"
            @input="scheduleIdleCommit(`action:${idx}`, commitActions)"
            @blur="commitActions(); blurInput()"
            @focus="focusInput"
          />
          <button
            type="button"
            class="mt-1 shrink-0 text-neutral-300 transition-colors hover:text-rose-500 disabled:cursor-not-allowed disabled:hover:text-neutral-300"
            :disabled="locked"
            :aria-label="t('workflow.removeAction')"
            @click="removeAction(idx)"
          >
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-3.5" />
          </button>
        </li>
      </ul>
      <p
        v-else
        class="mt-2 text-[11px] italic text-neutral-300"
      >
        {{ t('workflow.actionsEmpty') }}
      </p>
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {{ t('workflow.details') }}
      </div>
      <textarea
        v-model="details"
        :disabled="locked"
        :class="textareaCls + ' mt-2 min-h-[3rem]'"
        :placeholder="t('workflow.detailsPlaceholder')"
        rows="3"
        @input="scheduleIdleCommit('details', commitDetails)"
        @blur="commitDetails(); blurInput()"
        @focus="focusInput"
      />
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {{ t('workflow.notes') }}
      </div>
      <textarea
        v-model="notes"
        :disabled="locked"
        :class="textareaCls + ' mt-2 min-h-[2.5rem]'"
        :placeholder="t('workflow.notesPlaceholder')"
        rows="2"
        @input="scheduleIdleCommit('notes', commitNotes)"
        @blur="commitNotes(); blurInput()"
        @focus="focusInput"
      />
    </section>

    <section>
      <div class="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {{ t('workflow.repeatLabel') }}
      </div>
      <input
        id="nd-repeat"
        v-model="repeatText"
        :disabled="locked"
        :class="inputCls + ' mt-2'"
        :placeholder="t('workflow.repeatPlaceholder')"
        type="text"
        inputmode="numeric"
        @input="scheduleIdleCommit('repeat', commitRepeat)"
        @blur="commitRepeat(); blurInput()"
        @keyup.enter="commitRepeat"
        @focus="focusInput"
      />
      <p class="mt-1 text-[10px] text-neutral-400">
        {{ t('workflow.repeatHelp') }}
      </p>
    </section>
  </div>
</template>
