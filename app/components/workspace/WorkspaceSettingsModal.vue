<script setup lang="ts">
import { normalizePlanKey, type PlanUpgradePlanKey } from '~/composables/account/usePlanUpgradeNavigation'
import {
  browserAgentCapFromPlan,
  maxFileUploadBytesFromPlan,
  maxMembersFromPlan,
  tokenBudgetWeeklyFromPlan,
  workflowRunsMonthlyCapFromPlan,
} from '~/utils/planLimits'
import { weekStartUtc } from '~/utils/weekStartUtc'

const isOpen = defineModel<boolean>('open', { default: false })

const { t, locale } = useI18n()
const user = useSupabaseUser()
const supabase = useSupabaseClient()

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

const { probe: probeLocal } = useLocalFileStorage()
const { cards: storageUsageCards, refreshDrive, driveConnectionBroken } = useStorageUsage()
const { isInstalled } = useMarketplace()
const { resolvedOrder } = useStoragePreferences()

const planKey = computed(() => normalizePlanKey(currentWorkspace.value?.plan as string | undefined))
const planSlug = computed(() => currentWorkspace.value?.plan ?? null)
const planLabel = computed(() => planKey.value.charAt(0).toUpperCase() + planKey.value.slice(1))
const showUpgrade = computed(() => planKey.value !== 'enterprise')

/** 0 = unlimited (enterprise). Matches Go `PlanConfig` and `planLimits.ts`. */
const seatsCap = computed(() => maxMembersFromPlan(planSlug.value))
const weeklyTokenCap = computed(() => tokenBudgetWeeklyFromPlan(planSlug.value))
const workflowRunsCap = computed(() => workflowRunsMonthlyCapFromPlan(planSlug.value))
const browserAgentsCap = computed(() => browserAgentCapFromPlan(planSlug.value))
const maxFileBytes = computed(() => maxFileUploadBytesFromPlan(planSlug.value))

const PLAN_ACCENT: Record<PlanUpgradePlanKey, string> = {
  free: 'bg-neutral-300',
  pro: 'bg-blue-400',
  max: 'bg-amber-400',
  enterprise: 'bg-purple-400',
}
const planAccentClass = computed(() => PLAN_ACCENT[planKey.value] ?? PLAN_ACCENT.free)

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageWorkspace = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const canTransferOwnership = computed(() => myRole.value === 'owner')
const canDeleteWorkspace = computed(() => myRole.value === 'owner')
const isOnlyWorkspace = computed(() => workspaces.value.length <= 1)

// ---- Subscription management (cancel / downgrade at period end) ----
const {
  status: subStatus,
  actionLoading: subActionLoading,
  error: subError,
  fetchStatus: fetchSubStatus,
  cancel: cancelSubscription,
  downgrade: downgradeSubscription,
  resume: resumeSubscription,
} = useSubscription(currentWorkspaceId)

const isPaidPlan = computed(() => planKey.value === 'pro' || planKey.value === 'max')
const hasSubscription = computed(() => subStatus.value?.hasSubscription === true)
const pendingCancel = computed(() => subStatus.value?.cancelAtPeriodEnd === true)
const pendingDowngradePlan = computed(() => subStatus.value?.scheduledPlan ?? null)
const hasPendingChange = computed(() => pendingCancel.value || !!pendingDowngradePlan.value)
// Pro is the only paid tier below Max; Pro itself can only cancel (→ Free).
const canDowngradeToPro = computed(() => planKey.value === 'max')
const showPlanManagement = computed(() => canManageWorkspace.value && isPaidPlan.value && hasSubscription.value)

const periodEndLabel = computed(() => {
  const iso = subStatus.value?.currentPeriodEnd
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try { return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(d) }
  catch { return d.toISOString().slice(0, 10) }
})

function planLabelOf(plan?: string | null): string {
  const p = (plan || 'free').toLowerCase()
  return p.charAt(0).toUpperCase() + p.slice(1)
}

// Cancel / downgrade confirmation modal
const cancelModalOpen = ref(false)
const cancelModalMode = ref<'cancel' | 'downgrade'>('cancel')
const cancelTargetPlan = ref('free')

function openCancelModal() {
  cancelModalMode.value = 'cancel'
  cancelTargetPlan.value = 'free'
  subError.value = ''
  cancelModalOpen.value = true
}
function openDowngradeModal() {
  cancelModalMode.value = 'downgrade'
  cancelTargetPlan.value = 'pro'
  subError.value = ''
  cancelModalOpen.value = true
}
async function confirmPlanChange() {
  const ok = cancelModalMode.value === 'cancel'
    ? await cancelSubscription()
    : await downgradeSubscription(cancelTargetPlan.value)
  if (ok) cancelModalOpen.value = false
}
async function handleResume() {
  subError.value = ''
  await resumeSubscription()
}

const transferableMembers = computed(() =>
  members.value.filter(m => m.user_id !== user.value?.id),
)
const transferDisplayMembers = computed(() => {
  const owner = members.value.find(m => m.role === 'owner')
  const others = members.value.filter(m => m.role !== 'owner')
  return owner ? [owner, ...others] : others
})

// ---- Usage from Supabase (matches server enforcement) ----
const tokenUsedWeekly = ref<number | null>(null)
const workflowRunsMonth = ref<number | null>(null)

async function refreshUsageFromSupabase(wsId: string) {
  tokenUsedWeekly.value = null
  workflowRunsMonth.value = null

  const weekStart = weekStartUtc()
  const sb = supabase as unknown as RpcCapable

  try {
    const { data: tok, error: eTok } = await sb.rpc('get_workspace_token_usage', {
      p_workspace_id: wsId,
      p_week_start: weekStart.toISOString(),
    })
    if (eTok) {
      console.warn('[WorkspaceSettingsModal] get_workspace_token_usage:', eTok.message)
    }
    else {
      const raw = typeof tok === 'bigint' ? Number(tok) : Number(tok ?? 0)
      tokenUsedWeekly.value = Number.isFinite(raw) ? raw : 0
    }
  }
  catch (e) {
    console.warn('[WorkspaceSettingsModal] token usage:', e)
  }

  try {
    const { data: runs, error: eRuns } = await sb.rpc('count_workspace_workflow_runs_this_month', {
      p_workspace_id: wsId,
    })
    if (eRuns) {
      console.warn('[WorkspaceSettingsModal] count_workspace_workflow_runs_this_month:', eRuns.message)
    }
    else {
      const raw = typeof runs === 'bigint' ? Number(runs) : Number(runs ?? 0)
      workflowRunsMonth.value = Number.isFinite(raw) ? raw : 0
    }
  }
  catch (e) {
    console.warn('[WorkspaceSettingsModal] workflow runs count:', e)
  }
}

const weeklyTokensPercent = computed<number | null>(() => {
  const cap = weeklyTokenCap.value
  const used = tokenUsedWeekly.value
  if (cap <= 0 || used == null) return null
  return Math.min(100, Math.round((used / cap) * 100))
})

const workflowRunsPercent = computed<number | null>(() => {
  const cap = workflowRunsCap.value
  const used = workflowRunsMonth.value
  if (cap <= 0 || used == null) return null
  return Math.min(100, Math.round((used / cap) * 100))
})

function seatsFilledPercent(): number | null {
  const cap = seatsCap.value
  if (cap <= 0) return null
  return Math.min(100, Math.round((members.value.length / cap) * 100))
}

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

// True when the workspace has more than one member AND the user's currently-
// resolved primary save target is `local` (browser OPFS). OPFS bytes don't
// leave the writer's device, so teammates would get "not available here" when
// they try to open files saved by another member. The banner self-clears
// once the user connects Drive / enables Cloud, or reorders to deprioritise
// `local`.
const localPrimaryRiskyForTeam = computed(() =>
  resolvedOrder.value[0] === 'local' && members.value.length > 1,
)

// ---- Lifecycle ----
function loadData() {
  const wsId = currentWorkspaceId.value
  if (!wsId) return
  fetchMembers(wsId, { force: true })
  refreshUsageFromSupabase(wsId)
  refreshDrive(driveConnectionBroken.value).catch(() => {})
  refreshLocalProbe()
  fetchSubStatus().catch(() => {})
}

watch(isOpen, (open) => {
  if (open) loadData()
})

function close() {
  if (isTransferring.value || isDeleting.value) return
  isOpen.value = false
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
      transferError.value = t('workspaceMenu.transferOwnershipFailed')
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
      deleteError.value = t('workspaceMenu.deleteWorkspaceFailed')
      return
    }
    isDeleteOpen.value = false
    isOpen.value = false
    navigateTo('/dashboard/console')
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

const avatarInput = ref<HTMLInputElement | null>(null)
const isAvatarSaving = ref(false)
const workspaceInitials = computed(() =>
  (currentWorkspace.value?.name?.trim().substring(0, 2) || 'W').toUpperCase(),
)

function triggerAvatarPicker() {
  if (!canManageWorkspace.value || isAvatarSaving.value) return
  avatarInput.value?.click()
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
            :aria-label="t('workspaceMenu.modalTitle')"
            @click.stop
          >
            <div class="relative shrink-0 px-5 pt-5 pb-4">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
              <div class="pr-6">
                <h2 class="text-sm font-semibold text-neutral-900">{{ t('workspaceMenu.modalTitle') }}</h2>
              </div>
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
                    name="workspace-avatar"
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
                    <PlanUpgradeButton
                      v-if="showUpgrade"
                      :before-navigate="close"
                    />
                  </div>

                  <div
                    v-if="localPrimaryRiskyForTeam"
                    class="mb-4 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60"
                  >
                    <svg
                      class="mt-0.5 size-4 shrink-0 text-amber-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path
                        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                      />
                    </svg>
                    <p class="text-xs leading-relaxed text-amber-900">
                      {{ t('workspaceMenu.localPrimaryTeamWarning') }}
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                    <!-- Weekly token budget (Monday UTC — same cadence as chat enforcement) -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statWeeklyTokens') }}
                      </p>
                      <p class="mt-1 font-mono text-xs leading-none text-neutral-950">
                        <span class="font-semibold">{{ tokenUsedWeekly == null ? '—' : tokenUsedWeekly.toLocaleString() }}</span>
                        <span class="text-neutral-400">/ {{ weeklyTokenCap <= 0 ? '∞' : weeklyTokenCap.toLocaleString() }}</span>
                      </p>
                      <div
                        v-if="weeklyTokenCap > 0"
                        class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60"
                      >
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: (weeklyTokensPercent ?? 0) + '%' }"
                        />
                      </div>
                      <p class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statWeeklyTokensCaption') }}
                      </p>
                    </div>

                    <!-- Workflow runs this calendar month (UTC) -->
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        {{ t('workspaceMenu.statWorkflowRuns') }}
                      </p>
                      <p class="mt-1 font-mono text-xs leading-none text-neutral-950">
                        <span class="font-semibold">{{ workflowRunsMonth == null ? '—' : workflowRunsMonth.toLocaleString() }}</span>
                        <span class="text-neutral-400">/ {{ workflowRunsCap <= 0 ? '∞' : workflowRunsCap.toLocaleString() }}</span>
                      </p>
                      <div
                        v-if="workflowRunsCap > 0"
                        class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60"
                      >
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: (workflowRunsPercent ?? 0) + '%' }"
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
                        <span class="text-neutral-400">/ {{ seatsCap <= 0 ? '∞' : seatsCap }}</span>
                      </p>
                      <div
                        v-if="seatsCap > 0"
                        class="mt-1.5 h-0.5 overflow-hidden rounded-full bg-neutral-200/60"
                      >
                        <div
                          class="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out"
                          :style="{ width: (seatsFilledPercent() ?? 0) + '%' }"
                        />
                      </div>
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
                        {{ browserAgentsCap.toLocaleString() }}
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
                        {{ formatBytes(maxFileBytes) }}
                      </p>
                      <p class="mt-1.5 text-[10px] text-neutral-400">
                        {{ t('workspaceMenu.statFileSizeCaption') }}
                      </p>
                    </div>
                  </div>

                  <!-- Plan management: cancel / downgrade at period end -->
                  <div v-if="showPlanManagement" class="mt-5 border-t border-neutral-100 pt-4">
                    <!-- Pending scheduled change → banner + resume -->
                    <div
                      v-if="hasPendingChange"
                      class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60"
                    >
                      <svg
                        class="mt-0.5 size-4 shrink-0 text-amber-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                      <div class="min-w-0 flex-1">
                        <p class="text-xs leading-relaxed text-amber-900">
                          <template v-if="pendingCancel">
                            {{ periodEndLabel
                              ? t('workspaceMenu.scheduledCancelBanner', { plan: planLabel, date: periodEndLabel })
                              : t('workspaceMenu.scheduledCancelBannerNoDate', { plan: planLabel }) }}
                          </template>
                          <template v-else>
                            {{ periodEndLabel
                              ? t('workspaceMenu.scheduledDowngradeBanner', { plan: planLabel, target: planLabelOf(pendingDowngradePlan), date: periodEndLabel })
                              : t('workspaceMenu.scheduledDowngradeBannerNoDate', { plan: planLabel, target: planLabelOf(pendingDowngradePlan) }) }}
                          </template>
                        </p>
                        <div class="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            class="rounded-md bg-neutral-950 px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            :disabled="subActionLoading"
                            @click="handleResume"
                          >
                            {{ subActionLoading ? t('workspaceMenu.keeping') : t('workspaceMenu.keepPlan') }}
                          </button>
                          <p v-if="subError" class="text-[11px] text-red-600">{{ subError }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- No pending change → manage actions -->
                    <div v-else class="flex items-start justify-between gap-4">
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-neutral-950">{{ t('workspaceMenu.managePlan') }}</p>
                        <p class="mt-1 text-[11px] leading-snug text-neutral-500">{{ t('workspaceMenu.managePlanDesc') }}</p>
                      </div>
                      <div class="flex shrink-0 items-center gap-2 self-center">
                        <button
                          v-if="canDowngradeToPro"
                          type="button"
                          class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                          @click="openDowngradeModal"
                        >
                          {{ t('workspaceMenu.downgradeToPro') }}
                        </button>
                        <button
                          type="button"
                          class="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          @click="openCancelModal"
                        >
                          {{ t('workspaceMenu.cancelPlan') }}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- BYOK / LLM Keys -->
                <WorkspaceLLMKeysPanel
                  :workspace-id="currentWorkspaceId"
                  :can-manage="canManageWorkspace"
                />

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
            <div class="flex items-center justify-between px-5 py-3.5">
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

            <div class="flex items-center justify-between gap-2 px-5 py-3.5">
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
            <div class="flex items-start justify-between px-5 py-3.5">
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

            <div class="flex justify-end gap-2 px-5 py-3.5">
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

  <!-- Cancel / downgrade confirmation (teleports itself; stacks above settings) -->
  <WorkspaceCancelPlanModal
    v-model:open="cancelModalOpen"
    :mode="cancelModalMode"
    :current-plan="planKey"
    :target-plan="cancelTargetPlan"
    :period-end="subStatus?.currentPeriodEnd ?? null"
    :busy="subActionLoading"
    :error-message="subError"
    @confirm="confirmPlanChange"
  />
</template>
