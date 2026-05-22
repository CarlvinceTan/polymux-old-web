<script setup lang="ts">
import type { WorkflowNode, WorkflowWithLatest } from '~/composables/workflows/useWorkflows'

const props = defineProps<{
  nodeId: string
  node: WorkflowNode
  workflow: WorkflowWithLatest | null
  loading?: boolean
  locked?: boolean
  // Workflow this canvas is editing — excluded from the picker so a user
  // can't accidentally self-reference (the server would reject on save,
  // but pre-empting in UI is friendlier).
  currentWorkflowId?: string
}>()

const emit = defineEmits<{
  'update:patch': [nodeId: string, patch: Partial<WorkflowNode>]
  navigate: [workflowId: string]
}>()

const { t } = useI18n()
const { workflows } = useWorkflows()

const notes = ref(props.node.notes ?? '')
const iterationsText = ref(
  typeof props.node.iterations === 'number' && props.node.iterations > 1
    ? String(props.node.iterations)
    : '',
)

// Dropdown state
const dropdownOpen = ref(false)
const search = ref('')
const dropdownButtonEl = ref<HTMLElement | null>(null)
const dropdownPanelEl = ref<HTMLElement | null>(null)
const searchInputEl = ref<HTMLInputElement | null>(null)

const idleTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleIdleCommit(key: string, fn: () => void) {
  clearTimeout(idleTimers[key])
  idleTimers[key] = setTimeout(fn, 350)
}

function commit(patch: Partial<WorkflowNode>) {
  if (props.locked) return
  emit('update:patch', props.nodeId, patch)
}

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

function onTitleClick() {
  const id = props.node.workflow_ref?.trim() ?? ''
  if (!id) return
  emit('navigate', id)
}

// Pickable workflows: everything in the workspace except the current
// workflow itself. Sorted by name for predictability.
const pickable = computed<WorkflowWithLatest[]>(() => {
  const cur = (props.currentWorkflowId ?? '').trim()
  return [...workflows.value]
    .filter(w => w.id !== cur)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
})

const filtered = computed<WorkflowWithLatest[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return pickable.value
  return pickable.value.filter(w => (w.name ?? '').toLowerCase().includes(q))
})

const selectedName = computed(() => {
  const ref = props.node.workflow_ref?.trim() ?? ''
  if (!ref) return ''
  if (props.workflow?.name) return props.workflow.name
  return ref.length > 12 ? ref.slice(0, 12) + '…' : ref
})

function toggleDropdown() {
  if (props.locked) return
  dropdownOpen.value = !dropdownOpen.value
}

function pickWorkflow(w: WorkflowWithLatest) {
  if (props.locked) return
  commit({ workflow_ref: w.id })
  dropdownOpen.value = false
  search.value = ''
}

function onDocClick(ev: MouseEvent) {
  if (!dropdownOpen.value) return
  const t = ev.target as Node | null
  if (!t) return
  if (dropdownButtonEl.value?.contains(t)) return
  if (dropdownPanelEl.value?.contains(t)) return
  dropdownOpen.value = false
}

watch(dropdownOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', onDocClick)
    void nextTick(() => searchInputEl.value?.focus())
  }
  else {
    document.removeEventListener('mousedown', onDocClick)
    search.value = ''
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
})

const labelCls = 'text-[11px] font-semibold uppercase tracking-wider text-neutral-700'
const helperCls = 'text-[11px] text-neutral-500'
const inputCls = 'min-w-0 w-full bg-transparent border-0 px-1.5 py-1 -mx-1.5 rounded-sm outline-none text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:text-neutral-400'
const textareaCls = inputCls + ' resize-none leading-snug'
</script>

<template>
  <div class="space-y-3">
    <!-- Workflow picker — replaces the title input of a regular node form. -->
    <section>
      <div :class="labelCls">
        {{ t('workflow.embedWorkflowLabel') }}
      </div>
      <div class="relative mt-1.5">
        <button
          ref="dropdownButtonEl"
          type="button"
          class="flex w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="locked"
          @click="toggleDropdown"
        >
          <UIcon
            name="i-heroicons-arrow-top-right-on-square"
            class="size-3.5 shrink-0"
            :style="{ color: 'var(--color-embed-border)' }"
          />
          <span
            v-if="selectedName"
            class="min-w-0 flex-1 truncate text-[13px] font-medium"
            :style="{ color: 'var(--color-embed-border)' }"
          >
            {{ selectedName }}
          </span>
          <span
            v-else
            class="min-w-0 flex-1 truncate text-[13px] italic text-neutral-500"
          >
            {{ t('workflow.embedSelectWorkflow') }}
          </span>
          <UIcon
            name="i-heroicons-chevron-down-20-solid"
            class="size-4 shrink-0 text-neutral-400"
          />
        </button>
        <Transition
          enter-active-class="transition duration-100 ease-out"
          enter-from-class="-translate-y-1 opacity-0"
          enter-to-class="translate-y-0 opacity-100"
          leave-active-class="transition duration-75 ease-in"
          leave-from-class="translate-y-0 opacity-100"
          leave-to-class="-translate-y-1 opacity-0"
        >
          <div
            v-if="dropdownOpen"
            ref="dropdownPanelEl"
            class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
          >
            <div class="border-b border-neutral-100 px-2 py-1.5">
              <input
                ref="searchInputEl"
                v-model="search"
                type="text"
                name="embed-search"
                :placeholder="t('workflow.embedSearchPlaceholder')"
                class="w-full bg-transparent text-[12px] text-neutral-900 placeholder:text-neutral-400 outline-none"
                @keydown.esc.stop="dropdownOpen = false"
              />
            </div>
            <div class="max-h-56 overflow-y-auto">
              <button
                v-for="w in filtered"
                :key="w.id"
                type="button"
                class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-neutral-50"
                :class="props.node.workflow_ref === w.id ? 'bg-neutral-50' : ''"
                @click="pickWorkflow(w)"
              >
                <UIcon
                  name="i-heroicons-arrow-top-right-on-square"
                  class="size-3 shrink-0"
                  :style="{ color: 'var(--color-embed-border)' }"
                />
                <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-900">
                  {{ w.name || w.id }}
                </span>
                <UIcon
                  v-if="props.node.workflow_ref === w.id"
                  name="i-heroicons-check-20-solid"
                  class="size-3.5 shrink-0 text-neutral-500"
                />
              </button>
              <p
                v-if="filtered.length === 0"
                class="px-2 py-3 text-center text-[11px] italic text-neutral-500"
              >
                {{ pickable.length === 0 ? t('workflow.embedNoWorkflows') : t('workflow.embedNoMatches') }}
              </p>
            </div>
          </div>
        </Transition>
      </div>
      <button
        v-if="selectedName"
        type="button"
        class="mt-1.5 text-[11px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="!props.workflow"
        @click="onTitleClick"
      >
        {{ t('workflow.embedOpen') }}
      </button>
    </section>

    <!-- Mini canvas thumbnail of the referenced workflow. Only shown
         when a workflow is picked AND its latest version is loaded. -->
    <section v-if="props.workflow?.latest_version?.steps">
      <MiniWorkflowCanvas
        :graph="props.workflow.latest_version.steps"
        :width="308"
        :height="180"
      />
    </section>
    <section v-else-if="props.node.workflow_ref">
      <p
        v-if="props.loading"
        class="rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-[11px] text-neutral-500"
      >
        {{ t('workflow.embedLoading') }}
      </p>
      <p
        v-else
        class="rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-[11px] text-neutral-500"
      >
        {{ t('workflow.embedMissing') }}
      </p>
    </section>

    <!-- Notes carry over from the regular node form — user-only scratchpad
         so the user can annotate why this embed exists in this context. -->
    <section>
      <div :class="labelCls">
        {{ t('workflow.notes') }}
      </div>
      <textarea
        v-model="notes"
        name="embed-notes"
        :disabled="locked"
        :class="textareaCls + ' mt-1.5 min-h-[2.25rem]'"
        :placeholder="t('workflow.notesPlaceholder')"
        rows="2"
        @input="scheduleIdleCommit('notes', commitNotes)"
        @blur="commitNotes"
      />
    </section>

    <section>
      <div :class="labelCls">
        {{ t('workflow.iterationsLabel') }}
      </div>
      <input
        id="embed-iterations"
        v-model="iterationsText"
        name="embed-iterations"
        :disabled="locked"
        :class="inputCls + ' mt-1.5'"
        :placeholder="t('workflow.iterationsPlaceholder')"
        type="text"
        inputmode="numeric"
        @input="scheduleIdleCommit('iterations', commitIterations)"
        @blur="commitIterations"
        @keyup.enter="commitIterations"
      />
      <p :class="helperCls + ' mt-1'">
        {{ t('workflow.iterationsHelp') }}
      </p>
    </section>
  </div>
</template>
