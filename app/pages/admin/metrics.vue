<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Live server metrics — ported from the console's metrics page, restyled for
// web's light admin shell. Data is purely WebSocket-driven: useMetricsStream()
// opens WS /admin/metrics/stream straight to the Go backend (JWT in the query
// string) and pushes a Snapshot frame ~1 Hz. A shallowRef circular history
// buffer keeps 4 hours of frames; computed series derive time-windowed Point
// arrays for the inline SVG charts (AdminMetricChart). English-only internal
// tooling, gated by the admin auth + maintainer middleware.

import { shallowRef, triggerRef } from 'vue'
import type {
  HTTPSubjectStats,
  InstanceSummary,
  LLMModelStats,
  LLMSubjectStats,
  SessionEntry,
} from '~/composables/account/useMetricsStream'

const { snapshot, connected, error } = useMetricsStream()

// Maintainer probe — same pattern as the other admin pages. Non-maintainers
// see a notice instead of the metrics surface; the WS handshake to Go would
// reject them anyway, but this keeps the UI honest.
const forbidden = ref(false)
onMounted(async () => {
  try {
    const me = await adminFetch<{ isMaintainer: boolean }>('/api/admin/me')
    forbidden.value = !me.isMaintainer
  }
  catch {
    forbidden.value = true
  }
})

const llmModels = computed<LLMModelStats[]>(() =>
  [...(snapshot.value?.llm.by_model ?? [])].sort((a, b) => b.calls - a.calls),
)
const sessions = computed<SessionEntry[]>(() =>
  [...(snapshot.value?.sessions.entries ?? [])].sort(
    (a, b) => (a.uptime_sec ?? 0) - (b.uptime_sec ?? 0),
  ),
)

interface HistoryFrame {
  ts: number
  sysMemUsed: number
  cpu: number
  goroutines: number
  sessions: number
  gpuUtil: number[]
  gpuMem: number[]
  bytesIn: number
  bytesOut: number
}

interface Point { t: number, v: number }

const HISTORY_MAX_AGE_MS = 4 * 60 * 60 * 1000
// shallowRef: we mutate the frame array in place (push + shift each second).
// Deep reactivity over a ~14k-frame array would walk the proxy tree on every
// chart re-derivation; shallowRef + an explicit triggerRef is ~free.
const history = shallowRef<HistoryFrame[]>([])

watch(snapshot, (s) => {
  if (!s) return
  const ts = (s.ts ? new Date(s.ts).getTime() : Number.NaN) || Date.now()
  let bytesIn = 0
  let bytesOut = 0
  for (const r of s.http?.routes ?? []) {
    bytesIn += r.bytes_in ?? 0
    bytesOut += r.bytes_out ?? 0
  }
  history.value.push({
    ts,
    sysMemUsed: s.server.sys_mem_used_mb ?? 0,
    cpu: s.server.cpu_pct,
    goroutines: s.server.goroutines,
    sessions: s.sessions?.total ?? 0,
    gpuUtil: (s.gpu?.devices ?? []).map(d => d.util_pct),
    gpuMem: (s.gpu?.devices ?? []).map(d => d.mem_used_mb),
    bytesIn,
    bytesOut,
  })
  const cutoff = ts - HISTORY_MAX_AGE_MS
  while (history.value.length && history.value[0]!.ts < cutoff) {
    history.value.shift()
  }
  triggerRef(history)
})

const periodOptions = [
  { value: 5, label: '5m' },
  { value: 10, label: '10m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 0, label: 'All' },
]
const period = ref<number>(10)
const periodMs = computed(() => (period.value > 0 ? period.value * 60_000 : 0))

const sysMemUsedSeries = computed<Point[]>(() =>
  history.value.map(h => ({ t: h.ts, v: h.sysMemUsed })),
)
const sysMemTotal = computed<number | undefined>(() => {
  const t = snapshot.value?.server.sys_mem_total_mb
  return t && t > 0 ? t : undefined
})
const cpuSeries = computed<Point[]>(() => history.value.map(h => ({ t: h.ts, v: h.cpu })))
const sessionsSeries = computed<Point[]>(() =>
  history.value.map(h => ({ t: h.ts, v: h.sessions })),
)
const goroutinesSeries = computed<Point[]>(() =>
  history.value.map(h => ({ t: h.ts, v: h.goroutines })),
)
const gpuDeviceCount = computed(() => snapshot.value?.gpu?.devices?.length ?? 0)
const gpuUtilSeries = computed<Point[][]>(() => {
  const n = gpuDeviceCount.value
  return Array.from({ length: n }, (_, i) =>
    history.value.map(h => ({ t: h.ts, v: h.gpuUtil[i] ?? 0 })),
  )
})
const gpuMemSeries = computed<Point[][]>(() => {
  const n = gpuDeviceCount.value
  return Array.from({ length: n }, (_, i) =>
    history.value.map(h => ({ t: h.ts, v: h.gpuMem[i] ?? 0 })),
  )
})

function rateSeries(get: (f: HistoryFrame) => number): Point[] {
  const out: Point[] = []
  const frames = history.value
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!
    const b = frames[i]!
    const dt = (b.ts - a.ts) / 1000
    if (dt <= 0) continue
    const delta = Math.max(0, get(b) - get(a))
    out.push({ t: b.ts, v: delta / dt })
  }
  return out
}
const bytesInRateSeries = computed<Point[]>(() => rateSeries(f => f.bytesIn))
const bytesOutRateSeries = computed<Point[]>(() => rateSeries(f => f.bytesOut))

function pickRateUnit(maxBps: number): { factor: number, unit: string } {
  if (maxBps < 1024) return { factor: 1, unit: 'B/s' }
  if (maxBps < 1024 * 1024) return { factor: 1024, unit: 'KB/s' }
  if (maxBps < 1024 * 1024 * 1024) return { factor: 1024 * 1024, unit: 'MB/s' }
  return { factor: 1024 * 1024 * 1024, unit: 'GB/s' }
}
function maxV(pts: Point[]): number {
  let m = 0
  for (const p of pts) if (p.v > m) m = p.v
  return m
}
function scaledSeries(pts: Point[], factor: number): Point[] {
  if (factor === 1) return pts
  return pts.map(p => ({ t: p.t, v: p.v / factor }))
}
const bytesInScale = computed(() => pickRateUnit(maxV(bytesInRateSeries.value)))
const bytesOutScale = computed(() => pickRateUnit(maxV(bytesOutRateSeries.value)))
const bytesInDisplay = computed<Point[]>(() =>
  scaledSeries(bytesInRateSeries.value, bytesInScale.value.factor),
)
const bytesOutDisplay = computed<Point[]>(() =>
  scaledSeries(bytesOutRateSeries.value, bytesOutScale.value.factor),
)

const selectedModelKey = ref<string | null>(null)
const selectedSessionId = ref<string | null>(null)

// Resolve selection through the current snapshot so the modal updates live
// without the click handler racing a watcher that could null the selection.
const selectedModel = computed<LLMModelStats | null>(() => {
  const k = selectedModelKey.value
  if (!k) return null
  return snapshot.value?.llm.by_model.find(r => r.model === k) ?? null
})
const selectedSession = computed<SessionEntry | null>(() => {
  const id = selectedSessionId.value
  if (!id) return null
  return snapshot.value?.sessions.entries.find(r => r.id === id) ?? null
})

const sessionLLM = computed<LLMSubjectStats | null>(() => {
  const id = selectedSessionId.value
  if (!id) return null
  return snapshot.value?.llm.by_session.find(r => r.session_id === id) ?? null
})
const sessionHTTP = computed<HTTPSubjectStats | null>(() => {
  const id = selectedSessionId.value
  if (!id) return null
  return snapshot.value?.http.by_session.find(r => r.session_id === id) ?? null
})

const instances = computed<InstanceSummary[]>(() => snapshot.value?.instances ?? [])

function gpuDeviceTitle(i: number): string {
  const d = snapshot.value?.gpu?.devices?.[i]
  if (d?.name) return d.name
  return `GPU#${i}`
}

function gpuMemTotal(i: number): number | undefined {
  const total = snapshot.value?.gpu?.devices?.[i]?.mem_total_mb
  return total && total > 0 ? total : undefined
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtUptime(s: number | undefined): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  if (m < 60) return `${m}m ${sec}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const statusLabel = computed(() => {
  if (connected.value) return 'live'
  if (snapshot.value) return 'reconnecting…'
  return error.value ?? 'connecting…'
})
const statusColor = computed(() => {
  if (connected.value) return 'bg-green-500'
  if (snapshot.value) return 'bg-amber-500'
  return 'bg-red-500'
})

function closeModel() {
  selectedModelKey.value = null
}
function closeSession() {
  selectedSessionId.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selectedModelKey.value) closeModel()
    else if (selectedSessionId.value) closeSession()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <!-- Header -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Metrics</h1>
        <p class="text-label-md text-neutral-500">Maintainer-only · live server, LLM, and session telemetry.</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-2 text-label-md text-neutral-500">
          <span class="size-2 rounded-full" :class="statusColor" />
          <span class="font-mono">{{ statusLabel }}</span>
        </span>
        <select
          v-model.number="period"
          class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-body-md text-neutral-700 outline-none focus:border-neutral-400"
        >
          <option v-for="o in periodOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
    </header>

    <!-- Body -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="forbidden" class="flex h-full flex-col items-center justify-center text-center">
        <UIcon name="i-heroicons-lock-closed-20-solid" class="mb-3 size-10 text-neutral-300" />
        <p class="text-body-md font-medium text-neutral-600">Maintainers only</p>
        <p class="mt-1 text-label-md text-neutral-500">Your account isn't on the maintainers list.</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Overall -->
        <section>
          <div class="mb-2 flex items-baseline gap-2">
            <h2 class="text-sm font-semibold text-neutral-950">Overall</h2>
            <span v-if="!history.length" class="text-label-md text-neutral-400">awaiting data…</span>
          </div>

          <!-- Instance summary badges (only when a fleet) -->
          <div
            v-if="instances.length > 1"
            class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2"
          >
            <span class="text-label-md font-medium uppercase tracking-wide text-neutral-400">
              Instances ({{ instances.length }})
            </span>
            <span
              v-for="inst in instances"
              :key="inst.instance_id"
              class="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-label-md"
              :title="`${inst.instance_id} · v${inst.version} · uptime ${fmtUptime(inst.server.uptime_sec)}`"
            >
              <span class="size-1.5 rounded-full" :class="inst.healthy ? 'bg-green-500' : 'bg-red-500'" />
              <span :class="inst.healthy ? 'text-neutral-700' : 'text-neutral-400 line-through'">
                {{ inst.hostname || inst.instance_id }}
              </span>
            </span>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AdminMetricChart
              title="Memory"
              unit="MB"
              :points="sysMemUsedSeries"
              :window-ms="periodMs"
              :max-value="sysMemTotal"
              :reference-value="sysMemTotal"
              integer
            />
            <AdminMetricChart
              title="CPU"
              unit="%"
              :points="cpuSeries"
              :window-ms="periodMs"
              :max-value="100"
            />
            <AdminMetricChart
              title="Bandwidth in"
              :unit="bytesInScale.unit"
              :points="bytesInDisplay"
              :window-ms="periodMs"
            />
            <AdminMetricChart
              title="Bandwidth out"
              :unit="bytesOutScale.unit"
              :points="bytesOutDisplay"
              :window-ms="periodMs"
            />
            <template v-if="gpuDeviceCount > 0">
              <template v-for="(series, i) in gpuUtilSeries" :key="`gpu-util-${i}`">
                <AdminMetricChart
                  :title="`GPU util (${gpuDeviceTitle(i)})`"
                  unit="%"
                  :points="series"
                  :window-ms="periodMs"
                  :max-value="100"
                />
                <AdminMetricChart
                  :title="`GPU mem (${gpuDeviceTitle(i)})`"
                  unit="MB"
                  :points="gpuMemSeries[i] ?? []"
                  :window-ms="periodMs"
                  :max-value="gpuMemTotal(i)"
                  :reference-value="gpuMemTotal(i)"
                  integer
                />
              </template>
            </template>
            <AdminMetricChart
              title="Sessions"
              :points="sessionsSeries"
              :window-ms="periodMs"
              integer
            />
            <AdminMetricChart
              title="Goroutines"
              :points="goroutinesSeries"
              :window-ms="periodMs"
              integer
            />
          </div>
        </section>

        <!-- LLM by Model -->
        <section>
          <h2 class="mb-2 text-sm font-semibold text-neutral-950">
            LLM by Model <span class="font-normal text-neutral-400">({{ llmModels.length }})</span>
          </h2>
          <div class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table class="w-full text-left text-body-md">
              <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
                <tr>
                  <th class="px-4 py-2.5 font-medium">Model</th>
                  <th class="px-4 py-2.5 text-right font-medium">Calls</th>
                  <th class="px-4 py-2.5 text-right font-medium">In tok</th>
                  <th class="px-4 py-2.5 text-right font-medium">Out tok</th>
                  <th class="px-4 py-2.5 text-right font-medium">Cache R</th>
                  <th class="px-4 py-2.5 text-right font-medium">Hit %</th>
                  <th class="px-4 py-2.5 text-right font-medium">p99 ms</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in llmModels"
                  :key="r.model"
                  class="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  :class="selectedModelKey === r.model ? 'bg-blue-50/60' : ''"
                  @click="selectedModelKey = r.model"
                >
                  <td class="px-4 py-2.5 font-mono text-neutral-950">{{ r.model }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.calls.toLocaleString() }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.input.toLocaleString() }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.output.toLocaleString() }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.cache_read.toLocaleString() }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ (r.cache_hit_rate * 100).toFixed(1) }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.p99_ms.toFixed(0) }}</td>
                </tr>
                <tr v-if="llmModels.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-neutral-400">No LLM calls yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Active Sessions -->
        <section>
          <h2 class="mb-2 text-sm font-semibold text-neutral-950">
            Active Sessions <span class="font-normal text-neutral-400">({{ sessions.length }})</span>
          </h2>
          <div class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table class="w-full text-left text-body-md">
              <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
                <tr>
                  <th class="px-4 py-2.5 font-medium">Session</th>
                  <th class="px-4 py-2.5 font-medium">User</th>
                  <th class="px-4 py-2.5 text-right font-medium">Uptime</th>
                  <th class="px-4 py-2.5 text-right font-medium">Idle</th>
                  <th class="px-4 py-2.5 text-right font-medium">Agents</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in sessions"
                  :key="r.id"
                  class="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  :class="selectedSessionId === r.id ? 'bg-blue-50/60' : ''"
                  @click="selectedSessionId = r.id"
                >
                  <td class="px-4 py-2.5 font-mono text-neutral-950">{{ r.id?.slice(0, 12) ?? '' }}</td>
                  <td class="px-4 py-2.5 font-mono text-neutral-700">{{ r.user_id?.slice(0, 12) || '—' }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ fmtUptime(r.uptime_sec) }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ fmtUptime(r.idle_sec) }}</td>
                  <td class="px-4 py-2.5 text-right font-mono text-neutral-700">{{ r.browser_agents }}</td>
                </tr>
                <tr v-if="sessions.length === 0">
                  <td colspan="5" class="px-4 py-8 text-center text-neutral-400">No live sessions.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- LLM model detail modal -->
    <div
      v-if="selectedModelKey"
      class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      @click.self="closeModel"
    >
      <div class="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <h2 class="min-w-0 truncate font-mono text-base font-semibold text-neutral-950">
            {{ selectedModel?.model ?? selectedModelKey }}
          </h2>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="closeModel">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <dl v-if="selectedModel" class="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 font-mono text-body-md">
            <dt class="text-neutral-400">Calls</dt>
            <dd class="text-neutral-950">{{ selectedModel.calls.toLocaleString() }}</dd>
            <dt class="text-neutral-400">Input tokens</dt>
            <dd class="text-neutral-950">{{ selectedModel.input.toLocaleString() }}</dd>
            <dt class="text-neutral-400">Output tokens</dt>
            <dd class="text-neutral-950">{{ selectedModel.output.toLocaleString() }}</dd>
            <dt class="text-neutral-400">Cache read</dt>
            <dd class="text-neutral-950">{{ selectedModel.cache_read.toLocaleString() }}</dd>
            <dt class="text-neutral-400">Cache create</dt>
            <dd class="text-neutral-950">{{ selectedModel.cache_create.toLocaleString() }}</dd>
            <dt class="text-neutral-400">Cache hit rate</dt>
            <dd class="text-neutral-950">{{ (selectedModel.cache_hit_rate * 100).toFixed(2) }}%</dd>
            <dt class="text-neutral-400">Latency p50</dt>
            <dd class="text-neutral-950">{{ selectedModel.p50_ms.toFixed(1) }} ms</dd>
            <dt class="text-neutral-400">Latency p99</dt>
            <dd class="text-neutral-950">{{ selectedModel.p99_ms.toFixed(1) }} ms</dd>
          </dl>
          <p v-else class="font-mono text-body-md text-neutral-400">Model no longer reporting.</p>
        </div>
        <div class="flex items-center justify-end border-t border-neutral-100 p-4">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400"
            @click="closeModel"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Session detail modal -->
    <div
      v-if="selectedSessionId"
      class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      @click.self="closeSession"
    >
      <div class="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <h2 class="min-w-0 truncate font-mono text-base font-semibold text-neutral-950">
            Session {{ selectedSessionId.slice(0, 12) }}
          </h2>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="closeSession">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <dl v-if="selectedSession" class="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 font-mono text-body-md">
            <dt class="text-neutral-400">Session ID</dt>
            <dd class="break-all text-neutral-950">{{ selectedSession.id }}</dd>
            <dt class="text-neutral-400">User ID</dt>
            <dd class="break-all text-neutral-950">{{ selectedSession.user_id || '—' }}</dd>
            <dt class="text-neutral-400">Uptime</dt>
            <dd class="text-neutral-950">{{ fmtUptime(selectedSession.uptime_sec) }}</dd>
            <dt class="text-neutral-400">Idle</dt>
            <dd class="text-neutral-950">{{ fmtUptime(selectedSession.idle_sec) }}</dd>
            <dt class="text-neutral-400">Browser agents</dt>
            <dd class="text-neutral-950">{{ selectedSession.browser_agents }}</dd>

            <dt class="col-span-2 pt-2 text-label-md uppercase tracking-wide text-neutral-400">HTTP</dt>
            <dt class="text-neutral-400">Requests</dt>
            <dd class="text-neutral-950">{{ (sessionHTTP?.req ?? 0).toLocaleString() }}</dd>
            <dt class="text-neutral-400">RPS (1m)</dt>
            <dd class="text-neutral-950">{{ (sessionHTTP?.rate_1m_rps ?? 0).toFixed(3) }}</dd>
            <dt class="text-neutral-400">Bytes in</dt>
            <dd class="text-neutral-950">{{ fmtBytes(sessionHTTP?.bytes_in) }}</dd>
            <dt class="text-neutral-400">Bytes out</dt>
            <dd class="text-neutral-950">{{ fmtBytes(sessionHTTP?.bytes_out) }}</dd>

            <dt class="col-span-2 pt-2 text-label-md uppercase tracking-wide text-neutral-400">LLM</dt>
            <dt class="text-neutral-400">Calls</dt>
            <dd class="text-neutral-950">{{ (sessionLLM?.calls ?? 0).toLocaleString() }}</dd>
            <dt class="text-neutral-400">Input tokens</dt>
            <dd class="text-neutral-950">{{ (sessionLLM?.input ?? 0).toLocaleString() }}</dd>
            <dt class="text-neutral-400">Output tokens</dt>
            <dd class="text-neutral-950">{{ (sessionLLM?.output ?? 0).toLocaleString() }}</dd>
            <dt class="text-neutral-400">Cache read</dt>
            <dd class="text-neutral-950">{{ (sessionLLM?.cache_read ?? 0).toLocaleString() }}</dd>
            <dt class="text-neutral-400">Cache create</dt>
            <dd class="text-neutral-950">{{ (sessionLLM?.cache_create ?? 0).toLocaleString() }}</dd>
          </dl>
          <p v-else class="font-mono text-body-md text-neutral-400">Session ended.</p>
        </div>
        <div class="flex items-center justify-end border-t border-neutral-100 p-4">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400"
            @click="closeSession"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
