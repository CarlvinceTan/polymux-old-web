<script setup lang="ts">
definePageMeta({ layout: 'admin' })

// Maintenance — operator surface for declaring service-downtime windows, ported
// from the console's maintenance.vue to web's light admin shell. Posting here
// hits the Go backend (via the web→Go bridge, useAdminGo), which spawns a
// detached goroutine that emails every Polymux account, writes a per-user inbox
// row, and stamps initial_email_sent_at / cancellation_email_sent_at. The web
// app subscribes to the underlying maintenance_windows table separately and
// renders a sticky banner during the 72h envelope ending at ends_at; that
// banner is not part of this admin page.
//
// Any maintainer can view + create + cancel + delete. /admin/maintenance routes
// are gated by maintainerOnly on the Go side, and the admin layout already
// gates the page (auth + maintainer middleware).

interface MaintenanceWindow {
  id: string
  title: string
  description: string
  starts_at: string
  ends_at: string
  created_by?: string | null
  created_at: string
  cancelled_at?: string | null
  initial_email_sent_at?: string | null
  cancellation_email_sent_at?: string | null
}

const go = useAdminGo()

const rows = ref<MaintenanceWindow[]>([])
const loading = ref(false)
const loadError = ref('')
const opError = ref('')
const busy = ref(false)

const showForm = ref(false)
const formTitle = ref('')
const formDescription = ref('')
const formStartsAt = ref('')
const formEndsAt = ref('')

// Re-render the status column on a 60s tick so "Scheduled" flips to "In
// progress" without an explicit refetch. Cheap because rows are bounded.
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  nowTimer = setInterval(() => { now.value = Date.now() }, 60_000)
})
onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer)
})

function errMsg(e: any): string {
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Request failed'
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const list = await go.call<MaintenanceWindow[]>('/maintenance')
    rows.value = list ?? []
  }
  catch (e: any) {
    loadError.value = errMsg(e)
  }
  finally {
    loading.value = false
  }
}

// datetime-local inputs prefer values in the user's local zone without an
// offset suffix. Defaults seed starts = T+2h, ends = T+3h.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInputValue(v: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function openForm() {
  formTitle.value = ''
  formDescription.value = ''
  formStartsAt.value = toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000))
  formEndsAt.value = toLocalInputValue(new Date(Date.now() + 3 * 60 * 60 * 1000))
  opError.value = ''
  showForm.value = true
}

const formStartsAtDate = computed(() => fromLocalInputValue(formStartsAt.value))
const formEndsAtDate = computed(() => fromLocalInputValue(formEndsAt.value))

const formError = computed<string | null>(() => {
  if (!formTitle.value.trim()) return 'Title is required.'
  if (formTitle.value.trim().length > 200) return 'Title must be 200 characters or fewer.'
  if (!formStartsAtDate.value) return 'Start time is required.'
  if (!formEndsAtDate.value) return 'End time is required.'
  if (formStartsAtDate.value.getTime() <= Date.now()) return 'Start time must be in the future.'
  if (formEndsAtDate.value.getTime() <= formStartsAtDate.value.getTime()) return 'End time must be after start time.'
  return null
})

// Industry recommendation is 24–72h advance notice. Below 24h we render an
// inline warning chip but don't block the submit.
const shortNoticeWarning = computed<string | null>(() => {
  if (!formStartsAtDate.value) return null
  const hoursOut = (formStartsAtDate.value.getTime() - Date.now()) / 36e5
  if (hoursOut < 24) {
    return `Less than 24h notice (${hoursOut.toFixed(1)}h). Industry recommendation is 24–72h advance notice — some users may miss this.`
  }
  return null
})

async function submitForm() {
  if (formError.value) {
    opError.value = formError.value
    return
  }
  if (!formStartsAtDate.value || !formEndsAtDate.value) return
  busy.value = true
  opError.value = ''
  try {
    await go.call('/maintenance', {
      method: 'POST',
      body: {
        title: formTitle.value.trim(),
        description: formDescription.value.trim(),
        starts_at: formStartsAtDate.value.toISOString(),
        ends_at: formEndsAtDate.value.toISOString(),
      },
    })
    showForm.value = false
    await loadAll()
  }
  catch (e: any) {
    opError.value = errMsg(e)
  }
  finally {
    busy.value = false
  }
}

async function cancelWindow(row: MaintenanceWindow) {
  if (!confirm(`Cancel maintenance "${row.title}"? An email + inbox notification will be sent to every Polymux account.`)) return
  busy.value = true
  opError.value = ''
  try {
    await go.call(`/maintenance/${row.id}/cancel`, { method: 'POST' })
    await loadAll()
  }
  catch (e: any) {
    opError.value = errMsg(e)
  }
  finally {
    busy.value = false
  }
}

async function deleteWindow(row: MaintenanceWindow) {
  if (!confirm(`Delete maintenance "${row.title}"? This drops the audit record.`)) return
  busy.value = true
  opError.value = ''
  try {
    await go.call(`/maintenance/${row.id}`, { method: 'DELETE' })
    await loadAll()
  }
  catch (e: any) {
    opError.value = errMsg(e)
  }
  finally {
    busy.value = false
  }
}

const STATUS_META: Record<string, { label: string, dot: string }> = {
  scheduled: { label: 'Scheduled', dot: 'bg-amber-500' },
  in_progress: { label: 'In progress', dot: 'bg-red-500' },
  cancelled: { label: 'Cancelled', dot: 'bg-neutral-300' },
  past: { label: 'Past', dot: 'bg-neutral-300' },
}
function statusFor(row: MaintenanceWindow) {
  if (row.cancelled_at) return STATUS_META.cancelled!
  const startMs = new Date(row.starts_at).getTime()
  const endMs = new Date(row.ends_at).getTime()
  const t = now.value
  if (t < startMs) return STATUS_META.scheduled!
  if (t <= endMs) return STATUS_META.in_progress!
  return STATUS_META.past!
}

function isDeletable(row: MaintenanceWindow): boolean {
  if (row.cancelled_at) return true
  return new Date(row.ends_at).getTime() < now.value
}
function isCancellable(row: MaintenanceWindow): boolean {
  if (row.cancelled_at) return false
  return new Date(row.ends_at).getTime() >= now.value
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC`
}
function fmtRange(row: MaintenanceWindow): string {
  return `${fmtDate(row.starts_at)} → ${fmtDate(row.ends_at)}`
}

onMounted(loadAll)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-4">
    <header class="flex flex-wrap items-center justify-between gap-3 pb-4">
      <div>
        <h1 class="text-lg font-semibold text-neutral-950">
          Maintenance <span class="font-normal text-neutral-400">({{ rows.length }})</span>
        </h1>
        <p class="text-label-md text-neutral-500">Schedule service-downtime windows — broadcasts an email + in-app notification to every Polymux account.</p>
      </div>
      <button
        type="button"
        class="h-9 rounded-lg bg-neutral-950 px-4 text-body-md font-medium text-white transition hover:opacity-90"
        @click="showForm ? (showForm = false) : openForm()"
      >
        {{ showForm ? 'Close' : '+ Schedule downtime' }}
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Create form (collapsible) -->
      <div v-if="showForm" class="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span class="text-label-md font-medium text-neutral-500">Title</span>
            <input
              v-model="formTitle"
              type="text"
              maxlength="200"
              placeholder="e.g. Database upgrade"
              class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
          </label>
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span class="text-label-md font-medium text-neutral-500">Description <span class="text-neutral-400">(optional)</span></span>
            <textarea
              v-model="formDescription"
              rows="3"
              placeholder="What changes during this window?"
              class="resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-label-md font-medium text-neutral-500">Starts at <span class="text-neutral-400">(local time)</span></span>
            <input
              v-model="formStartsAt"
              type="datetime-local"
              class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-label-md font-medium text-neutral-500">Ends at <span class="text-neutral-400">(local time)</span></span>
            <input
              v-model="formEndsAt"
              type="datetime-local"
              class="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-950 outline-none focus:border-neutral-400"
            >
          </label>
        </div>

        <div v-if="shortNoticeWarning" class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-label-md text-amber-700">
          ⚠ {{ shortNoticeWarning }}
        </div>
        <p v-if="formError" class="mt-2 text-label-md text-red-700">{{ formError }}</p>
        <p v-else class="mt-2 text-label-md text-neutral-500">
          On submit: every Polymux account receives an email + in-app notification. The banner appears in the web app 72h before the start time.
        </p>

        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-body-md font-medium text-neutral-700 transition hover:border-neutral-400"
            @click="showForm = false"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="busy || !!formError"
            class="rounded-lg bg-neutral-950 px-4 py-1.5 text-body-md font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            @click="submitForm"
          >
            {{ busy ? 'Submitting…' : 'Schedule + Broadcast' }}
          </button>
        </div>
      </div>

      <p v-if="loadError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ loadError }}</p>
      <p v-if="opError && !showForm" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-body-md text-red-700">{{ opError }}</p>

      <div v-if="loading" class="py-16 text-center text-body-md text-neutral-400">Loading…</div>

      <div v-else-if="rows.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
        <p class="text-body-md font-medium text-neutral-500">No maintenance windows scheduled.</p>
        <p class="mt-1 text-label-md text-neutral-400">Schedule one to email every Polymux account and show a banner in the web app.</p>
      </div>

      <div v-else class="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table class="w-full text-left text-body-md">
          <thead class="border-b border-neutral-150 bg-neutral-50/60 text-label-md uppercase tracking-wide text-neutral-400">
            <tr>
              <th class="px-4 py-2.5 font-medium">Title</th>
              <th class="whitespace-nowrap px-4 py-2.5 font-medium">Range (UTC)</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium">Email</th>
              <th class="whitespace-nowrap px-4 py-2.5 font-medium">Created</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-neutral-100 align-top last:border-0">
              <td class="px-4 py-2.5">
                <div class="font-medium text-neutral-950">{{ row.title }}</div>
                <div v-if="row.description" class="mt-0.5 max-w-[400px] whitespace-pre-wrap break-words text-label-md text-neutral-500">{{ row.description }}</div>
              </td>
              <td class="whitespace-nowrap px-4 py-2.5 text-neutral-500">{{ fmtRange(row) }}</td>
              <td class="px-4 py-2.5">
                <span class="inline-flex items-center gap-1.5 text-label-md font-medium text-neutral-700">
                  <span class="size-1.5 rounded-full" :class="statusFor(row).dot" />
                  {{ statusFor(row).label }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-2.5 text-neutral-500">
                <div v-if="row.initial_email_sent_at" :title="row.initial_email_sent_at">sent</div>
                <div v-else class="text-neutral-400">pending</div>
                <div v-if="row.cancellation_email_sent_at" class="text-neutral-400" :title="row.cancellation_email_sent_at">cancel sent</div>
              </td>
              <td class="whitespace-nowrap px-4 py-2.5 text-neutral-500">{{ fmtDate(row.created_at) }}</td>
              <td class="px-4 py-2.5 text-right">
                <div class="inline-flex items-center gap-2">
                  <button
                    v-if="isCancellable(row)"
                    type="button"
                    :disabled="busy"
                    class="rounded-lg px-2 py-1 text-label-md font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
                    @click="cancelWindow(row)"
                  >
                    Cancel
                  </button>
                  <button
                    v-if="isDeletable(row)"
                    type="button"
                    :disabled="busy"
                    class="rounded-lg px-2 py-1 text-label-md font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                    @click="deleteWindow(row)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
