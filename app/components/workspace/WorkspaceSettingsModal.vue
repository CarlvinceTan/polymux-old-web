<script setup lang="ts">
import type { WorkspaceMember } from '~/composables/useWorkspaces'

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const user = useSupabaseUser()

const {
  workspaces,
  currentWorkspace,
  currentWorkspaceId,
  members,
  fetchMembers,
  updateWorkspace,
  transferOwnership,
  deleteWorkspace,
} = useWorkspaces()

const { sessions, fetchSessions } = useWorkflowList()
const { wallet, fetchWallet, formatCents } = useWallet()
const { probe: probeLocal } = useLocalFileStorage()
const { cards: storageUsageCards, refreshDrive } = useStorageUsage()
const { isInstalled } = useMarketplace()

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

interface PlanLimits {
  seats: number | null
  sessionsWeekly: number | null
  storageBytes: number | null
  fileSizeBytes: number | null
  browserAgents: number | null
}

const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free:       { seats: 3,   sessionsWeekly: 25,    storageBytes: 100 * 1024 * 1024,         fileSizeBytes: 25 * 1024 * 1024,         browserAgents: 2 },
  pro:        { seats: 10,  sessionsWeekly: 250,   storageBytes: 5 * 1024 * 1024 * 1024,    fileSizeBytes: 250 * 1024 * 1024,        browserAgents: 8 },
  max:        { seats: 50,  sessionsWeekly: 2_500, storageBytes: 50 * 1024 * 1024 * 1024,   fileSizeBytes: 1024 * 1024 * 1024,       browserAgents: 20 },
  enterprise: { seats: null, sessionsWeekly: null, storageBytes: null,                      fileSizeBytes: null,                     browserAgents: null },
}

const planKey = computed<PlanKey>(() => {
  const raw = (currentWorkspace.value?.plan as string | undefined)?.toLowerCase().trim() ?? ''
  if (raw === 'pro' || raw === 'max' || raw === 'enterprise' || raw === 'free') return raw
  return 'free'
})
const planLabel = computed(() => planKey.value.charAt(0).toUpperCase() + planKey.value.slice(1))
const planLimits = computed(() => PLAN_LIMITS[planKey.value])
const showUpgrade = computed(() => planKey.value !== 'enterprise')

const PLAN_ACCENT: Record<PlanKey, string> = {
  free: 'bg-neutral-300',
  pro: 'bg-blue-400',
  max: 'bg-amber-400',
  enterprise: 'bg-purple-400',
}
const planAccentClass = computed(() => PLAN_ACCENT[planKey.value] ?? PLAN_ACCENT.free)

const upgradeQuery = computed(() => {
  const q: Record<string, string> = { current: planKey.value }
  if (currentWorkspaceId.value) q.workspaceId = currentWorkspaceId.value
  return q
})

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageWorkspace = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const canTransferOwnership = computed(() => myRole.value === 'owner')
const canDeleteWorkspace = computed(() => myRole.value === 'owner')
const isOnlyWorkspace = computed(() => workspaces.value.length <= 1)

const transferableMembers = computed(() =>
  members.value.filter(m => m.user_id !== user.value?.id),
)
const transferDisplayMembers = computed(() => {
  const owner = members.value.find(m => m.role === 'owner')
  const others = members.value.filter(m => m.role !== 'owner')
  return owner ? [owner, ...others] : others
})

// ---- Live clock for week boundary ----
const now = ref(new Date())
let nowTicker: ReturnType<typeof setInterval> | null = null

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d
}

const weekStart = computed(() => startOfWeek(now.value))
const weekEnd = computed(() => {
  const e = new Date(weekStart.value)
  e.setDate(e.getDate() + 7)
  return e
})
const weekStartISO = computed(() => weekStart.value.toISOString())
const weekEndISO = computed(() => weekEnd.value.toISOString())

const sessionsThisWeek = computed(() =>
  sessions.value.filter(s => s.created_at >= weekStartISO.value && s.created_at < weekEndISO.value).length,
)
const weeklyLimit = computed(() => planLimits.value.sessionsWeekly)
const weeklyPercent = computed<number | null>(() => {
  if (weeklyLimit.value == null) return null
  if (weeklyLimit.value <= 0) return 0
  return Math.min(100, Math.round((sessionsThisWeek.value / weeklyLimit.value) * 100))
})

// ---- Storage probes ----
const localProbe = ref<{ supported: boolean, usage: number, quota: number, full: boolean }>({
  supported: false, usage: 0, quota: 0, full: false,
})

async function refreshLocalProbe() {
  try {
    const p = await probeLocal()
    localProbe.value = { supported: p.supported, usage: p.usage, quota: p.quota, full: p.full }
  }
  catch {}
}

const driveConnected = computed(() => isInstalled('google-drive'))
const driveUsageCard = computed(() =>
  storageUsageCards.value.find(c => c.provider === 'google-drive') ?? null,
)

const storageSummary = computed(() => {
  const local = localProbe.value
  const drive = driveUsageCard.value
  let used = 0
  let total = 0
  let unlimited = false
  let trackedAny = false

  if (local.supported && local.quota > 0) {
    used += local.usage
    total += local.quota
    trackedAny = true
  }
  if (driveConnected.value && drive?.state === 'tracked' && drive.used != null && drive.total != null) {
    used += drive.used
    total += drive.total
    trackedAny = true
  }
  if (driveConnected.value && drive?.state === 'unlimited') {
    unlimited = true
    trackedAny = true
  }
  return { used, total, unlimited, trackedAny }
})

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

const walletCurrency = computed(() => (wallet.value?.currency ?? 'usd') as any)
const walletBalanceText = computed(() => {
  if (!wallet.value) return '—'
  return formatCents(wallet.value.balance_cents, wallet.value.currency as any)
})

// ---- Lifecycle ----
function loadData() {
  const wsId = currentWorkspaceId.value
  if (!wsId) return
  fetchMembers(wsId)
  fetchSessions()
  fetchWallet()
  refreshDrive().catch(() => {})
  refreshLocalProbe()
}

watch(isOpen, (open) => {
  if (open) {
    loadData()
    if (!nowTicker) nowTicker = setInterval(() => { now.value = new Date() }, 60_000)
  }
  else if (nowTicker) {
    clearInterval(nowTicker)
    nowTicker = null
  }
})

onUnmounted(() => {
  if (nowTicker) clearInterval(nowTicker)
})

function close() {
  if (isTransferring.value || isDeleting.value) return
  isOpen.value = false
}

function handleUpgrade() {
  isOpen.value = false
  navigateTo({ path: '/pricing', query: upgradeQuery.value })
}

// ---- Transfer ownership ----
const isTransferOpen = ref(false)
const transferStep = ref<'select' | 'confirm'>('select')
const selectedTransferId = ref<string | null>(null)
const isTransferring = ref(false)
const transferError = ref('')

const selectedTransferMember = computed(() =>
  transferableMembers.value.find(m => m.user_id === selectedTransferId.value) ?? null,
)

function openTransferModal() {
  transferStep.value = 'select'
  selectedTransferId.value = null
  transferError.value = ''
  isTransferOpen.value = true
}

function closeTransferModal() {
  if (isTransferring.value) return
  isTransferOpen.value = false
}

function goToTransferConfirm() {
  if (!selectedTransferId.value) return
  transferStep.value = 'confirm'
}

async function handleTransferOwnership() {
  if (!currentWorkspace.value || !selectedTransferId.value || !user.value) return
  isTransferring.value = true
  transferError.value = ''
  try {
    const result = await transferOwnership(
      currentWorkspace.value.id,
      selectedTransferId.value,
      user.value.id,
    )
    if (!result.ok) {
      transferError.value = 'Failed to transfer ownership. Please try again.'
      return
    }
    isTransferOpen.value = false
  }
  finally {
    isTransferring.value = false
  }
}

// ---- Delete workspace ----
const isDeleteOpen = ref(false)
const isDeleting = ref(false)
const deleteError = ref('')

function openDeleteModal() {
  deleteError.value = ''
  isDeleteOpen.value = true
}

function closeDeleteModal() {
  if (isDeleting.value) return
  isDeleteOpen.value = false
}

async function handleDeleteWorkspace() {
  if (!currentWorkspace.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    const result = await deleteWorkspace(currentWorkspace.value.id)
    if (!result.ok) {
      deleteError.value = 'Failed to delete workspace. Please try again.'
      return
    }
    isDeleteOpen.value = false
    isOpen.value = false
    navigateTo('/dashboard/home')
  }
  finally {
    isDeleting.value = false
  }
}

// ---- Workspace identity (name + avatar) ----
const editName = ref('')
const isNameSaving = ref(false)
const isNameFocused = ref(false)
const identityError = ref('')

watch(currentWorkspace, (ws) => { if (ws) editName.value = ws.name }, { immediate: true })
watch(isOpen, (open) => { if (open && currentWorkspace.value) editName.value = currentWorkspace.value.name })

const nameValidation = computed(() => validateWorkspaceName(editName.value))
const nameError = computed(() => {
  if (!editName.value || editName.value === currentWorkspace.value?.name) return ''
  return nameValidation.value.ok ? '' : nameValidation.value.error
})

async function saveName() {
  if (!currentWorkspace.value || !canManageWorkspace.value) return
  const validation = validateWorkspaceName(editName.value)
  if (!validation.ok) return
  isNameSaving.value = true
  identityError.value = ''
  try {
    const result = await updateWorkspace(currentWorkspace.value.id, { name: editName.value.trim() })
    if (!result) identityError.value = t('workspaceMenu.identityUpdateError')
  }
  finally {
    isNameSaving.value = false
  }
}

const AVATAR_MAX_INPUT_BYTES = 1 * 1024 * 1024
const AVATAR_OUTPUT_SIZE = 256
const AVATAR_OUTPUT_QUALITY = 0.85
const avatarInput = ref<HTMLInputElement | null>(null)
const isAvatarSaving = ref(false)
const workspaceInitials = computed(() =>
  (currentWorkspace.value?.name?.trim().substring(0, 2) || 'W').toUpperCase(),
)

function triggerAvatarPicker() {
  if (!canManageWorkspace.value || isAvatarSaving.value) return
  avatarInput.value?.click()
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')) }
    img.src = url
  })
}

function cropImageToDataURL(img: HTMLImageElement): string {
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = Math.floor((img.naturalWidth - side) / 2)
  const sy = Math.floor((img.naturalHeight - side) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas-unsupported')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
  let dataUrl = canvas.toDataURL('image/webp', AVATAR_OUTPUT_QUALITY)
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', AVATAR_OUTPUT_QUALITY)
  }
  return dataUrl
}

async function handleAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !currentWorkspace.value || !canManageWorkspace.value) return

  identityError.value = ''
  if (!file.type.startsWith('image/')) {
    identityError.value = t('workspaceMenu.avatarErrorType')
    return
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    identityError.value = t('workspaceMenu.avatarErrorSize')
    return
  }

  let img: HTMLImageElement
  try { img = await loadImage(file) }
  catch {
    identityError.value = t('workspaceMenu.avatarErrorRead')
    return
  }

  isAvatarSaving.value = true
  try {
    const dataUrl = cropImageToDataURL(img)
    const result = await updateWorkspace(currentWorkspace.value.id, { avatar_url: dataUrl })
    if (!result) identityError.value = t('workspaceMenu.identityUpdateError')
  }
  catch (err) {
    console.error('[workspace-settings-modal] avatar upload failed', err)
    identityError.value = t('workspaceMenu.identityUpdateError')
  }
  finally {
    isAvatarSaving.value = false
  }
}

async function removeAvatar() {
  if (!currentWorkspace.value || !canManageWorkspace.value) return
  isAvatarSaving.value = true
  identityError.value = ''
  try {
    const result = await updateWorkspace(currentWorkspace.value.id, { avatar_url: null })
    if (!result) identityError.value = t('workspaceMenu.identityUpdateError')
  }
  finally {
    isAvatarSaving.value = false
  }
}

function memberDisplayName(m: WorkspaceMember) {
  return m.display_name || m.email || m.user_id.substring(0, 8) + '…'
}
function memberEmail(m: WorkspaceMember) {
  return m.email || '—'
}
function memberInitials(m: WorkspaceMember) {
  const name = m.display_name || m.email || m.user_id
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (isTransferOpen.value) { closeTransferModal(); return }
  if (isDeleteOpen.value) { closeDeleteModal(); return }
  close()
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="close"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isOpen"
            class="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace settings"
            @click.stop
          >
            <!-- Header -->
            <div class="relative flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
              <h2 class="truncate text-sm font-semibold text-neutral-950">
                {{ t('workspaceMenu.modalTitle') }}
              </h2>
              <button
                type="button"
                class="p-1 text-neutral-400 transition-colors hover:text-neutral-950"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto">
              <div class="divide-y divide-neutral-100 px-5">
                <!-- Identity (avatar + name) -->
                <section class="py-5">
                  <div class="flex items-start gap-4">
                    <!-- Avatar + change link -->
                    <div class="flex shrink-0 flex-col items-center gap-2">
                      <div class="relative size-14 overflow-hidden rounded-lg ring-1 ring-neutral-200/70">
                        <img
                          v-if="currentWorkspace?.avatar_url"
                          :src="currentWorkspace.avatar_url"
                          alt=""
                          class="h-full w-full object-cover"
                        />
                        <div
                          v-else
                          class="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950 text-base font-bold text-white"
                          aria-hidden="true"
                        >
                          {{ workspaceInitials }}
                        </div>
                        <div
                          v-if="isAvatarSaving"
                          class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-white"
                          aria-hidden="true"
                        >
                          <svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="9" stroke-opacity="0.3" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
                          </svg>
                        </div>
                      </div>
                      <button
                        v-if="canManageWorkspace"
                        type="button"
                        class="whitespace-nowrap text-[10px] font-medium text-neutral-600 transition-colors hover:text-neutral-950 disabled:opacity-50"
                        :disabled="isAvatarSaving"
                        @click="triggerAvatarPicker"
                      >
                        {{ t('workspaceMenu.changeImage') }}
                      </button>
                    </div>

                    <!-- Name field -->
                    <div class="min-w-0 flex-1">
                      <label
                        for="ws-settings-name"
                        class="block text-[10px] font-medium uppercase tracking-wider text-neutral-500"
                      >
                        {{ t('workspaceMenu.workspaceName') }}
                      </label>
                      <div class="mt-1.5 flex gap-2">
                        <div class="relative min-w-0 flex-1">
                          <input
                            id="ws-settings-name"
                            v-model="editName"
                            type="text"
                            :maxlength="WORKSPACE_NAME_MAX_LENGTH"
                            :placeholder="t('workspaceMenu.workspaceName')"
                            class="w-full rounded-md border-0 bg-neutral-50 px-2.5 py-1.5 pr-12 text-xs text-neutral-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-neutral-950/10 disabled:cursor-not-allowed disabled:text-neutral-500"
                            :disabled="!canManageWorkspace || isNameSaving"
                            @focus="isNameFocused = true"
                            @blur="isNameFocused = false"
                            @keyup.enter="saveName"
                          />
                          <span
                            v-if="isNameFocused && canManageWorkspace"
                            class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] leading-none tabular-nums text-neutral-400"
                          >
                            {{ editName.length }}/{{ WORKSPACE_NAME_MAX_LENGTH }}
                          </span>
                        </div>
                        <button
                          v-if="canManageWorkspace"
                          type="button"
                          class="shrink-0 rounded-md bg-neutral-950 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                          :disabled="isNameSaving || !nameValidation.ok || editName.trim() === currentWorkspace?.name"
                          @click="saveName"
                        >
                          {{ isNameSaving ? t('workspaceMenu.saving') : t('common.save') }}
                        </button>
                      </div>
                      <div class="mt-1.5 flex min-h-[14px] items-center justify-between gap-3 text-[10px] leading-tight">
                        <p v-if="nameError" class="text-red-600">{{ nameError }}</p>
                        <p v-else-if="identityError" class="text-red-600">{{ identityError }}</p>
                        <p v-else-if="canManageWorkspace" class="text-neutral-400">
                          {{ t('workspaceMenu.avatarHint') }}
                        </p>
                        <span v-else />
                        <button
                          v-if="canManageWorkspace && currentWorkspace?.avatar_url"
                          type="button"
                          class="shrink-0 text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50"
                          :disabled="isAvatarSaving"
                          @click="removeAvatar"
                        >
                          {{ t('workspaceMenu.removeImage') }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <input
                    ref="avatarInput"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleAvatarSelected"
                  />
                </section>

                <!-- Plan + Usage -->
                <section class="py-5">
                  <div class="mb-5 flex items-center justify-between gap-4">
                    <div class="flex min-w-0 items-center gap-3">
                      <span
                        :class="planAccentClass"
                        class="h-9 w-1 shrink-0 rounded-full"
                        aria-hidden="true"
                      />
                      <div class="min-w-0">
                        <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                          {{ t('workspaceMenu.currentPlan') }}
                        </p>
                        <h3 class="mt-0.5 text-sm font-semibold text-neutral-950">{{ planLabel }}</h3>
                      </div>
                    </div>
                    <button
                      v-if="showUpgrade"
                      type="button"
                      class="shrink-0 rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      @click="handleUpgrade"
                    >
                      {{ t('common.upgrade') }}
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                    <!-- Weekly sessions -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statSessions') }}
                      </p>
                      <p class="mt-1 font-mono text-xs leading-none text-neutral-950">
                        <span class="font-semibold">{{ sessionsThisWeek.toLocaleString() }}</span>
                        <span class="text-neutral-400">/ {{ weeklyLimit == null ? '∞' : weeklyLimit.toLocaleString() }}</span>
                      </p>
                      <div class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60">
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: (weeklyPercent ?? 0) + '%' }"
                        />
                      </div>
                    </div>

                    <!-- Seats -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statSeats') }}
                      </p>
                      <p class="mt-1 font-mono text-xs leading-none text-neutral-950">
                        <span class="font-semibold">{{ members.length }}</span>
                        <span class="text-neutral-400">/ {{ planLimits.seats == null ? '∞' : planLimits.seats }}</span>
                      </p>
                      <div class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60">
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: (planLimits.seats ? Math.min(100, Math.round((members.length / planLimits.seats) * 100)) : 100) + '%' }"
                        />
                      </div>
                    </div>

                    <!-- Tokens / wallet balance -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statTokens') }}
                      </p>
                      <p class="mt-1 truncate font-mono text-xs font-semibold leading-none text-neutral-950">
                        {{ walletBalanceText }}
                      </p>
                      <p class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statTokensCaption') }}
                      </p>
                    </div>

                    <!-- Storage -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statStorage') }}
                      </p>
                      <p v-if="storageSummary.unlimited" class="mt-1 font-mono text-xs font-semibold leading-none text-neutral-950">∞</p>
                      <p v-else-if="storageSummary.trackedAny && storageSummary.total > 0" class="mt-1 font-mono text-xs leading-none text-neutral-950">
                        <span class="font-semibold">{{ formatBytes(storageSummary.used) }}</span>
                        <span class="text-neutral-400">/ {{ formatBytes(storageSummary.total) }}</span>
                      </p>
                      <p v-else class="mt-1 font-mono text-xs font-semibold leading-none text-neutral-400">—</p>
                      <div v-if="!storageSummary.unlimited && storageSummary.total > 0" class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60">
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: Math.min(100, Math.round((storageSummary.used / storageSummary.total) * 100)) + '%' }"
                        />
                      </div>
                      <p v-else class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statStorageCaption') }}
                      </p>
                    </div>

                    <!-- Browser agents -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statAgents') }}
                      </p>
                      <p class="mt-1 font-mono text-xs font-semibold leading-none text-neutral-950">
                        <template v-if="planLimits.browserAgents == null">∞</template>
                        <template v-else>{{ planLimits.browserAgents.toLocaleString() }}</template>
                      </p>
                      <p class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statAgentsCaption') }}
                      </p>
                    </div>

                    <!-- Max file size -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statFileSize') }}
                      </p>
                      <p class="mt-1 font-mono text-xs font-semibold leading-none text-neutral-950">
                        <template v-if="planLimits.fileSizeBytes == null">∞</template>
                        <template v-else>{{ formatBytes(planLimits.fileSizeBytes) }}</template>
                      </p>
                      <p class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statFileSizeCaption') }}
                      </p>
                    </div>
                  </div>
                </section>

                <!-- Administration -->
                <section v-if="canTransferOwnership || canDeleteWorkspace" class="py-5">
                  <h3 class="mb-4 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                    {{ t('workspaceMenu.administration') }}
                  </h3>

                  <div class="space-y-4">
                    <div v-if="canTransferOwnership" class="flex items-start justify-between gap-4">
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-neutral-950">{{ t('workspaceMenu.transferOwnership') }}</p>
                        <p class="mt-1 text-[11px] leading-snug text-neutral-500">{{ t('workspaceMenu.transferOwnershipDesc') }}</p>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 self-center rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                        @click="openTransferModal"
                      >
                        {{ t('workspaceMenu.transferAction') }}
                      </button>
                    </div>

                    <div v-if="canDeleteWorkspace" class="flex items-start justify-between gap-4">
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-red-700">{{ t('workspaceMenu.deleteWorkspace') }}</p>
                        <p class="mt-1 text-[11px] leading-snug text-neutral-500">{{ t('workspaceMenu.deleteWorkspaceDesc') }}</p>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 self-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        @click="openDeleteModal"
                      >
                        {{ t('common.delete') }}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Transfer ownership modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isTransferOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="closeTransferModal"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isTransferOpen"
            class="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">
                  {{ transferStep === 'select' ? t('workspaceMenu.transferOwnership') : t('workspaceMenu.confirmTransfer') }}
                </h3>
                <p class="mt-0.5 text-[11px] text-neutral-500">
                  {{ transferStep === 'select' ? t('workspaceMenu.transferSelectDesc') : t('workspaceMenu.transferConfirmDesc') }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                :disabled="isTransferring"
                @click="closeTransferModal"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-4">
              <div v-if="transferStep === 'select'">
                <div v-if="transferableMembers.length === 0" class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
                  <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <p class="text-xs leading-relaxed text-amber-900">
                    {{ t('workspaceMenu.transferNoOthers') }}
                  </p>
                </div>
                <div v-else class="divide-y divide-neutral-100 overflow-hidden rounded-lg ring-1 ring-neutral-200">
                  <label
                    v-for="m in transferDisplayMembers"
                    :key="m.user_id"
                    class="flex items-center gap-3 px-3 py-2.5 transition-colors"
                    :class="[
                      m.role === 'owner' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-neutral-50',
                      selectedTransferId === m.user_id ? 'bg-neutral-50' : '',
                    ]"
                  >
                    <input
                      v-model="selectedTransferId"
                      type="radio"
                      name="transfer-target-modal"
                      :value="m.user_id"
                      :disabled="m.role === 'owner'"
                      class="size-4 accent-neutral-950"
                    />
                    <AccountIcon :initials="memberInitials(m)" size="sm" color="bg-neutral-800" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-medium text-neutral-950">{{ memberDisplayName(m) }}</p>
                      <p class="truncate text-[11px] text-neutral-400">{{ memberEmail(m) }}</p>
                    </div>
                    <span class="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium capitalize text-neutral-600">
                      {{ m.role === 'owner' ? t('workspaceMenu.currentOwner') : m.role }}
                    </span>
                  </label>
                </div>
              </div>

              <div v-else-if="selectedTransferMember" class="space-y-3">
                <div class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
                  <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <p class="text-xs leading-relaxed text-amber-900">
                    {{ t('workspaceMenu.transferWarning') }}
                  </p>
                </div>
                <div class="flex items-center gap-3 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200">
                  <AccountIcon :initials="memberInitials(selectedTransferMember)" size="md" color="bg-neutral-800" />
                  <div class="min-w-0">
                    <p class="truncate text-xs font-medium text-neutral-950">{{ memberDisplayName(selectedTransferMember) }}</p>
                    <p class="truncate text-[11px] text-neutral-400">{{ memberEmail(selectedTransferMember) }}</p>
                  </div>
                </div>
                <p v-if="transferError" class="text-[11px] text-red-600">{{ transferError }}</p>
              </div>
            </div>

            <div class="flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                v-if="transferStep === 'confirm'"
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                :disabled="isTransferring"
                @click="transferStep = 'select'"
              >
                {{ t('common.back') }}
              </button>
              <span v-else />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  :disabled="isTransferring"
                  @click="closeTransferModal"
                >
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-if="transferStep === 'select' && transferableMembers.length > 0"
                  type="button"
                  class="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="!selectedTransferId"
                  @click="goToTransferConfirm"
                >
                  {{ t('workspaceMenu.continue') }}
                </button>
                <button
                  v-else-if="transferStep === 'confirm'"
                  type="button"
                  class="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="isTransferring"
                  @click="handleTransferOwnership"
                >
                  {{ isTransferring ? t('workspaceMenu.transferring') : t('workspaceMenu.transferAction') }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Delete workspace modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDeleteOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="closeDeleteModal"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isDeleteOpen"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="flex items-start justify-between border-b border-neutral-100 px-5 py-3.5">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">
                  {{ isOnlyWorkspace ? t('workspaceMenu.cannotDelete') : t('workspaceMenu.deleteWorkspace') }}
                </h3>
                <p class="mt-0.5 text-[11px] text-neutral-500">
                  {{ isOnlyWorkspace ? t('workspaceMenu.onlyWorkspace') : t('workspaceMenu.cannotBeUndone') }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                :disabled="isDeleting"
                @click="closeDeleteModal"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div class="px-5 py-4">
              <div v-if="isOnlyWorkspace" class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60">
                <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <p class="text-xs leading-relaxed text-amber-900">
                  {{ t('workspaceMenu.onlyWorkspaceMsg') }}
                </p>
              </div>
              <div v-else class="space-y-3">
                <div class="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 ring-1 ring-red-200/60">
                  <svg class="mt-0.5 size-4 shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <p class="text-xs leading-relaxed text-red-900">
                    {{ t('workspaceMenu.deleteWarning', { name: currentWorkspace?.name ?? '' }) }}
                  </p>
                </div>
                <p v-if="deleteError" class="text-[11px] text-red-600">{{ deleteError }}</p>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                :disabled="isDeleting"
                @click="closeDeleteModal"
              >
                {{ isOnlyWorkspace ? t('common.close') : t('common.cancel') }}
              </button>
              <button
                v-if="!isOnlyWorkspace"
                type="button"
                class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                :disabled="isDeleting"
                @click="handleDeleteWorkspace"
              >
                {{ isDeleting ? t('workspaceMenu.deleting') : t('workspaceMenu.confirmDelete') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
