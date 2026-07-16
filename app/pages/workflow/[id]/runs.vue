<script setup lang="ts">
import type { WorkflowRun } from '~/composables/workflows/useWorkflows'
import type { FlowCheckResultRow } from '~~/server/api/workspaces/[id]/flows/[flowId]/runs/[runId]/check-results/index.get'

const flowId = inject<Ref<string>>('workflow-id')!
const workspaceId = inject(
  'workflow-workspace-id',
  computed(() => ''),
) as ComputedRef<string>

const { listRuns } = useWorkflows()
const route = useRoute()

const runs = ref<WorkflowRun[]>([])
const checkResults = ref<Record<string, FlowCheckResultRow[]>>({})
const loading = ref(false)

async function refresh() {
  if (!workspaceId.value || !flowId.value) return
  loading.value = true
  try {
    runs.value = await listRuns(workspaceId.value, flowId.value)
    const entries = await Promise.all(runs.value.map(async (run) => {
      try {
        const res = await $fetch<{ check_results: FlowCheckResultRow[] }>(
          `/api/workspaces/${workspaceId.value}/flows/${flowId.value}/runs/${run.id}/check-results`,
        )
        return [run.id, res.check_results ?? []] as const
      }
      catch {
        return [run.id, []] as const
      }
    }))
    checkResults.value = Object.fromEntries(entries)
  }
  finally {
    loading.value = false
  }
}

onMounted(refresh)
watch([workspaceId, flowId], refresh)

function triggerLabel(run: WorkflowRun): string {
  switch (run.trigger) {
    case 'schedule': return 'Schedule'
    case 'integration': return 'Integration'
    case 'webhook': return 'Webhook'
    default: return 'Manual'
  }
}

function statusTone(status: string): string {
  if (['succeeded', 'completed', 'passed'].includes(status)) return 'bg-emerald-50 text-emerald-700'
  if (['failed', 'cancelled', 'expired'].includes(status)) return 'bg-red-50 text-red-700'
  if (status === 'running') return 'bg-blue-50 text-blue-700'
  return 'bg-neutral-100 text-neutral-600'
}

function fmtDate(value?: string): string {
  if (!value) return 'Not started'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function nodeCount(run: WorkflowRun): number {
  return Object.keys(run.node_states ?? {}).length
}

function checkSummary(run: WorkflowRun): string {
  const results = checkResults.value[run.id] ?? []
  if (!results.length) return 'No check results yet'
  const passed = results.filter(r => r.status === 'passed' || r.status === 'approved').length
  const failed = results.filter(r => r.status === 'failed' || r.status === 'rejected').length
  const review = results.filter(r => r.status === 'changed' || r.status === 'needs_review').length
  return `${passed} passed · ${failed} failed · ${review} review`
}

const artifactHref = computed(() => `/workflow/${route.params.id}/artifacts`)
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-4">
      <div class="mb-3 flex items-center justify-between">
        <div>
          <h2 class="text-body-lg font-semibold text-neutral-950">Runs</h2>
          <p class="text-caption text-neutral-500">Execution history, trigger source, checks, and evidence.</p>
        </div>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-caption font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
          @click="refresh"
        >
          <UIcon name="i-heroicons-arrow-path" class="size-3.5" />
          Refresh
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div class="grid grid-cols-[1.1fr_110px_110px_110px_1fr_100px] border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500">
          <div>Run</div>
          <div>Trigger</div>
          <div>Status</div>
          <div>Started</div>
          <div>Checks</div>
          <div class="text-right">Evidence</div>
        </div>

        <div v-if="loading" class="p-4 text-body-md text-neutral-500">Loading runs…</div>
        <div v-else-if="!runs.length" class="flex h-52 flex-col items-center justify-center gap-1.5 text-center">
          <UIcon name="i-heroicons-play-circle" class="size-6 text-neutral-300" />
          <div class="text-body-md font-medium text-neutral-800">No runs yet</div>
          <div class="text-caption text-neutral-500">Manual and automated Flow runs will appear here.</div>
        </div>

        <div v-else class="scrollbar-hide max-h-full overflow-y-auto">
          <div
            v-for="run in runs"
            :key="run.id"
            class="grid grid-cols-[1.1fr_110px_110px_110px_1fr_100px] items-center gap-0 border-b border-neutral-100 px-3 py-2 last:border-b-0"
          >
            <div class="min-w-0">
              <div class="truncate font-mono text-caption font-semibold text-neutral-900">{{ run.id.slice(0, 8) }}</div>
              <div class="truncate text-2xs text-neutral-500">{{ run.workflow_version_id ? `Version ${run.workflow_version_id.slice(0, 8)}` : 'Inline draft run' }}</div>
            </div>
            <div class="text-caption text-neutral-700">{{ triggerLabel(run) }}</div>
            <div>
              <span class="rounded-full px-2 py-0.5 text-2xs font-semibold" :class="statusTone(run.status)">
                {{ run.status }}
              </span>
            </div>
            <div class="text-caption text-neutral-600">{{ fmtDate(run.started_at || run.scheduled_for) }}</div>
            <div class="text-caption text-neutral-600">
              {{ nodeCount(run) }} node updates
              <span class="text-neutral-400"> · {{ checkSummary(run) }}</span>
            </div>
            <NuxtLink :to="artifactHref" class="justify-self-end text-caption font-medium text-neutral-700 hover:text-neutral-950">
              Artifacts
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </TabPanel>
</template>
