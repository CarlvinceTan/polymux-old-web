<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Benchmarks — ported from the console's benchmarks.vue into the web admin
// shell. Launches and inspects browser-agent benchmark runs against the Go
// backend (/admin/bench*). All data is Go-backed and flows through the
// web→Go bridge (useAdminGo); no Supabase web endpoints are needed. Split
// layout: a runs list on the left, a selected run's detail on the right.
// There's no live polling — abort and create trigger a manual refresh.

interface BenchRun {
  id: string
  workspace_id?: string
  created_by: string
  status: string
  mode: string
  parallel: number
  retries: number
  timeout_seconds: number
  rpm?: number | null
  started_at?: string
  completed_at?: string
  summary?: unknown
  error?: string
  created_at: string
}

interface BenchResult {
  id: string
  run_id: string
  idx: number
  prompt: string
  attempt: number
  pass: boolean
  duration_ms?: number
  spawned_count?: number
  reply_bytes?: number
  reply_tail?: string
  error?: string
  created_at: string
}

interface RunDetail {
  run: BenchRun
  results: BenchResult[]
}

interface BenchSummary { pass?: number, fail?: number, total?: number }

const go = useAdminGo()

const runs = ref<BenchRun[]>([])
const selectedId = ref<string | null>(null)
const detail = ref<RunDetail | null>(null)
const loading = ref(false)
const detailLoading = ref(false)
const forbidden = ref(false)
const loadError = ref('')
const detailError = ref('')
const creating = ref(false)
const aborting = ref(false)
const showCreate = ref(false)
const toast = ref('')

// new-run form
const newMode = ref<'single' | 'multi' | 'all'>('single')
const newParallel = ref(2)
const newRetries = ref(0)
const newTimeout = ref(600)
const newPrompts = ref('')

const MODES = ['single', 'multi', 'all'] as const

// Newest first. Sort by created_at so legacy non-ULID IDs still order right.
const sortedRuns = computed(() =>
  [...runs.value].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
)

const STATUS_META: Record<string, { label: string, dot: string, pill: string }> = {
  queued: { label: 'Queued', dot: 'bg-neutral-400', pill: 'bg-neutral-100 text-neutral-600' },
  running: { label: 'Running', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  aborted: { label: 'Aborted', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
}
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s || 'Unknown', dot: 'bg-neutral-300', pill: 'bg-neutral-100 text-neutral-500' }
}

const canAbort = computed(() =>
  detail.value != null
  && (detail.value.run.status === 'queued' || detail.value.run.status === 'running'),
)

function flash(m: string) {
  toast.value = m
  setTimeout(() => { if (toast.value === m) toast.value = '' }, 2500)
}
function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.data?.error || e?.statusMessage || e?.message || 'Request failed'
}
function isForbidden(e: any): boolean {
  return e?.statusCode === 403 || e?.response?.status === 403
}

function fmtSummary(s: unknown): string {
  const o = (s ?? {}) as BenchSummary
  if (o.total == null) return '—'
  return `${o.pass ?? 0}/${o.total}`
}

// "MM-DD HH:mm" fixed-width, for table cells.
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "Mon DD, HH:mm" for detail rows where width isn't a constraint.
function fmtDateTimeLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${pad(d.getDate())}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortId(id: string) {
  return id ? id.slice(0, 8) : ''
}
function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

async function loadRuns() {
  loading.value = true
  forbidden.value = false
  loadError.value = ''
  try {
    runs.value = await go.call<BenchRun[]>('/bench')
  }
  catch (e: any) {
    if (isForbidden(e)) forbidden.value = true
    else loadError.value = errMsg(e)
    runs.value = []
  }
  finally {
    loading.value = false
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true
  detailError.value = ''
  selectedId.value = id
  detail.value = null
  try {
    detail.value = await go.call<RunDetail>(`/bench/${id}`)
  }
  catch (e: any) {
    detailError.value = errMsg(e)
  }
  finally {
    detailLoading.value = false
  }
}

async function createRun() {
  if (creating.value) return
  const prompts = newPrompts.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
  if (prompts.length === 0) {
    loadError.value = 'Provide at least one prompt (one per line).'
    return
  }
  const parallel = Math.min(8, Math.max(1, Math.round(newParallel.value) || 1))
  const retries = Math.min(3, Math.max(0, Math.round(newRetries.value) || 0))
  const timeout = Math.max(1, Math.round(newTimeout.value) || 600)

  creating.value = true
  loadError.value = ''
  try {
    const created = await go.call<BenchRun>('/bench', {
      method: 'POST',
      body: {
        mode: newMode.value,
        parallel,
        retries,
        timeout_seconds: timeout,
        prompts,
      },
    })
    showCreate.value = false
    newPrompts.value = ''
    flash('Run started')
    await loadRuns()
    if (created?.id) await loadDetail(created.id)
  }
  catch (e: any) {
    loadError.value = errMsg(e)
  }
  finally {
    creating.value = false
  }
}

async function abortRun() {
  if (!selectedId.value || aborting.value) return
  aborting.value = true
  try {
    await go.call(`/bench/${selectedId.value}/abort`, { method: 'POST' })
    flash('Abort requested')
    await loadDetail(selectedId.value)
    await loadRuns()
  }
  catch (e: any) {
    detailError.value = errMsg(e)
  }
  finally {
    aborting.value = false
  }
}

onMounted(loadRuns)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <!-- Header -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Benchmarks</h1>
        <p class="text-label-md text-neutral-500">Launch and inspect browser-agent benchmark runs against the backend.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
          @click="showCreate = !showCreate"
        >
          {{ showCreate ? 'Cancel' : 'New run' }}
        </button>
        <button
          type="button"
          class="h-9 rounded-lg bg-neutral-950 px-4 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          :disabled="loading"
          @click="loadRuns"
        >
          Refresh
        </button>
      </div>
    </header>

    <p v-if="loadError" class="mb-3 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ loadError }}</p>

    <div v-if="forbidden" class="flex flex-1 items-center justify-center py-16 text-center text-body-md text-neutral-500">
      Maintainers only.
    </div>

    <!-- Split body -->
    <div v-else class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
      <!-- Runs pane -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-150 bg-neutral-50/60 px-4 py-2.5">
          <span class="text-label-md font-semibold uppercase tracking-wide text-neutral-400">Runs ({{ runs.length }})</span>
        </div>

        <!-- create form -->
        <div v-if="showCreate" class="shrink-0 space-y-3 border-b border-neutral-150 p-4">
          <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5">
            <label class="text-label-md text-neutral-500">Mode</label>
            <select
              v-model="newMode"
              class="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
              <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
            </select>

            <label class="text-label-md text-neutral-500">Parallel</label>
            <input
              v-model.number="newParallel"
              type="number"
              min="1"
              max="8"
              class="w-24 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md tabular-nums text-neutral-950 outline-none focus:border-neutral-400"
            >

            <label class="text-label-md text-neutral-500">Retries</label>
            <input
              v-model.number="newRetries"
              type="number"
              min="0"
              max="3"
              class="w-24 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md tabular-nums text-neutral-950 outline-none focus:border-neutral-400"
            >

            <label class="text-label-md text-neutral-500">Timeout (s)</label>
            <input
              v-model.number="newTimeout"
              type="number"
              min="1"
              class="w-24 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md tabular-nums text-neutral-950 outline-none focus:border-neutral-400"
            >

            <label class="self-start pt-1 text-label-md text-neutral-500">
              Prompts
              <span class="block text-neutral-400">one per line</span>
            </label>
            <textarea
              v-model="newPrompts"
              rows="5"
              placeholder="Open example.com and read the title&#10;Search for cats"
              class="resize-y rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-label-md text-neutral-950 outline-none focus:border-neutral-400"
            />
          </div>
          <button
            type="button"
            class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            :disabled="creating"
            @click="createRun"
          >
            {{ creating ? 'Starting…' : 'Start run' }}
          </button>
        </div>

        <!-- runs list -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="loading" class="py-12 text-center text-body-md text-neutral-400">Loading…</div>
          <div v-else-if="sortedRuns.length === 0" class="py-12 text-center text-body-md text-neutral-500">No benchmark runs.</div>
          <table v-else class="w-full text-left text-body-md">
            <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
              <tr>
                <th class="px-4 py-2 font-medium">ID</th>
                <th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium">Mode</th>
                <th class="px-4 py-2 text-right font-medium">Par</th>
                <th class="px-4 py-2 text-right font-medium">Pass</th>
                <th class="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in sortedRuns"
                :key="r.id"
                class="cursor-pointer border-b border-neutral-100 last:border-0 transition-colors"
                :class="r.id === selectedId ? 'bg-neutral-100' : 'hover:bg-neutral-50'"
                @click="loadDetail(r.id)"
              >
                <td class="px-4 py-2 font-mono text-neutral-700">{{ shortId(r.id) }}</td>
                <td class="px-4 py-2">
                  <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium" :class="statusMeta(r.status).pill">
                    <span class="size-1.5 rounded-full" :class="statusMeta(r.status).dot" />
                    {{ statusMeta(r.status).label }}
                  </span>
                </td>
                <td class="px-4 py-2 font-mono text-neutral-600">{{ r.mode }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-neutral-600">{{ r.parallel }}</td>
                <td class="px-4 py-2 text-right font-mono tabular-nums text-neutral-700">{{ fmtSummary(r.summary) }}</td>
                <td class="px-4 py-2 whitespace-nowrap font-mono text-neutral-500">{{ fmtDateTime(r.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Run detail pane -->
      <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-150 bg-neutral-50/60 px-4 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-label-md font-semibold uppercase tracking-wide text-neutral-400">
              {{ detail ? `Run ${shortId(detail.run.id)}` : 'Run detail' }}
            </p>
            <p v-if="detail" class="truncate text-label-md text-neutral-500">
              {{ statusMeta(detail.run.status).label }} · {{ fmtSummary(detail.run.summary) }} passed
            </p>
          </div>
          <button
            v-if="canAbort"
            type="button"
            class="shrink-0 rounded-lg px-3 py-1.5 text-body-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
            :disabled="aborting"
            @click="abortRun"
          >
            {{ aborting ? 'Aborting…' : 'Abort' }}
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="detailError" class="m-4 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ detailError }}</div>
          <div v-else-if="detailLoading" class="py-12 text-center text-body-md text-neutral-400">Loading…</div>
          <div v-else-if="!detail" class="flex h-full items-center justify-center py-16 text-center text-body-md text-neutral-400">
            Select a run to inspect.
          </div>
          <div v-else>
            <!-- metadata -->
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-neutral-150 p-4 text-body-md sm:grid-cols-4">
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Status</dt>
                <dd class="mt-0.5">
                  <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium" :class="statusMeta(detail.run.status).pill">
                    <span class="size-1.5 rounded-full" :class="statusMeta(detail.run.status).dot" />
                    {{ statusMeta(detail.run.status).label }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Mode</dt>
                <dd class="mt-0.5 font-mono text-neutral-700">{{ detail.run.mode }}</dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Parallel</dt>
                <dd class="mt-0.5 tabular-nums text-neutral-700">{{ detail.run.parallel }}</dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Retries</dt>
                <dd class="mt-0.5 tabular-nums text-neutral-700">{{ detail.run.retries }}</dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Timeout</dt>
                <dd class="mt-0.5 tabular-nums text-neutral-700">{{ detail.run.timeout_seconds }}s</dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Started</dt>
                <dd class="mt-0.5 text-neutral-700">{{ fmtDateTimeLong(detail.run.started_at) }}</dd>
              </div>
              <div>
                <dt class="text-label-md uppercase tracking-wide text-neutral-400">Completed</dt>
                <dd class="mt-0.5 text-neutral-700">{{ fmtDateTimeLong(detail.run.completed_at) }}</dd>
              </div>
              <div v-if="detail.run.error" class="col-span-2 sm:col-span-4">
                <dt class="text-label-md uppercase tracking-wide text-red-500">Error</dt>
                <dd class="mt-0.5 whitespace-pre-wrap text-red-700">{{ detail.run.error }}</dd>
              </div>
            </dl>

            <!-- results -->
            <div v-if="detail.results.length === 0" class="py-12 text-center text-body-md text-neutral-500">No results yet.</div>
            <table v-else class="w-full text-left text-body-md">
              <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
                <tr>
                  <th class="px-4 py-2 text-right font-medium">#</th>
                  <th class="px-4 py-2 text-right font-medium">Att</th>
                  <th class="px-4 py-2 font-medium">Pass</th>
                  <th class="px-4 py-2 text-right font-medium">Dur ms</th>
                  <th class="px-4 py-2 text-right font-medium">Spawn</th>
                  <th class="px-4 py-2 font-medium">Prompt</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="res in detail.results" :key="res.id" class="border-b border-neutral-100 last:border-0">
                  <td class="px-4 py-2 text-right font-mono tabular-nums text-neutral-500">{{ res.idx }}</td>
                  <td class="px-4 py-2 text-right font-mono tabular-nums text-neutral-500">{{ res.attempt }}</td>
                  <td class="px-4 py-2">
                    <span
                      class="inline-flex items-center rounded-md px-1.5 py-0.5 text-label-md font-medium"
                      :class="res.pass ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
                    >
                      {{ res.pass ? 'pass' : 'fail' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-right font-mono tabular-nums text-neutral-600">{{ res.duration_ms ?? '—' }}</td>
                  <td class="px-4 py-2 text-right font-mono tabular-nums text-neutral-600">{{ res.spawned_count ?? 0 }}</td>
                  <td class="px-4 py-2 text-neutral-700" :title="res.prompt">{{ truncate(res.prompt, 80) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
