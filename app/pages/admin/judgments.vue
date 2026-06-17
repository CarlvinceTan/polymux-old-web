<script setup lang="ts">
import { workflowTimeWindow, posthogReplayUrl } from '~/utils/workflowLinks'

definePageMeta({ layout: 'admin' })

// Judgment review queue — the core of the console's data.vue, ported to the web
// admin shell. Lists session_judgments, opens a detail (judgment + the
// workflow's chat history), and records a maintainer verdict. Env-switchable so
// dev or prod judgments can be reviewed. Deferred from the console version:
// criteria editing, judge-running, workflow-runs popover, PostHog deep-links.

interface JRow {
  id: string
  workflow_id: string
  judge_model: string
  status: string
  score: number | null
  review_status: string | null
  reviewed_by_email: string | null
  reviewed_by_judge: boolean
  reviewed_at: string | null
  created_at: string
}
interface Msg { id: string, role: string, content: string, created_at: string, feedback?: 'up' | 'down' }
interface Detail { env: string, judgment: any, workflow: any, messages: Msg[], runs: any[] }

const env = ref('dev')
const availableEnvs = ref<string[]>(['dev'])
const STATUS_FILTERS = ['approved', 'failed', 'corrected', 'unreviewed']
const active = ref<string[]>([])
const rows = ref<JRow[]>([])
const loading = ref(false)
const forbidden = ref(false)
const selected = ref<Detail | null>(null)
const detailLoading = ref(false)
const busy = ref(false)
const notes = ref('')
const toast = ref('')

const REVIEW_META: Record<string, { label: string, dot: string, pill: string }> = {
  approved: { label: 'Approved', dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  failed: { label: 'Failed', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
  corrected: { label: 'Corrected', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
}
function reviewPill(s: string | null | undefined) {
  return s && REVIEW_META[s] ? REVIEW_META[s] : null
}

function flash(m: string) {
  toast.value = m
  setTimeout(() => { if (toast.value === m) toast.value = '' }, 2500)
}
function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}
function isForbidden(e: any): boolean {
  return e?.statusCode === 403 || e?.response?.status === 403
}

function toggleFilter(s: string) {
  const i = active.value.indexOf(s)
  if (i >= 0) active.value.splice(i, 1)
  else active.value.push(s)
  load()
}

async function load() {
  loading.value = true
  forbidden.value = false
  try {
    const res = await adminFetch<{ env: string, available_envs: string[], judgments: JRow[] }>('/api/admin/judgments', {
      query: { status: active.value.join(','), limit: 200 },
    })
    env.value = res.env
    availableEnvs.value = res.available_envs
    rows.value = res.judgments
  }
  catch (e: any) {
    if (isForbidden(e)) forbidden.value = true
    rows.value = []
  }
  finally {
    loading.value = false
  }
}

async function switchEnv(next: string) {
  if (next === env.value || busy.value) return
  busy.value = true
  try {
    const r = await adminFetch<{ env: string }>('/api/admin/env', { method: 'POST', body: { env: next } })
    env.value = r.env
    selected.value = null
    await load()
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    busy.value = false
  }
}

async function openDetail(id: string) {
  detailLoading.value = true
  notes.value = ''
  try {
    selected.value = await adminFetch<Detail>(`/api/admin/judgments/${id}`)
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    detailLoading.value = false
  }
}
function closeDetail() {
  selected.value = null
}

async function review(decision: 'approved' | 'failed' | 'corrected') {
  if (!selected.value || busy.value) return
  busy.value = true
  try {
    await adminFetch(`/api/admin/judgments/${selected.value.judgment.id}/review`, {
      method: 'PATCH',
      body: { review_status: decision, notes: notes.value },
    })
    flash(`Saved: ${decision}`)
    closeDetail()
    await load()
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    busy.value = false
  }
}

function shortId(id: string) {
  return id ? id.slice(0, 8) : ''
}
function fmtScore(s: number | null) {
  return s == null ? '—' : Number(s).toFixed(2)
}
function fmtDate(iso: string) {
  return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : ''
}
function pretty(v: unknown) {
  if (v == null) return ''
  try { return JSON.stringify(v, null, 2) }
  catch { return String(v) }
}

const runtimeConfig = useRuntimeConfig()
const replayUrl = computed<string | null>(() => {
  const d = selected.value
  if (!d?.workflow) return null
  return posthogReplayUrl(String(runtimeConfig.public.posthogHost || ''), d.workflow.created_by, workflowTimeWindow(d.runs || []))
})

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <header class="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Judgments</h1>
        <p class="text-label-md text-neutral-500">Review LLM-judge results on workflow runs.</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
          <span class="text-label-md text-neutral-500">Env</span>
          <select :value="env" class="bg-transparent text-body-md font-medium text-neutral-950 outline-none" :disabled="busy" @change="switchEnv(($event.target as HTMLSelectElement).value)">
            <option v-for="e in availableEnvs" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-1.5 pb-3">
      <button
        v-for="s in STATUS_FILTERS"
        :key="s"
        type="button"
        class="rounded-md px-2.5 py-1 text-label-md font-medium transition-colors"
        :class="active.includes(s) ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'"
        @click="toggleFilter(s)"
      >
        {{ s }}
      </button>
      <span v-if="active.length" class="text-label-md text-neutral-400">· {{ rows.length }} shown</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="forbidden" class="py-16 text-center text-body-md text-neutral-500">Maintainers only.</div>
      <div v-else-if="loading" class="py-16 text-center text-body-md text-neutral-400">Loading…</div>
      <div v-else-if="rows.length === 0" class="py-16 text-center text-body-md text-neutral-500">No judgments in {{ env }}.</div>
      <div v-else class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table class="w-full text-left text-body-md">
          <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
            <tr>
              <th class="px-4 py-2.5 font-medium">Workflow</th>
              <th class="px-4 py-2.5 font-medium">Judge</th>
              <th class="px-4 py-2.5 font-medium">Run</th>
              <th class="px-4 py-2.5 font-medium">Score</th>
              <th class="px-4 py-2.5 font-medium">Review</th>
              <th class="px-4 py-2.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.id"
              class="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              @click="openDetail(r.id)"
            >
              <td class="px-4 py-2.5 font-mono text-neutral-700">{{ shortId(r.workflow_id) }}</td>
              <td class="px-4 py-2.5 text-neutral-600">{{ r.judge_model }}</td>
              <td class="px-4 py-2.5 text-neutral-500">{{ r.status }}</td>
              <td class="px-4 py-2.5 tabular-nums text-neutral-700">{{ fmtScore(r.score) }}</td>
              <td class="px-4 py-2.5">
                <span v-if="reviewPill(r.review_status)" class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium" :class="reviewPill(r.review_status)!.pill">
                  <span class="size-1.5 rounded-full" :class="reviewPill(r.review_status)!.dot" />
                  {{ reviewPill(r.review_status)!.label }}<template v-if="r.reviewed_by_judge"> ·judge</template>
                </span>
                <span v-else class="text-label-md text-neutral-400">—</span>
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap text-neutral-500">{{ fmtDate(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- detail modal -->
    <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" @click.self="closeDetail">
      <div class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-neutral-950">Judgment {{ shortId(selected.judgment.id) }}</h2>
              <span v-if="reviewPill(selected.judgment.review_status)" class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium" :class="reviewPill(selected.judgment.review_status)!.pill">
                <span class="size-1.5 rounded-full" :class="reviewPill(selected.judgment.review_status)!.dot" />
                {{ reviewPill(selected.judgment.review_status)!.label }}
              </span>
            </div>
            <p class="mt-0.5 text-label-md text-neutral-500">
              {{ selected.judgment.judge_model }} · status {{ selected.judgment.status }} · score {{ fmtScore(selected.judgment.score) }}
              <template v-if="selected.workflow"> · workflow “{{ selected.workflow.name }}”</template>
            </p>
          </div>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="closeDetail">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div v-if="replayUrl">
            <a :href="replayUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400">
              <UIcon name="i-heroicons-play-20-solid" class="size-4" /> Session recording
            </a>
          </div>
          <div v-if="selected.judgment.reasoning">
            <p class="mb-1 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Reasoning</p>
            <p class="whitespace-pre-wrap text-body-md text-neutral-700">{{ selected.judgment.reasoning }}</p>
          </div>
          <div v-if="selected.judgment.error" class="rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ selected.judgment.error }}</div>
          <div v-if="selected.judgment.classifications">
            <p class="mb-1 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Classifications</p>
            <pre class="overflow-x-auto rounded-lg border border-neutral-150 bg-neutral-50/60 p-3 font-mono text-label-md text-neutral-700">{{ pretty(selected.judgment.classifications) }}</pre>
          </div>

          <div v-if="selected.messages.length">
            <p class="mb-2 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Chat history ({{ selected.messages.length }})</p>
            <div class="space-y-2">
              <div v-for="m in selected.messages" :key="m.id" class="rounded-xl border border-neutral-150 p-3">
                <div class="mb-1 flex items-center gap-2">
                  <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-label-md font-medium text-neutral-600">{{ m.role }}</span>
                  <span v-if="m.feedback" class="text-label-md" :class="m.feedback === 'up' ? 'text-green-600' : 'text-red-600'">{{ m.feedback === 'up' ? '▲ up' : '▼ down' }}</span>
                </div>
                <p class="line-clamp-6 whitespace-pre-wrap text-body-md text-neutral-700">{{ m.content }}</p>
              </div>
            </div>
          </div>

          <div v-if="selected.runs && selected.runs.length">
            <p class="mb-2 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Runs ({{ selected.runs.length }})</p>
            <div class="space-y-1">
              <div v-for="r in selected.runs" :key="r.id" class="flex items-center justify-between gap-3 rounded-lg border border-neutral-150 px-3 py-2 text-body-md">
                <span class="font-mono text-neutral-600">{{ shortId(r.id) }}</span>
                <span class="text-neutral-500">{{ r.status }}</span>
                <span class="whitespace-nowrap text-neutral-400">{{ fmtDate(r.started_at) }}</span>
              </div>
            </div>
          </div>

          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Review note (optional)</p>
            <textarea v-model="notes" rows="2" placeholder="Why approved / failed / corrected…" class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-400" />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          <button type="button" class="rounded-lg px-3 py-1.5 text-body-md font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40" :disabled="busy" @click="review('corrected')">Corrected</button>
          <button type="button" class="rounded-lg px-3 py-1.5 text-body-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40" :disabled="busy" @click="review('failed')">Mark failed</button>
          <button type="button" class="rounded-lg bg-green-600 px-4 py-1.5 text-body-md font-medium text-white transition hover:bg-green-700 disabled:opacity-40" :disabled="busy" @click="review('approved')">Approve</button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">{{ toast }}</div>
  </div>
</template>
