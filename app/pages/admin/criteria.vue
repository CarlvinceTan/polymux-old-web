<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Judge criteria management — ported from console data.vue's criteria modal +
// /admin/criteria routes. Each criterion is one evaluation point the judge
// scores per workflow. Env-switchable.

interface Criterion { id: string, label: string, prompt: string, position: number, created_at: string, updated_at: string }

const env = ref('dev')
const availableEnvs = ref<string[]>(['dev'])
const rows = ref<Criterion[]>([])
const tableMissing = ref(false)
const loading = ref(false)
const busy = ref(false)
const toast = ref('')
const newLabel = ref('')
const newPrompt = ref('')
const editing = ref<Criterion | null>(null)
const editLabel = ref('')
const editPrompt = ref('')

function flash(m: string) {
  toast.value = m
  setTimeout(() => { if (toast.value === m) toast.value = '' }, 2500)
}
function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}

async function load() {
  loading.value = true
  try {
    const r = await adminFetch<{ env: string, available_envs: string[], criteria: Criterion[], table_missing: boolean }>('/api/admin/criteria')
    env.value = r.env
    availableEnvs.value = r.available_envs || ['dev']
    rows.value = r.criteria
    tableMissing.value = r.table_missing
  }
  catch (e: any) {
    flash(errMsg(e))
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
    await load()
  }
  catch (e: any) { flash(errMsg(e)) }
  finally { busy.value = false }
}

async function add() {
  if (!newLabel.value.trim() || !newPrompt.value.trim() || busy.value) return
  busy.value = true
  try {
    await adminFetch('/api/admin/criteria', { method: 'POST', body: { label: newLabel.value, prompt: newPrompt.value } })
    newLabel.value = ''
    newPrompt.value = ''
    flash('Added')
    await load()
  }
  catch (e: any) { flash(errMsg(e)) }
  finally { busy.value = false }
}

function startEdit(c: Criterion) {
  editing.value = c
  editLabel.value = c.label
  editPrompt.value = c.prompt
}
async function saveEdit() {
  if (!editing.value || busy.value) return
  busy.value = true
  try {
    await adminFetch(`/api/admin/criteria/${editing.value.id}`, { method: 'PATCH', body: { label: editLabel.value, prompt: editPrompt.value } })
    editing.value = null
    flash('Saved')
    await load()
  }
  catch (e: any) { flash(errMsg(e)) }
  finally { busy.value = false }
}
async function remove(c: Criterion) {
  if (busy.value) return
  if (!confirm(`Delete criterion “${c.label}”?`)) return
  busy.value = true
  try {
    await adminFetch(`/api/admin/criteria/${c.id}`, { method: 'DELETE' })
    flash('Deleted')
    await load()
  }
  catch (e: any) { flash(errMsg(e)) }
  finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <header class="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Judge criteria</h1>
        <p class="text-label-md text-neutral-500">Each criterion is one evaluation point the judge scores per workflow.</p>
      </div>
      <label class="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5">
        <span class="text-label-md text-neutral-500">Env</span>
        <select :value="env" class="bg-transparent text-body-md font-medium text-neutral-950 outline-none" :disabled="busy" @change="switchEnv(($event.target as HTMLSelectElement).value)">
          <option v-for="e in availableEnvs" :key="e" :value="e">{{ e }}</option>
        </select>
      </label>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="tableMissing" class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-body-md text-amber-700">
        The <code>judge_criteria</code> table isn't migrated in {{ env }} yet.
      </div>

      <!-- add -->
      <div class="mb-5 rounded-xl border border-neutral-200 bg-white p-4">
        <p class="mb-2 text-label-md font-semibold uppercase tracking-wide text-neutral-400">New criterion</p>
        <div class="flex flex-col gap-2">
          <input v-model="newLabel" placeholder="Label (e.g. “Followed the instructions”)" class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md outline-none focus:border-neutral-400">
          <textarea v-model="newPrompt" rows="2" placeholder="What should the judge evaluate?" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md outline-none focus:border-neutral-400" />
          <div class="flex justify-end">
            <button type="button" :disabled="busy" class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40" @click="add">Add criterion</button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="py-8 text-center text-body-md text-neutral-400">Loading…</div>
      <div v-else-if="rows.length === 0" class="py-8 text-center text-body-md text-neutral-500">No criteria yet.</div>
      <div v-else class="space-y-2">
        <div v-for="c in rows" :key="c.id" class="rounded-xl border border-neutral-200 bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-body-md font-medium text-neutral-950">{{ c.label }}</p>
              <p class="mt-0.5 whitespace-pre-wrap text-body-md text-neutral-500">{{ c.prompt }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button type="button" class="rounded-lg px-2 py-1 text-label-md font-medium text-neutral-600 transition hover:bg-neutral-100" @click="startEdit(c)">Edit</button>
              <button type="button" :disabled="busy" class="rounded-lg px-2 py-1 text-label-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40" @click="remove(c)">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- edit modal -->
    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" @click.self="editing = null">
      <div class="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <h2 class="mb-3 text-base font-semibold text-neutral-950">Edit criterion</h2>
        <div class="flex flex-col gap-2">
          <input v-model="editLabel" class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md outline-none focus:border-neutral-400">
          <textarea v-model="editPrompt" rows="3" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md outline-none focus:border-neutral-400" />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 hover:border-neutral-400" @click="editing = null">Cancel</button>
          <button type="button" :disabled="busy" class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">{{ toast }}</div>
  </div>
</template>
