<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Maintainer-only plugin review queue (the in-web admin area). English-only by
// design — this is internal staff tooling, like the console app it supersedes,
// so it isn't routed through the 8-locale i18n. Server endpoints under
// /api/admin/* enforce the maintainer gate; this page degrades to a notice for
// non-maintainers.

interface PluginRow {
  id: string
  slug: string
  name: string
  description: string | null
  kind: string
  visibility: string
  is_first_party: boolean
  is_verified: boolean
  review_status: string
  review_notes: string | null
  author_name: string
  install_count: number
  updated_at: string
}

interface DeclaredCred {
  key: string
  type: string
  provider?: string
  fields: string[]
  scopes?: string[]
  fulfillment?: string
  rationale?: string
  provisioned: boolean
  hint?: Record<string, string> | null
}

interface Detail {
  env: string
  integration: PluginRow & { homepage_url: string | null, source_repo_url: string | null }
  version: { version: string, status: string, manifest_url: string | null, published_at: string | null } | null
  manifest: Record<string, any> | null
  credentials: DeclaredCred[]
}

const env = ref('dev')
const availableEnvs = ref<string[]>(['dev'])
const statusFilter = ref('pending_review')
const plugins = ref<PluginRow[]>([])
const loading = ref(false)
const forbidden = ref(false)
const selected = ref<Detail | null>(null)
const detailLoading = ref(false)
const busy = ref(false)
const notes = ref('')
const toast = ref('')
const credInputs = reactive<Record<string, Record<string, string>>>({})

const STATUS_FILTERS = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const REVIEW_FALLBACK = { label: 'Unsubmitted', dot: 'bg-neutral-400', pill: 'bg-neutral-100 text-neutral-600' }
const REVIEW_META: Record<string, { label: string, dot: string, pill: string }> = {
  unsubmitted: REVIEW_FALLBACK,
  pending_review: { label: 'Pending review', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  changes_requested: { label: 'Changes requested', dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
}
function meta(status: string) {
  return REVIEW_META[status] ?? REVIEW_FALLBACK
}

function flash(msg: string) {
  toast.value = msg
  setTimeout(() => { if (toast.value === msg) toast.value = '' }, 2500)
}

function errMessage(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}
function isForbidden(e: any): boolean {
  return e?.statusCode === 403 || e?.response?.status === 403
}

async function loadList() {
  loading.value = true
  forbidden.value = false
  try {
    const res = await adminFetch<{ env: string, available_envs: string[], plugins: PluginRow[] }>('/api/admin/plugins', {
      query: { status: statusFilter.value },
    })
    env.value = res.env
    availableEnvs.value = res.available_envs
    plugins.value = res.plugins
  }
  catch (e: any) {
    if (isForbidden(e)) forbidden.value = true
    plugins.value = []
  }
  finally {
    loading.value = false
  }
}

async function openDetail(id: string) {
  detailLoading.value = true
  notes.value = ''
  try {
    const d = await adminFetch<Detail>(`/api/admin/plugins/${id}`)
    for (const c of d.credentials) {
      credInputs[c.key] = credInputs[c.key] || {}
      for (const f of c.fields) credInputs[c.key]![f] = credInputs[c.key]![f] ?? ''
    }
    selected.value = d
  }
  catch (e: any) {
    flash(errMessage(e))
  }
  finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  selected.value = null
}

async function switchEnv(next: string) {
  if (next === env.value || busy.value) return
  busy.value = true
  try {
    const res = await adminFetch<{ env: string }>('/api/admin/env', { method: 'POST', body: { env: next } })
    env.value = res.env
    selected.value = null
    await loadList()
  }
  catch (e: any) {
    flash(errMessage(e))
  }
  finally {
    busy.value = false
  }
}

async function decide(decision: 'approve' | 'reject' | 'changes') {
  if (!selected.value || busy.value) return
  busy.value = true
  try {
    await adminFetch(`/api/admin/plugins/${selected.value.integration.id}/review`, {
      method: 'POST',
      body: { decision, notes: notes.value },
    })
    flash(decision === 'approve' ? 'Approved & published' : decision === 'reject' ? 'Rejected' : 'Changes requested')
    closeDetail()
    await loadList()
  }
  catch (e: any) {
    flash(errMessage(e))
  }
  finally {
    busy.value = false
  }
}

async function toggleFirstParty() {
  if (!selected.value || busy.value) return
  busy.value = true
  const id = selected.value.integration.id
  try {
    await adminFetch(`/api/admin/plugins/${id}/first-party`, {
      method: 'POST',
      body: { value: !selected.value.integration.is_first_party },
    })
    await openDetail(id)
  }
  catch (e: any) {
    flash(errMessage(e))
  }
  finally {
    busy.value = false
  }
}

async function provision(cred: DeclaredCred) {
  if (!selected.value || busy.value) return
  busy.value = true
  const id = selected.value.integration.id
  try {
    await adminFetch(`/api/admin/plugins/${id}/credentials`, {
      method: 'POST',
      body: { key: cred.key, type: cred.type, provider: cred.provider, fields: credInputs[cred.key], scopes: cred.scopes },
    })
    flash(`Provisioned ${cred.key}`)
    await openDetail(id)
  }
  catch (e: any) {
    flash(errMessage(e))
  }
  finally {
    busy.value = false
  }
}

onMounted(loadList)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <!-- Header -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Plugin review</h1>
        <p class="text-label-md text-neutral-500">Maintainer-only · review submissions, provision credentials, approve listings.</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
          <span class="text-label-md text-neutral-500">Env</span>
          <select
            :value="env"
            class="bg-transparent text-body-md font-medium text-neutral-950 outline-none"
            :disabled="busy"
            @change="switchEnv(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="e in availableEnvs" :key="e" :value="e">{{ e }}</option>
          </select>
        </label>
        <select
          v-model="statusFilter"
          class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-body-md text-neutral-700 outline-none"
          @change="loadList"
        >
          <option v-for="s in STATUS_FILTERS" :key="s.value" :value="s.value">{{ s.label }}</option>
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

      <div v-else-if="loading" class="py-16 text-center text-body-md text-neutral-400">Loading…</div>

      <div v-else-if="plugins.length === 0" class="flex h-full flex-col items-center justify-center text-center">
        <UIcon name="i-heroicons-inbox-20-solid" class="mb-3 size-10 text-neutral-300" />
        <p class="text-body-md font-medium text-neutral-500">Nothing here</p>
        <p class="mt-1 text-label-md text-neutral-500">No plugins with status “{{ statusFilter }}” in {{ env }}.</p>
      </div>

      <div v-else class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))">
        <button
          v-for="p in plugins"
          :key="p.id"
          type="button"
          class="ghost-panel ghost-panel-hover flex flex-col gap-2 rounded-xl bg-white p-4 text-left"
          @click="openDetail(p.id)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-neutral-950">{{ p.name }}</p>
              <p class="truncate text-label-md text-neutral-500">{{ p.slug }}</p>
            </div>
            <span
              class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium"
              :class="meta(p.review_status).pill"
            >
              <span class="size-1.5 rounded-full" :class="meta(p.review_status).dot" />
              {{ meta(p.review_status).label }}
            </span>
          </div>
          <p v-if="p.description" class="line-clamp-2 text-body-md text-neutral-500">{{ p.description }}</p>
          <div class="mt-1 flex items-center gap-2 text-label-md text-neutral-400">
            <span>by {{ p.author_name }}</span>
            <span>·</span>
            <span>{{ p.kind }}</span>
            <span v-if="p.is_first_party" class="rounded bg-neutral-900 px-1.5 py-0.5 text-white">Official</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Detail modal -->
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      @click.self="closeDetail"
    >
      <div class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <!-- modal header -->
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-base font-semibold text-neutral-950">{{ selected.integration.name }}</h2>
              <span
                class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium"
                :class="meta(selected.integration.review_status).pill"
              >
                <span class="size-1.5 rounded-full" :class="meta(selected.integration.review_status).dot" />
                {{ meta(selected.integration.review_status).label }}
              </span>
            </div>
            <p class="mt-0.5 text-label-md text-neutral-500">
              {{ selected.integration.slug }} · by {{ selected.integration.author_name }}
              <template v-if="selected.version"> · v{{ selected.version.version }}</template>
            </p>
          </div>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="closeDetail">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <p v-if="selected.integration.description" class="text-body-md text-neutral-600">
            {{ selected.integration.description }}
          </p>

          <!-- manifest summary -->
          <div v-if="selected.manifest" class="rounded-xl border border-neutral-150 bg-neutral-50/50 p-3">
            <p class="mb-2 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Manifest</p>
            <div class="space-y-1 text-body-md text-neutral-600">
              <p v-if="selected.manifest.runtime?.base_url"><span class="text-neutral-400">base_url</span> {{ selected.manifest.runtime.base_url }}</p>
              <p v-if="selected.manifest.permissions?.scopes?.length"><span class="text-neutral-400">scopes</span> {{ selected.manifest.permissions.scopes.join(', ') }}</p>
              <p v-if="Array.isArray(selected.manifest.tools)"><span class="text-neutral-400">tools</span> {{ selected.manifest.tools.map((t: any) => t.name).join(', ') }}</p>
            </div>
          </div>

          <!-- declared credentials -->
          <div v-if="selected.credentials.length" class="space-y-3">
            <p class="text-label-md font-semibold uppercase tracking-wide text-neutral-400">Credentials to provision</p>
            <div
              v-for="c in selected.credentials"
              :key="c.key"
              class="rounded-xl border border-neutral-200 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-body-md font-medium text-neutral-950">{{ c.key }}</p>
                  <p class="truncate text-label-md text-neutral-500">{{ c.type }}<template v-if="c.provider"> · {{ c.provider }}</template> · {{ c.fulfillment }}</p>
                </div>
                <span
                  class="shrink-0 rounded-md px-2 py-0.5 text-label-md font-medium"
                  :class="c.provisioned ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'"
                >
                  {{ c.provisioned ? 'Provisioned' : 'Needed' }}
                </span>
              </div>
              <p v-if="c.rationale" class="mt-1 text-label-md text-neutral-500">{{ c.rationale }}</p>

              <div v-if="c.provisioned" class="mt-2 text-label-md text-neutral-500">
                <span v-for="(v, k) in (c.hint || {})" :key="k" class="mr-3 font-mono">{{ k }}: {{ v }}</span>
              </div>

              <div v-else class="mt-2 space-y-2">
                <div v-for="f in c.fields" :key="f" class="flex items-center gap-2">
                  <label class="w-28 shrink-0 text-label-md text-neutral-500">{{ f }}</label>
                  <input
                    v-model="credInputs[c.key]![f]"
                    type="password"
                    autocomplete="off"
                    :placeholder="f"
                    class="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
                  >
                </div>
                <button
                  type="button"
                  class="rounded-lg bg-neutral-950 px-3 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                  :disabled="busy"
                  @click="provision(c)"
                >
                  Provision {{ c.key }}
                </button>
              </div>
            </div>
          </div>

          <!-- review notes -->
          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Review notes (for reject / changes)</p>
            <textarea
              v-model="notes"
              rows="2"
              placeholder="Optional note shown to the author…"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <!-- modal actions -->
        <div class="flex items-center justify-between gap-2 border-t border-neutral-100 p-4">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
            :disabled="busy"
            @click="toggleFirstParty"
          >
            {{ selected.integration.is_first_party ? 'Unmark first-party' : 'Mark first-party' }}
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-body-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              :disabled="busy"
              @click="decide('reject')"
            >
              Reject
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-body-md font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
              :disabled="busy"
              @click="decide('changes')"
            >
              Request changes
            </button>
            <button
              type="button"
              class="rounded-lg bg-green-600 px-4 py-1.5 text-body-md font-medium text-white transition hover:bg-green-700 disabled:opacity-40"
              :disabled="busy"
              @click="decide('approve')"
            >
              Approve & publish
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
