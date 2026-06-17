<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Maintainers management — ported from the console's maintainers page, adapted
// to web's model: a maintainer is an existing Polymux user promoted via
// public.maintainers. Any maintainer may view; only owners may add/remove.

interface Row { user_id: string, email: string, is_owner: boolean, created_at: string }

const user = useSupabaseUser()
const me = ref<{ isMaintainer: boolean, isOwner: boolean, email: string | null } | null>(null)
const rows = ref<Row[]>([])
const loading = ref(false)
const busy = ref(false)
const newEmail = ref('')
const error = ref('')
const toast = ref('')

const isOwner = computed(() => !!me.value?.isOwner)

function flash(m: string) {
  toast.value = m
  setTimeout(() => { if (toast.value === m) toast.value = '' }, 2500)
}
function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}

async function refresh() {
  rows.value = await adminFetch<Row[]>('/api/admin/maintainers')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    me.value = await adminFetch('/api/admin/me')
    await refresh()
  }
  catch (e: any) {
    error.value = errMsg(e)
  }
  finally {
    loading.value = false
  }
}

async function add() {
  const email = newEmail.value.trim()
  if (!email || busy.value) return
  busy.value = true
  try {
    const res = await adminFetch<{ already: boolean }>('/api/admin/maintainers', { method: 'POST', body: { email } })
    newEmail.value = ''
    flash(res.already ? 'Already a maintainer' : 'Maintainer added')
    await refresh()
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    busy.value = false
  }
}

async function remove(row: Row) {
  if (busy.value) return
  if (!confirm(`Remove ${row.email} as a maintainer? Their Polymux account is not deleted.`)) return
  busy.value = true
  try {
    await adminFetch(`/api/admin/maintainers/${row.user_id}`, { method: 'DELETE' })
    flash('Removed')
    await refresh()
  }
  catch (e: any) {
    flash(errMsg(e))
  }
  finally {
    busy.value = false
  }
}

function fmtDate(iso: string) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '—'
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <header class="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">Maintainers</h1>
        <p class="text-label-md text-neutral-500">
          Who can access the admin area.
          {{ isOwner ? 'You can add or remove maintainers.' : 'Owner-managed — view only for you.' }}
        </p>
      </div>
      <form v-if="isOwner" class="flex items-center gap-2" @submit.prevent="add">
        <input
          v-model="newEmail"
          type="email"
          placeholder="user@polymux.com"
          class="h-9 w-64 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
        >
        <button
          type="submit"
          :disabled="busy"
          class="h-9 rounded-lg bg-neutral-950 px-4 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="error" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ error }}</p>
      <div v-if="loading" class="py-12 text-center text-body-md text-neutral-400">Loading…</div>
      <div v-else class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table class="w-full text-left text-body-md">
          <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
            <tr>
              <th class="px-4 py-2.5 font-medium">Email</th>
              <th class="px-4 py-2.5 font-medium">Role</th>
              <th class="px-4 py-2.5 font-medium">Added</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.user_id" class="border-b border-neutral-100 last:border-0">
              <td class="px-4 py-2.5 text-neutral-950">{{ row.email }}</td>
              <td class="px-4 py-2.5">
                <span
                  class="rounded-md px-2 py-0.5 text-label-md font-medium"
                  :class="row.is_owner ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'"
                >
                  {{ row.is_owner ? 'Owner' : 'Maintainer' }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-neutral-500">{{ fmtDate(row.created_at) }}</td>
              <td class="px-4 py-2.5 text-right">
                <button
                  v-if="isOwner && row.user_id !== user?.id"
                  type="button"
                  :disabled="busy"
                  class="rounded-lg px-2 py-1 text-label-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                  @click="remove(row)"
                >
                  Remove
                </button>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-neutral-400">No maintainers.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
