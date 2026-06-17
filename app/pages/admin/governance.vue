<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Governance — user invites, status tracking, and notifications. Ported from
// the console's governance.vue into the web admin shell. Go-backed: data comes
// from the polymux backend's /admin/governance/* endpoints via the web→Go
// bridge (useAdminGo → /api/admin/go/<path>). No web server endpoint is added;
// the bridge already enforces the maintainer gate. Differences from the
// console version are frontend-only: light/rounded theme, native styled
// <select> for the notification type (no Pane/Dropdown components), and
// rounded-xl table styling instead of the console's flat 1px borders.

type Status = 'Registered' | 'Invited' | 'Expired' | 'Suspended'
interface UserRow {
  email: string
  user_id?: string | null
  status: Status
  invited_at?: string | null
  expires_at?: string | null
}

const go = useAdminGo()

const users = ref<UserRow[]>([])
const loading = ref(false)
const forbidden = ref(false)
const loadError = ref('')
const search = ref('')
const selected = ref<Set<string>>(new Set())

const addUsersOpen = ref(false)
const addUsersText = ref('')
const addUsersBusy = ref(false)
const addUsersError = ref('')

const notifyOpen = ref(false)
const notifyTitle = ref('')
const notifyDescription = ref('')
const notifyType = ref<'announcement' | 'info'>('announcement')
const notifyInApp = ref(true)
const notifyEmail = ref(false)
const notifyBusy = ref(false)
const notifyError = ref('')

const bulkBusy = ref(false)
const toast = ref('')

const STATUS_META: Record<Status, { dot: string, pill: string }> = {
  Registered: { dot: 'bg-green-500', pill: 'bg-green-50 text-green-700' },
  Invited: { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700' },
  Expired: { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700' },
  Suspended: { dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
}
function statusMeta(s: string) {
  return STATUS_META[s as Status] ?? { dot: 'bg-neutral-400', pill: 'bg-neutral-100 text-neutral-600' }
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

async function loadAll() {
  loading.value = true
  forbidden.value = false
  loadError.value = ''
  try {
    const list = await go.call<UserRow[]>('/governance/users', { query: { search: search.value } })
    users.value = list ?? []
    pruneSelected()
  }
  catch (e: any) {
    if (isForbidden(e)) forbidden.value = true
    else loadError.value = errMsg(e)
    users.value = []
  }
  finally {
    loading.value = false
  }
}

function pruneSelected() {
  const visible = new Set(users.value.map(u => u.email.toLowerCase()))
  const next = new Set(selected.value)
  for (const email of [...next]) {
    if (!visible.has(email)) next.delete(email)
  }
  selected.value = next
}

const visibleUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u => u.email.toLowerCase().includes(q))
})

const allSelected = computed(() =>
  visibleUsers.value.length > 0 && visibleUsers.value.every(u => selected.value.has(u.email.toLowerCase())),
)

const subtitle = computed(() => {
  if (search.value.trim()) return `${visibleUsers.value.length} of ${users.value.length} match`
  return 'Manage user invites and notifications.'
})

function toggleAll() {
  if (allSelected.value) {
    selected.value = new Set()
  }
  else {
    selected.value = new Set(visibleUsers.value.map(u => u.email.toLowerCase()))
  }
}

function toggleRow(email: string) {
  const key = email.toLowerCase()
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

function isSelected(email: string): boolean {
  return selected.value.has(email.toLowerCase())
}

function openAddUsers() {
  addUsersText.value = ''
  addUsersError.value = ''
  addUsersOpen.value = true
}

function parseEmails(text: string): string[] {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean),
  )]
}

async function submitAddUsers() {
  const emails = parseEmails(addUsersText.value)
  if (emails.length === 0) {
    addUsersError.value = 'Enter at least one email.'
    return
  }
  addUsersBusy.value = true
  addUsersError.value = ''
  try {
    await go.call('/governance/invites', { method: 'POST', body: { emails } })
    addUsersOpen.value = false
    addUsersText.value = ''
    flash(`Invited ${emails.length} ${emails.length === 1 ? 'user' : 'users'}`)
    await loadAll()
  }
  catch (e: any) {
    addUsersError.value = errMsg(e)
  }
  finally {
    addUsersBusy.value = false
  }
}

async function bulkSendInvites() {
  if (selected.value.size === 0 || bulkBusy.value) return
  bulkBusy.value = true
  try {
    await go.call('/governance/invites', { method: 'POST', body: { emails: [...selected.value] } })
    flash(`Invited ${selected.value.size} selected`)
    await loadAll()
  }
  catch (e: any) {
    loadError.value = errMsg(e)
  }
  finally {
    bulkBusy.value = false
  }
}

function openNotify() {
  notifyTitle.value = ''
  notifyDescription.value = ''
  notifyType.value = 'announcement'
  notifyError.value = ''
  notifyOpen.value = true
}

async function submitNotify(broadcast: boolean) {
  if (!notifyTitle.value.trim()) {
    notifyError.value = 'Title is required.'
    return
  }
  if (!notifyInApp.value && !notifyEmail.value) {
    notifyError.value = 'Select at least one channel (in-app or email).'
    return
  }
  notifyBusy.value = true
  notifyError.value = ''
  try {
    const recipients = broadcast
      ? { broadcast: true }
      : {
          user_ids: users.value
            .filter(u => isSelected(u.email) && u.user_id)
            .map(u => u.user_id),
        }
    await go.call('/governance/notifications', {
      method: 'POST',
      body: {
        ...recipients,
        title: notifyTitle.value.trim(),
        description: notifyDescription.value.trim(),
        type: notifyType.value,
        in_app: notifyInApp.value,
        email: notifyEmail.value,
      },
    })
    notifyOpen.value = false
    flash(broadcast ? 'Broadcast sent' : `Notified ${selected.value.size} selected`)
  }
  catch (e: any) {
    notifyError.value = errMsg(e)
  }
  finally {
    notifyBusy.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(loadAll, 200)
})

function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}

onMounted(loadAll)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <!-- Header -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">
          {{ selected.size > 0 ? `Users (${selected.size} selected)` : `Users (${visibleUsers.length})` }}
        </h1>
        <p class="text-label-md text-neutral-500">{{ subtitle }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="search"
          type="search"
          placeholder="Search emails…"
          class="h-9 w-56 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
        >
        <button
          type="button"
          class="h-9 rounded-lg border border-neutral-300 px-3 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400"
          @click="openAddUsers"
        >
          Add Users
        </button>
        <template v-if="selected.size > 0">
          <span class="text-neutral-300">|</span>
          <button
            type="button"
            :disabled="bulkBusy"
            class="h-9 rounded-lg bg-neutral-950 px-4 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            @click="bulkSendInvites"
          >
            Invite
          </button>
          <button
            type="button"
            :disabled="bulkBusy"
            class="h-9 rounded-lg border border-neutral-300 px-4 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
            @click="openNotify"
          >
            Notify
          </button>
        </template>
      </div>
    </header>

    <!-- Body -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="loadError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ loadError }}</p>

      <div v-if="forbidden" class="flex h-full flex-col items-center justify-center text-center">
        <UIcon name="i-heroicons-lock-closed-20-solid" class="mb-3 size-10 text-neutral-300" />
        <p class="text-body-md font-medium text-neutral-600">Maintainers only</p>
        <p class="mt-1 text-label-md text-neutral-500">Your account isn't on the maintainers list.</p>
      </div>

      <div v-else-if="loading" class="py-16 text-center text-body-md text-neutral-400">Loading…</div>

      <div v-else-if="visibleUsers.length === 0" class="flex h-full flex-col items-center justify-center text-center">
        <UIcon name="i-heroicons-users-20-solid" class="mb-3 size-10 text-neutral-300" />
        <p class="text-body-md font-medium text-neutral-500">No users</p>
        <p class="mt-1 text-label-md text-neutral-500">
          {{ search ? `No users match “${search}”.` : 'No users to manage yet.' }}
        </p>
      </div>

      <div v-else class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table class="w-full text-left text-body-md">
          <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
            <tr>
              <th class="w-10 px-4 py-2.5">
                <input type="checkbox" :checked="allSelected" class="size-4 cursor-pointer accent-neutral-900" @change="toggleAll">
              </th>
              <th class="px-4 py-2.5 font-medium">Email</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium">Invited</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleUsers" :key="row.email" class="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
              <td class="px-4 py-2.5">
                <input type="checkbox" :checked="isSelected(row.email)" class="size-4 cursor-pointer accent-neutral-900" @change="toggleRow(row.email)">
              </td>
              <td class="px-4 py-2.5 font-mono text-neutral-950">{{ row.email }}</td>
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-label-md font-medium" :class="statusMeta(row.status).pill">
                  <span class="size-1.5 rounded-full" :class="statusMeta(row.status).dot" />
                  {{ row.status }}
                </span>
              </td>
              <td class="px-4 py-2.5 whitespace-nowrap text-neutral-500">{{ fmtDate(row.invited_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Users modal -->
    <div v-if="addUsersOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" @click.self="addUsersOpen = false">
      <div class="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <div>
            <h2 class="text-base font-semibold text-neutral-950">Add users</h2>
            <p class="mt-0.5 text-label-md text-neutral-500">One email per line, or separated by commas/spaces.</p>
          </div>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="addUsersOpen = false">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>
        <div class="p-5">
          <textarea
            v-model="addUsersText"
            rows="6"
            placeholder="alice@example.com&#10;bob@example.com"
            class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-body-md text-neutral-950 outline-none focus:border-neutral-400"
          />
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          <span v-if="addUsersError" class="mr-auto text-label-md text-red-600">{{ addUsersError }}</span>
          <button
            type="button"
            :disabled="addUsersBusy"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
            @click="addUsersOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="addUsersBusy || !addUsersText.trim()"
            class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            @click="submitAddUsers"
          >
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Notify modal -->
    <div v-if="notifyOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" @click.self="notifyOpen = false">
      <div class="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-3 border-b border-neutral-100 p-5">
          <h2 class="text-base font-semibold text-neutral-950">Send notification</h2>
          <button type="button" class="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" @click="notifyOpen = false">
            <UIcon name="i-heroicons-x-mark-20-solid" class="size-5" />
          </button>
        </div>
        <div class="space-y-4 p-5">
          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Channels</p>
            <div class="flex items-center gap-5">
              <label class="inline-flex cursor-pointer items-center gap-2 text-body-md text-neutral-700">
                <input v-model="notifyInApp" type="checkbox" class="size-4 cursor-pointer accent-neutral-900">
                <span>In-app</span>
              </label>
              <label class="inline-flex cursor-pointer items-center gap-2 text-body-md text-neutral-700">
                <input v-model="notifyEmail" type="checkbox" class="size-4 cursor-pointer accent-neutral-900">
                <span>Email</span>
              </label>
            </div>
          </div>
          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Type</p>
            <select
              v-model="notifyType"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
              <option value="announcement">announcement</option>
              <option value="info">info</option>
            </select>
          </div>
          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Title</p>
            <input
              v-model="notifyTitle"
              type="text"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
          </div>
          <div>
            <p class="mb-1.5 text-label-md font-semibold uppercase tracking-wide text-neutral-400">Body</p>
            <textarea
              v-model="notifyDescription"
              rows="3"
              class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            />
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-neutral-100 p-4">
          <span v-if="notifyError" class="mr-auto text-label-md text-red-600">{{ notifyError }}</span>
          <span v-else class="mr-auto text-label-md text-neutral-400">{{ selected.size }} selected</span>
          <button
            type="button"
            :disabled="notifyBusy"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
            @click="notifyOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="notifyBusy || selected.size === 0"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-40"
            @click="submitNotify(false)"
          >
            Send to selected
          </button>
          <button
            type="button"
            :disabled="notifyBusy"
            class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            @click="submitNotify(true)"
          >
            Broadcast
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-body-md text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
