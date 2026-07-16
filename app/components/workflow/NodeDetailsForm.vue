<script setup lang="ts">
import type { FlowCheck, FlowCheckMode, WorkflowNode } from '~/composables/workflows/useWorkflows'

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
const checks = ref<FlowCheck[]>([...(props.node.checks ?? [])])
const iterationsText = ref(
  typeof props.node.iterations === 'number' && props.node.iterations > 1
    ? String(props.node.iterations)
    : '',
)

// draftAction holds a new-action row that hasn't been committed yet. The
// row only joins the persisted `actions` array when the user presses
// Enter; blurring or pressing Escape discards it. This avoids dangling
// empty rows the user has to manually clean up.
const draftAction = ref<string | null>(null)
const draftInputEl = ref<HTMLTextAreaElement | null>(null)
// Set by @keyup.enter so the subsequent @blur knows the row has already
// committed and shouldn't be discarded.
let draftCommittedViaEnter = false

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
function commitIterations() {
  if (props.locked) return
  const trimmed = iterationsText.value.trim()
  if (trimmed === '') {
    commit({ iterations: 0 })
    return
  }
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 0) {
    commit({ iterations: 0 })
    return
  }
  commit({ iterations: Math.min(100, n) })
}
function commitActions() {
  commit({ actions: [...actions.value] })
}
function commitChecks() {
  commit({ checks: checks.value.map(c => ({ ...c })) })
}

function startDraftAction() {
  if (props.locked) return
  draftAction.value = ''
  draftCommittedViaEnter = false
  void nextTick(() => draftInputEl.value?.focus())
}

function commitDraftAction() {
  if (props.locked) {
    draftAction.value = null
    return
  }
  const text = (draftAction.value ?? '').trim()
  if (text === '') {
    draftAction.value = null
    return
  }
  draftCommittedViaEnter = true
  actions.value = [...actions.value, text]
  commitActions()
  draftAction.value = null
}

function cancelDraftAction() {
  draftAction.value = null
}

function onDraftBlur() {
  if (draftCommittedViaEnter) {
    draftCommittedViaEnter = false
    return
  }
  // Discard the draft when the user clicks elsewhere without pressing
  // Enter — empty or not. Matches "only Enter commits" semantics.
  draftAction.value = null
}

function removeAction(idx: number) {
  if (props.locked) return
  const next = actions.value.slice()
  next.splice(idx, 1)
  actions.value = next
  commitActions()
}

function addCheck() {
  if (props.locked) return
  checks.value = [
    ...checks.value,
    {
      id: `check-${Date.now().toString(36)}`,
      label: '',
      mode: 'auto',
      expectation: '',
    },
  ]
  commitChecks()
}

function removeCheck(idx: number) {
  if (props.locked) return
  const next = checks.value.slice()
  next.splice(idx, 1)
  checks.value = next
  commitChecks()
}

function setCheckMode(idx: number, mode: FlowCheckMode) {
  if (props.locked) return
  checks.value[idx] = { ...checks.value[idx]!, mode }
  commitChecks()
}

const focusInput = () => emit('focus', props.nodeId)
const blurInput = () => emit('blur', props.nodeId)

const labelCls = 'text-[11px] font-semibold uppercase tracking-wider text-neutral-700'
const helperCls = 'text-[11px] text-neutral-500'
const inputCls = 'min-w-0 w-full bg-transparent border-0 px-1.5 py-1 -mx-1.5 rounded-sm outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400'
const textareaCls = inputCls + ' resize-none leading-snug'
const actionRowCls = 'w-full bg-transparent border-0 outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 text-left rounded-sm py-1.5 px-2 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400 resize-none leading-snug'
</script>

<template>
  <div class="space-y-3">
    <section>
      <div :class="labelCls">
        {{ t('workflow.title') }}
      </div>
      <input
        id="nd-title"
        v-model="title"
        :disabled="locked"
        :class="inputCls + ' mt-1.5'"
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
        <div :class="labelCls">
          {{ t('workflow.actions') }}
        </div>
        <button
          type="button"
          class="text-[11px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="locked || draftAction !== null"
          @click="startDraftAction"
        >
          + {{ t('workflow.addAction') }}
        </button>
      </div>
      <ul v-if="actions.length > 0 || draftAction !== null" class="mt-1.5 space-y-1">
        <li
          v-for="(_, idx) in actions"
          :key="idx"
          class="flex items-center gap-2"
        >
          <textarea
            v-model="actions[idx]"
            :name="`action-item-${idx}`"
            :disabled="locked"
            :class="actionRowCls"
            :placeholder="t('workflow.actionItemPlaceholder')"
            rows="1"
            @input="scheduleIdleCommit(`action:${idx}`, commitActions)"
            @blur="commitActions(); blurInput()"
            @focus="focusInput"
          />
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-rose-500 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
            :disabled="locked"
            :aria-label="t('workflow.removeAction')"
            @click="removeAction(idx)"
          >
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-3.5" />
          </button>
        </li>
        <li
          v-if="draftAction !== null"
          class="flex items-center gap-2"
        >
          <textarea
            ref="draftInputEl"
            v-model="draftAction"
            name="action-item-draft"
            :disabled="locked"
            :class="actionRowCls"
            :placeholder="t('workflow.actionItemPlaceholder')"
            rows="1"
            @keydown.enter.prevent="commitDraftAction"
            @keydown.esc.prevent="cancelDraftAction"
            @blur="onDraftBlur(); blurInput()"
            @focus="focusInput"
          />
          <button
            type="button"
            class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-rose-500"
            :aria-label="t('workflow.removeAction')"
            @mousedown.prevent="cancelDraftAction"
          >
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-3.5" />
          </button>
        </li>
      </ul>
      <p
        v-else
        class="mt-1.5 text-[11px] italic text-neutral-500"
      >
        {{ t('workflow.actionsEmpty') }}
      </p>
    </section>

    <section>
      <div :class="labelCls">
        {{ t('workflow.details') }}
      </div>
      <textarea
        v-model="details"
        name="node-details"
        :disabled="locked"
        :class="textareaCls + ' mt-1.5 min-h-[2.5rem]'"
        :placeholder="t('workflow.detailsPlaceholder')"
        rows="3"
        @input="scheduleIdleCommit('details', commitDetails)"
        @blur="commitDetails(); blurInput()"
        @focus="focusInput"
      />
    </section>

    <section>
      <div class="flex items-center justify-between">
        <div :class="labelCls">
          {{ t('workflow.checks') }}
        </div>
        <button
          type="button"
          class="text-[11px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="locked"
          @click="addCheck"
        >
          + {{ t('workflow.addCheck') }}
        </button>
      </div>
      <div v-if="checks.length" class="mt-1.5 space-y-2">
        <div
          v-for="(check, idx) in checks"
          :key="check.id"
          class="rounded-md border border-neutral-200 bg-neutral-50 p-2"
        >
          <div class="flex items-center gap-1.5">
            <input
              v-model="check.label"
              :disabled="locked"
              :class="inputCls + ' bg-white'"
              :placeholder="t('workflow.checkLabelPlaceholder')"
              type="text"
              @input="scheduleIdleCommit(`check-label:${idx}`, commitChecks)"
              @blur="commitChecks(); blurInput()"
              @focus="focusInput"
            >
            <button
              type="button"
              class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-rose-500 disabled:cursor-not-allowed"
              :disabled="locked"
              :aria-label="t('workflow.removeCheck')"
              @click="removeCheck(idx)"
            >
              <UIcon name="i-heroicons-x-mark-20-solid" class="size-3.5" />
            </button>
          </div>
          <div class="mt-1.5 grid grid-cols-3 gap-1 rounded-md bg-white p-0.5">
            <button
              v-for="mode in (['auto', 'comparison', 'review'] as FlowCheckMode[])"
              :key="mode"
              type="button"
              class="h-6 rounded text-[11px] font-medium transition-colors"
              :class="check.mode === mode ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:text-neutral-900'"
              :disabled="locked"
              @click="setCheckMode(idx, mode)"
            >
              {{ t(`workflow.checkMode.${mode}`) }}
            </button>
          </div>
          <textarea
            v-model="check.expectation"
            :disabled="locked"
            :class="textareaCls + ' mt-1.5 min-h-[2rem] bg-white'"
            :placeholder="t('workflow.checkExpectationPlaceholder')"
            rows="2"
            @input="scheduleIdleCommit(`check-expectation:${idx}`, commitChecks)"
            @blur="commitChecks(); blurInput()"
            @focus="focusInput"
          />
        </div>
      </div>
      <p v-else class="mt-1.5 text-[11px] italic text-neutral-500">
        {{ t('workflow.checksEmpty') }}
      </p>
    </section>

    <section>
      <div :class="labelCls">
        {{ t('workflow.notes') }}
      </div>
      <textarea
        v-model="notes"
        name="node-notes"
        :disabled="locked"
        :class="textareaCls + ' mt-1.5 min-h-[2.25rem]'"
        :placeholder="t('workflow.notesPlaceholder')"
        rows="2"
        @input="scheduleIdleCommit('notes', commitNotes)"
        @blur="commitNotes(); blurInput()"
        @focus="focusInput"
      />
    </section>

    <section>
      <div :class="labelCls">
        {{ t('workflow.iterationsLabel') }}
      </div>
      <input
        id="nd-iterations"
        v-model="iterationsText"
        :disabled="locked"
        :class="inputCls + ' mt-1.5'"
        :placeholder="t('workflow.iterationsPlaceholder')"
        type="text"
        inputmode="numeric"
        @input="scheduleIdleCommit('iterations', commitIterations)"
        @blur="commitIterations(); blurInput()"
        @keyup.enter="commitIterations"
        @focus="focusInput"
      />
      <p :class="helperCls + ' mt-1'">
        {{ t('workflow.iterationsHelp') }}
      </p>
    </section>
  </div>
</template>
