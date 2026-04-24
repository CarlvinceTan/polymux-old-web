<script setup lang="ts">
import type { SessionHandle } from '~/composables/useSession'
import type { WorkflowStep, WorkflowVersion, WorkflowWithLatest } from '~/composables/useWorkflows'
import { VersionConflictError } from '~/composables/useWorkflows'

const props = defineProps<{
  sessionId: string
  readonly?: boolean
}>()

const injectedSession = inject<SessionHandle | null>('chat-session', null)
if (!injectedSession) {
  throw new Error('WorkflowDock requires `chat-session` to be provided by an ancestor')
}
const session = injectedSession

const { sessions } = useChatSessions()
const { currentWorkspace } = useWorkspaces()

const workspaceId = computed(() => {
  const s = sessions.value.find(s => s.id === props.sessionId)
  return s?.workspace_id ?? currentWorkspace.value?.id ?? ''
})

const { t } = useI18n()
const toast = useAppToast()

const {
  workflows,
  versions,
  fetchWorkflows,
  fetchVersions,
  createVersion,
  startRun,
  getWorkflow,
} = useWorkflows()

const run = useWorkflowRun(session)

const selectedWorkflowId = ref<string | null>(null)
const selectedWorkflow = computed(() =>
  workflows.value.find(w => w.id === selectedWorkflowId.value) ?? null,
)

const workingSteps = ref<WorkflowStep[]>([])
const baseSteps = ref<WorkflowStep[]>([])
const expandedIds = ref<Record<string, boolean>>({})
const editingId = ref<string | null>(null)
const historyOpen = ref(false)
const loadingHistory = ref(false)
const saving = ref(false)
const selectedVersionId = ref<string | null>(null)
const revertModalOpen = ref(false)
const revertTarget = ref<WorkflowVersion | null>(null)
const reverting = ref(false)

const storageKey = computed(() => `polymux_workflow_for_session_${props.sessionId}`)

const dirty = computed(() =>
  JSON.stringify(workingSteps.value) !== JSON.stringify(baseSteps.value),
)

const latestVersion = computed<WorkflowVersion | null>(() => {
  const wf = selectedWorkflow.value as WorkflowWithLatest | null
  return wf?.latest_version ?? null
})

const expectedVersion = computed(() => latestVersion.value?.version ?? 0)

const previewVersion = computed(() => {
  if (!selectedVersionId.value) return null
  return versions.value.find(v => v.id === selectedVersionId.value) ?? null
})

const isPreview = computed(() =>
  !!previewVersion.value && previewVersion.value.id !== latestVersion.value?.id,
)

const versionLabel = computed(() => {
  if (isPreview.value && previewVersion.value) {
    return t('workflow.versionShort', { version: previewVersion.value.version })
  }
  if (dirty.value) return t('workflow.unsavedCurrent')
  if (latestVersion.value) {
    return t('workflow.versionShort', { version: latestVersion.value.version })
  }
  return ''
})

const displayedSteps = computed<WorkflowStep[]>(() =>
  isPreview.value && previewVersion.value ? (previewVersion.value.steps as WorkflowStep[]) : workingSteps.value,
)

const effectiveReadonly = computed(() => !!props.readonly || isPreview.value)

async function initializeForSession() {
  await fetchWorkflows(workspaceId.value)
  if (!import.meta.client) return
  const stored = localStorage.getItem(storageKey.value)
  if (stored && workflows.value.some(w => w.id === stored)) {
    await selectWorkflow(stored)
    return
  }
  // Fall back to the most-recently-updated workflow (server returns list
  // ordered by updated_at desc). If none exist, leave nothing selected and
  // let the empty-state hint prompt the user — the dock will auto-select
  // whichever workflow the agent saves first (see `workflow_saved` below).
  const latest = workflows.value[0]
  if (latest) await selectWorkflow(latest.id)
}

watch(workspaceId, async (ws) => {
  if (ws) await initializeForSession()
}, { immediate: true })

watch(selectedWorkflowId, (id) => {
  if (!import.meta.client) return
  if (id) localStorage.setItem(storageKey.value, id)
  else localStorage.removeItem(storageKey.value)
})

async function selectWorkflow(id: string) {
  selectedWorkflowId.value = id
  selectedVersionId.value = null
  const wf = await getWorkflow(workspaceId.value, id)
  const steps = (wf?.latest_version?.steps ?? []) as WorkflowStep[]
  baseSteps.value = structuredClone(steps)
  workingSteps.value = structuredClone(steps)
  const next: Record<string, boolean> = {}
  const walk = (nodes: WorkflowStep[]) => {
    for (const n of nodes) {
      if (n.id) next[n.id] = true
      if (n.children) walk(n.children)
    }
  }
  walk(steps)
  expandedIds.value = next
  run.reset()
}

function onToggleExpand(id: string) {
  expandedIds.value = { ...expandedIds.value, [id]: !expandedIds.value[id] }
}

function onBeginEdit(id: string | null) {
  editingId.value = id
}

function patchNode(nodes: WorkflowStep[], id: string, patch: Partial<WorkflowStep>): WorkflowStep[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch }
    if (n.children && n.children.length > 0) {
      return { ...n, children: patchNode(n.children, id, patch) }
    }
    return n
  })
}

function removeNode(nodes: WorkflowStep[], id: string): WorkflowStep[] {
  const out: WorkflowStep[] = []
  for (const n of nodes) {
    if (n.id === id) continue
    if (n.children && n.children.length > 0) {
      out.push({ ...n, children: removeNode(n.children, id) })
    }
    else {
      out.push(n)
    }
  }
  return out
}

function onUpdate(id: string, patch: Partial<WorkflowStep>) {
  if (effectiveReadonly.value) return
  workingSteps.value = patchNode(workingSteps.value, id, patch)
}

function onDelete(id: string) {
  if (effectiveReadonly.value) return
  if (!window.confirm(t('workflow.confirmDelete'))) return
  workingSteps.value = removeNode(workingSteps.value, id)
}

async function onSave() {
  if (!selectedWorkflowId.value) return
  saving.value = true
  try {
    const created = await createVersion(workspaceId.value, selectedWorkflowId.value, {
      steps: workingSteps.value,
      expected_version: expectedVersion.value,
      source: 'user',
      impact_level: 'preference',
    })
    if (created) {
      baseSteps.value = structuredClone(workingSteps.value)
      toast.show(t('workflow.savedToast'), 'info', 3000)
      await getWorkflow(workspaceId.value, selectedWorkflowId.value)
    }
  }
  catch (err: unknown) {
    if (err instanceof VersionConflictError) {
      toast.show(t('workflow.versionConflictToast'), 'warning', 6000)
      await selectWorkflow(selectedWorkflowId.value!)
    }
    else {
      toast.show(t('workflow.saveFailedToast'), 'error', 4000)
    }
  }
  finally {
    saving.value = false
  }
}

async function onRun(resumeFromNodeId?: string) {
  if (!selectedWorkflowId.value) return
  if (dirty.value) {
    toast.show(t('workflow.saveBeforeRun'), 'warning', 4000)
    return
  }
  const r = await startRun(workspaceId.value, selectedWorkflowId.value, {
    session_id: props.sessionId,
    resume_from_node_id: resumeFromNodeId,
  })
  if (!r) {
    toast.show(t('workflow.runFailedToast'), 'error', 4000)
    return
  }
  run.hydrate(r)
}

async function toggleHistory() {
  if (historyOpen.value) {
    historyOpen.value = false
    selectedVersionId.value = null
    return
  }
  historyOpen.value = true
  if (!selectedWorkflowId.value) return
  loadingHistory.value = true
  try {
    await fetchVersions(workspaceId.value, selectedWorkflowId.value)
  }
  finally {
    loadingHistory.value = false
  }
}

function onSelectVersion(id: string | null) {
  selectedVersionId.value = id
}

function onRequestRevert(v: WorkflowVersion) {
  revertTarget.value = v
  revertModalOpen.value = true
}

async function onConfirmRevert() {
  if (!selectedWorkflowId.value || !revertTarget.value) return
  reverting.value = true
  try {
    const v = revertTarget.value
    const created = await createVersion(workspaceId.value, selectedWorkflowId.value, {
      steps: v.steps,
      expected_version: expectedVersion.value,
      source: 'user',
      impact_level: 'preference',
      change_summary: t('workflow.restoreChangeSummary', { version: v.version }),
    }).catch((err) => {
      if (err instanceof VersionConflictError) {
        toast.show(t('workflow.versionConflictToast'), 'warning', 6000)
        return null
      }
      throw err
    })
    if (created) {
      await selectWorkflow(selectedWorkflowId.value)
      await fetchVersions(workspaceId.value, selectedWorkflowId.value)
      toast.show(t('workflow.revertedToast'), 'info', 3000)
      revertModalOpen.value = false
      revertTarget.value = null
    }
  }
  finally {
    reverting.value = false
  }
}

const onWorkflowSaveRejected = (p: { name: string; reason: string }) => {
  toast.show(t('workflow.saveRejectedToast', { name: p.name, reason: p.reason }), 'warning', 6000)
}

// The agent persists workflows out-of-band via SaveWorkflow; surface those
// changes in the dock so the user sees the tree grow in real time.
const onWorkflowSaved = async (p: { name: string }) => {
  if (!workspaceId.value) return
  await fetchWorkflows(workspaceId.value)
  const match = workflows.value.find(w => w.name === p.name)
  if (!match) return

  if (!selectedWorkflowId.value) {
    await selectWorkflow(match.id)
    return
  }
  if (selectedWorkflowId.value !== match.id) return

  // Same workflow the user is viewing — reload its steps unless they have
  // unsaved edits (clobbering would be hostile).
  if (dirty.value) {
    toast.show(t('workflow.remoteSaveWhileDirty'), 'warning', 6000)
    return
  }
  await selectWorkflow(match.id)
}

session.on<{ name: string; reason: string }>('workflow_save_rejected', onWorkflowSaveRejected)
session.on<{ name: string }>('workflow_saved', onWorkflowSaved)

onUnmounted(() => {
  session.off('workflow_save_rejected', onWorkflowSaveRejected)
  session.off('workflow_saved', onWorkflowSaved)
})
</script>

<template>
  <div class="relative flex min-h-0 w-full min-w-0 flex-1 overflow-hidden border-neutral-200/90 bg-white md:border-r">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex shrink-0 items-center justify-end gap-2 px-4 py-2">
        <button
          type="button"
          class="flex items-center gap-1.5 text-neutral-500 transition-colors hover:text-neutral-900"
          :title="t('workflow.history')"
          @click="toggleHistory"
        >
          <span
            v-if="versionLabel"
            class="text-[11px] font-medium"
            :class="dirty && !isPreview ? 'text-amber-600' : 'text-neutral-400'"
          >
            {{ versionLabel }}
          </span>
          <UIcon name="i-heroicons-clock" class="size-4" />
        </button>

        <button
          v-if="!readonly && selectedWorkflowId && !isPreview"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium transition-colors"
          :class="dirty
            ? 'bg-neutral-900 text-white hover:bg-neutral-800'
            : 'cursor-not-allowed bg-neutral-100 text-neutral-400'"
          :disabled="!dirty || saving"
          @click="onSave"
        >
          {{ saving ? t('workflow.saving') : t('workflow.save') }}
        </button>

        <button
          v-if="selectedWorkflowId && !isPreview"
          type="button"
          class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-300"
          :disabled="dirty || run.runStatus.value === 'running'"
          @click="() => onRun()"
        >
          <UIcon name="i-heroicons-play-20-solid" class="mr-0.5 inline size-3.5 align-[-2px]" />
          {{ run.runStatus.value === 'running' ? t('workflow.running') : t('workflow.run') }}
        </button>
      </header>

      <div
        v-if="isPreview && previewVersion"
        class="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5"
      >
        <p class="truncate text-[11px] text-amber-800">
          <UIcon name="i-heroicons-eye-20-solid" class="mr-1 inline size-3 align-[-2px]" />
          {{ t('workflow.previewBanner', { version: previewVersion.version }) }}
        </p>
        <button
          type="button"
          class="shrink-0 rounded text-[11px] font-medium text-amber-900 underline-offset-2 hover:underline"
          @click="onSelectVersion(null)"
        >
          {{ t('workflow.exitPreview') }}
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div v-if="!selectedWorkflowId" class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <UIcon name="i-heroicons-square-3-stack-3d-20-solid" class="size-10 text-neutral-300" />
          <p class="text-xs text-neutral-400">
            {{ t('workflow.noWorkflowsSubtitle') }}
          </p>
        </div>

        <div v-else-if="displayedSteps.length === 0" class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <UIcon name="i-heroicons-square-3-stack-3d-20-solid" class="size-10 text-neutral-300" />
          <p class="text-xs text-neutral-400">
            {{ t('workflow.emptySubtitle') }}
          </p>
        </div>

        <div v-else class="flex flex-col gap-0 px-3 py-3">
          <WorkflowNode
            v-for="node in displayedSteps"
            :key="node.id ?? ''"
            :step="node"
            :depth="0"
            :states="run.nodeStates.value"
            :current-path="run.currentPath.value"
            :readonly="effectiveReadonly"
            :editing-id="editingId"
            :expanded-ids="expandedIds"
            :ancestor-path="[]"
            @update="onUpdate"
            @delete="onDelete"
            @rerun-from="(id) => onRun(id)"
            @toggle-expand="onToggleExpand"
            @begin-edit="onBeginEdit"
          />

          <p
            v-if="run.runStatus.value && !isPreview"
            class="mt-4 px-1 text-[11px] text-neutral-400"
          >
            {{ t('workflow.runLabel') }}:
            <span class="font-medium text-neutral-600">{{ run.runStatus.value }}</span>
            <span v-if="run.runError.value" class="ml-1 text-rose-500">· {{ run.runError.value }}</span>
          </p>
        </div>
      </div>
    </div>

    <WorkflowHistoryDrawer
      :open="historyOpen"
      :versions="versions"
      :current-version-id="latestVersion?.id ?? null"
      :selected-version-id="selectedVersionId"
      :loading="loadingHistory"
      @close="toggleHistory"
      @select="onSelectVersion"
      @revert="onRequestRevert"
    />

    <WorkflowRevertModal
      v-model:open="revertModalOpen"
      :version="revertTarget?.version ?? 0"
      :submitting="reverting"
      @confirm="onConfirmRevert"
    />
  </div>
</template>
