<script setup lang="ts">
import { normalizePlanKey } from '~/composables/account/usePlanUpgradeNavigation'
import {
  maxMembersFromPlan,
  tokenBudgetWeeklyFromPlan,
  workflowRunsMonthlyCapFromPlan,
} from '~/utils/planLimits'
import { weekStartUtc } from '~/utils/weekStartUtc'

const props = withDefaults(defineProps<{
  inline?: boolean
}>(), {
  inline: false,
})

const isOpen = defineModel<boolean>('open', { default: false })
const isInline = computed(() => props.inline)
const isPanelVisible = computed(() => isInline.value || isOpen.value)

const { t, locale } = useI18n()
const user = useSupabaseUser()
const supabase = useSupabaseClient()

const {
  workspaces,
  currentWorkspace,
  currentWorkspaceId,
  currentMemberCount,
  members,
  fetchMembers,
  updateWorkspace,
  transferOwnership,
  deleteWorkspace,
} = useWorkspaces()

// Seat count: prefer the freshly-loaded members list, else fall back to the
// cache-aware count (localStorage-seeded) so the seats stat doesn't flash 0
// before fetchMembers resolves on modal open.
const seatCount = computed(() => members.value.length || currentMemberCount.value)

const planKey = computed(() => normalizePlanKey(currentWorkspace.value?.plan as string | undefined))
const planSlug = computed(() => currentWorkspace.value?.plan ?? null)
const planLabel = computed(() => planKey.value.charAt(0).toUpperCase() + planKey.value.slice(1))
const showUpgrade = computed(() => planKey.value !== 'enterprise')

/** 0 = unlimited (enterprise). Matches Go `PlanConfig` and `planLimits.ts`. */
const seatsCap = computed(() => maxMembersFromPlan(planSlug.value))
const weeklyTokenCap = computed(() => tokenBudgetWeeklyFromPlan(planSlug.value))
const workflowRunsCap = computed(() => workflowRunsMonthlyCapFromPlan(planSlug.value))

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageWorkspace = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const canTransferOwnership = computed(() => myRole.value === 'owner')
const canDeleteWorkspace = computed(() => myRole.value === 'owner')
const canClearWorkflows = computed(() => canManageWorkspace.value)
const isOnlyWorkspace = computed(() => workspaces.value.length <= 1)
const isManageMembersOpen = ref(false)

function openManageMembers() {
  isManageMembersOpen.value = true
}

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

// ---- Lifecycle ----
function loadData() {
  const wsId = currentWorkspaceId.value
  if (!wsId) return
  fetchMembers(wsId, { force: true })
  refreshUsageFromSupabase(wsId)
  fetchSubStatus().catch(() => {})
}

watch(isPanelVisible, (open) => {
  if (open) loadData()
}, { immediate: true })

function close() {
  if (isTransferring.value || isDeleting.value || isClearingWorkflows.value) return
  if (isInline.value) return
  isOpen.value = false
}

// ---- Clear all workflows ----
const route = useRoute()
const toast = useAppToast()
const { sessions: workflowSessions, clearAllSessions } = useWorkflowList()
const workflowCount = computed(() => workflowSessions.value.length)

const isClearWorkflowsOpen = ref(false)
const isClearingWorkflows = ref(false)
const clearWorkflowsError = ref('')

function openClearWorkflows() {
  if (workflowCount.value === 0) return
  clearWorkflowsError.value = ''
  isClearWorkflowsOpen.value = true
}

function closeClearWorkflows() {
  if (isClearingWorkflows.value) return
  isClearWorkflowsOpen.value = false
  clearWorkflowsError.value = ''
}

async function confirmClearWorkflows() {
  isClearingWorkflows.value = true
  clearWorkflowsError.value = ''
  try {
    const { deleted, failed } = await clearAllSessions()
    if (failed > 0) {
      clearWorkflowsError.value = t('settings.clearWorkflowsPartialError', { count: failed })
      return
    }
    isClearWorkflowsOpen.value = false
    toast.show(t('settings.clearWorkflowsDone', { count: deleted }), 'info', 4000)
    // The current workflow page (if any) now points at a deleted row; send the
    // user back to the draft flow entry point.
    if (route.path.startsWith('/workflow')) {
      isOpen.value = false
      await navigateTo('/workflow/new')
    }
  }
  catch (err: unknown) {
    clearWorkflowsError.value = err instanceof Error ? err.message : t('settings.clearWorkflowsError')
  }
  finally {
    isClearingWorkflows.value = false
  }
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
    navigateTo('/workflow/new')
  }
  finally {
    isDeleting.value = false
  }
}

// ---- Workspace identity (name + avatar) ----
const editName = ref('')
const isNameSaving = ref(false)
const isNameEditing = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const identityError = ref('')

watch(currentWorkspace, (ws) => {
  if (ws && !isNameEditing.value) editName.value = ws.name
}, { immediate: true })
watch(isPanelVisible, (open) => {
  if (open && currentWorkspace.value && !isNameEditing.value) editName.value = currentWorkspace.value.name
})

const nameValidation = computed(() => validateWorkspaceName(editName.value))
const nameError = computed(() => {
  if (!editName.value || editName.value === currentWorkspace.value?.name) return ''
  return nameValidation.value.ok ? '' : nameValidation.value.error
})

function startNameEdit() {
  if (!currentWorkspace.value || !canManageWorkspace.value || isNameSaving.value) return
  editName.value = currentWorkspace.value.name
  identityError.value = ''
  isNameEditing.value = true
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
}

function cancelNameEdit() {
  if (isNameSaving.value) return
  if (currentWorkspace.value) editName.value = currentWorkspace.value.name
  identityError.value = ''
  isNameEditing.value = false
}

async function saveName() {
  if (!currentWorkspace.value || !canManageWorkspace.value) return
  const validation = validateWorkspaceName(editName.value)
  if (!validation.ok) return
  isNameSaving.value = true
  identityError.value = ''
  try {
    const result = await updateWorkspace(currentWorkspace.value.id, { name: editName.value.trim() })
    if (!result) identityError.value = t('workspaceMenu.identityUpdateError')
    else isNameEditing.value = false
  }
  finally {
    isNameSaving.value = false
  }
}

const avatarInput = ref<HTMLInputElement | null>(null)
const isAvatarSaving = ref(false)
const workspaceInitials = computed(() =>
  (currentWorkspace.value?.name?.trim().charAt(0) || 'W').toUpperCase(),
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
  if (isNameEditing.value) { cancelNameEdit(); return }
  if (isClearWorkflowsOpen.value) { closeClearWorkflows(); return }
  if (isTransferOpen.value) { closeTransferModal(); return }
  if (isDeleteOpen.value) { closeDeleteModal(); return }
  close()
}

watch(isPanelVisible, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body" :disabled="isInline">
    <Transition
      :css="!isInline"
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isPanelVisible"
        :class="isInline
          ? 'flex min-h-0 min-w-0 flex-1 flex-col'
          : 'fixed inset-0 z-50 flex items-stretch justify-end bg-neutral-950/25 p-2 backdrop-blur-[2px] sm:p-4'"
        :role="isInline ? undefined : 'presentation'"
        @click.self="!isInline && close()"
      >
        <Transition
          :css="!isInline"
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="translate-x-5 opacity-0"
          leave-to-class="translate-x-5 opacity-0"
        >
          <div
            v-if="isPanelVisible"
            class="flex w-full flex-col overflow-hidden"
            :class="isInline
              ? 'min-h-0 flex-1 bg-transparent'
              : 'h-full max-w-xl rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200'"
            :style="isInline ? undefined : 'max-height: calc(100svh - 1rem)'"
            :role="isInline ? undefined : 'dialog'"
            :aria-modal="isInline ? undefined : 'true'"
            :aria-label="t('workspaceMenu.modalTitle')"
            @click.stop
          >
            <div
              v-if="!isInline"
              class="relative shrink-0 border-b border-neutral-200 bg-white px-5 pt-5 pb-4"
            >
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                :aria-label="t('common.close')"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
              <div class="flex items-center justify-between gap-4 pr-6">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="relative size-9 shrink-0 overflow-hidden rounded-lg bg-neutral-950 text-sm font-bold text-white ring-1 ring-neutral-200/70">
                    <img
                      v-if="currentWorkspace?.avatar_url"
                      :src="currentWorkspace.avatar_url"
                      alt=""
                      class="h-full w-full object-cover"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950"
                      aria-hidden="true"
                    >
                      {{ workspaceInitials }}
                    </div>
                  </div>
                  <div class="min-w-0">
                    <h2 class="truncate text-lg font-semibold leading-tight text-neutral-950">{{ t('workspaceMenu.modalTitle') }}</h2>
                    <p class="mt-0.5 truncate text-xs text-neutral-500">
                      {{ currentWorkspace?.name ?? t('common.workspace') }} · {{ planLabel }} workspace
                    </p>
                  </div>
                </div>
                <div class="hidden shrink-0 items-center gap-2 sm:flex">
                  <button
                    type="button"
                    class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                    @click="openManageMembers"
                  >
                    {{ t('workspaceMenu.manageMembers') }}
                  </button>
                  <PlanUpgradeButton
                    v-if="showUpgrade"
                    :before-navigate="close"
                  />
                </div>
              </div>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto">
              <div class="min-h-full bg-white">
                <nav
                  class="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-3 py-2 backdrop-blur"
                  aria-label="Workspace settings sections"
                >
                  <div class="grid grid-flow-col auto-cols-[minmax(7rem,1fr)] gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-1 sm:auto-cols-fr">
                    <a
                      href="#workspace-settings-overview"
                      class="flex min-w-0 items-center justify-center whitespace-nowrap rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                    >
                      Overview
                    </a>
                    <a href="#workspace-settings-usage" class="flex min-w-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-white hover:text-neutral-950 hover:shadow-sm">
                      Usage
                    </a>
                    <a href="#workspace-settings-llm-keys" class="flex min-w-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-white hover:text-neutral-950 hover:shadow-sm">
                      {{ t('workspaceMenu.llmKeysTitle') }}
                    </a>
                    <a
                      v-if="canClearWorkflows || canTransferOwnership || canDeleteWorkspace"
                      href="#workspace-settings-administration"
                      class="flex min-w-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-white hover:text-neutral-950 hover:shadow-sm"
                    >
                      {{ t('workspaceMenu.administration') }}
                    </a>
                  </div>
                </nav>

                <div class="mx-auto w-full max-w-4xl space-y-7 px-5 py-6 sm:px-7 lg:px-8">
                  <section id="workspace-settings-overview" class="scroll-mt-20">
                    <div class="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                      <div class="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center">
                        <div class="min-w-0 space-y-3">
                          <div class="flex min-w-0 items-center gap-3">
                            <button
                              v-if="canManageWorkspace"
                              type="button"
                              class="group/avatar relative size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-950 text-base font-bold text-white ring-1 ring-neutral-200/70 transition focus:outline-none focus:ring-2 focus:ring-neutral-400"
                              :disabled="isAvatarSaving"
                              :aria-label="t('workspaceMenu.changeImage')"
                              @click="triggerAvatarPicker"
                            >
                              <img
                                v-if="currentWorkspace?.avatar_url"
                                :src="currentWorkspace.avatar_url"
                                alt=""
                                class="h-full w-full object-cover"
                              />
                              <span
                                v-else
                                class="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950"
                                aria-hidden="true"
                              >
                                {{ workspaceInitials }}
                              </span>
                              <span
                                class="absolute inset-0 flex items-center justify-center bg-neutral-950/45 opacity-0 backdrop-blur-[2px] transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100"
                                aria-hidden="true"
                              >
                                <UIcon name="i-heroicons-pencil-20-solid" class="size-4 text-white" />
                              </span>
                              <span
                                v-if="isAvatarSaving"
                                class="absolute inset-0 flex items-center justify-center bg-neutral-950/55 text-white"
                                aria-hidden="true"
                              >
                                <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
                              </span>
                            </button>
                            <div
                              v-else
                              class="relative size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-950 text-base font-bold text-white ring-1 ring-neutral-200/70"
                            >
                              <img
                                v-if="currentWorkspace?.avatar_url"
                                :src="currentWorkspace.avatar_url"
                                alt=""
                                class="h-full w-full object-cover"
                              />
                              <div
                                v-else
                                class="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950"
                                aria-hidden="true"
                              >
                                {{ workspaceInitials }}
                              </div>
                            </div>

                            <div class="min-w-0">
                              <div class="flex min-h-5 min-w-0 items-center gap-2">
                                <template v-if="isNameEditing">
                                  <input
                                    ref="nameInput"
                                    v-model="editName"
                                    type="text"
                                    :maxlength="WORKSPACE_NAME_MAX_LENGTH"
                                    :aria-label="t('workspaceMenu.workspaceName')"
                                    class="h-6 min-w-0 max-w-72 rounded-md border border-transparent bg-transparent px-0 text-base font-semibold leading-6 text-neutral-950 outline-none transition focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:text-neutral-500"
                                    :style="{ width: `${Math.min(Math.max(editName.length + 1, 8), 28)}ch` }"
                                    :disabled="isNameSaving"
                                    @keyup.enter="saveName"
                                    @keyup.esc="cancelNameEdit"
                                  />
                                  <div class="flex h-8 shrink-0 items-center gap-1.5">
                                    <button
                                      type="button"
                                      class="rounded-md bg-neutral-950 px-2.5 py-1.5 text-[11px] font-medium leading-none text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                                      :disabled="isNameSaving || !nameValidation.ok || editName.trim() === currentWorkspace?.name"
                                      @click="saveName"
                                    >
                                      {{ isNameSaving ? t('workspaceMenu.saving') : t('common.save') }}
                                    </button>
                                    <button
                                      type="button"
                                      class="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-medium leading-none text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                                      :disabled="isNameSaving"
                                      @click="cancelNameEdit"
                                    >
                                      {{ t('common.cancel') }}
                                    </button>
                                  </div>
                                </template>
                                <button
                                  v-else
                                  type="button"
                                  class="group/name flex min-h-5 min-w-0 items-center gap-1.5 rounded-md text-left transition-colors disabled:cursor-default"
                                  :disabled="!canManageWorkspace"
                                  @click="startNameEdit"
                                >
                                  <span class="truncate text-base font-semibold leading-5 text-neutral-950">{{ currentWorkspace?.name }}</span>
                                  <UIcon
                                    v-if="canManageWorkspace"
                                    name="i-heroicons-pencil-20-solid"
                                    class="size-3.5 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
                                  />
                                </button>
                              </div>
                              <p class="text-xs leading-4 text-neutral-500">{{ planLabel }} workspace</p>
                              <p v-if="nameError" class="mt-1 text-[11px] text-red-600">{{ nameError }}</p>
                              <p v-else-if="identityError" class="mt-1 text-[11px] text-red-600">{{ identityError }}</p>
                            </div>
                          </div>

                          <div class="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                              @click="openManageMembers"
                            >
                              {{ t('workspaceMenu.manageMembers') }}
                            </button>
                            <PlanUpgradeButton
                              v-if="showUpgrade"
                              :before-navigate="close"
                            />
                          </div>
                        </div>

                      <div class="min-w-0 self-center">
                        <div class="flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                          <span>{{ t('workspaceMenu.statWeeklyTokens') }}</span>
                          <span class="font-mono font-semibold text-neutral-950">
                            {{ tokenUsedWeekly == null ? '-' : tokenUsedWeekly.toLocaleString() }}
                            <span class="font-normal text-neutral-400">/ {{ weeklyTokenCap <= 0 ? '∞' : weeklyTokenCap.toLocaleString() }}</span>
                          </span>
                        </div>
                        <div v-if="weeklyTokenCap > 0" class="mt-2 h-14 overflow-hidden rounded-md bg-neutral-50 ring-1 ring-neutral-100">
                          <svg viewBox="0 0 320 54" preserveAspectRatio="none" class="h-full w-full">
                            <path d="M0 42H320M0 26H320M0 10H320" stroke="#ededed" stroke-width="1" />
                            <path d="M0 40 C38 36 50 31 76 32 C110 33 118 23 146 24 C178 25 196 15 224 16 C252 17 272 10 296 11 C308 12 314 9 320 7 L320 54 L0 54Z" fill="rgba(49,88,212,.075)" />
                            <path d="M0 40 C38 36 50 31 76 32 C110 33 118 23 146 24 C178 25 196 15 224 16 C252 17 272 10 296 11 C308 12 314 9 320 7" fill="none" stroke="#3158d4" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </div>
                        <div class="mt-1.5 flex justify-between text-[10px] text-neutral-400">
                          <span>{{ weeklyTokensPercent == null ? '-' : `${weeklyTokensPercent}%` }}</span>
                          <span>{{ t('workspaceMenu.statWeeklyTokensCaption') }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="grid border-t border-neutral-200 sm:grid-cols-4">
                      <div class="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
                        <p class="text-sm font-semibold text-neutral-950">{{ planLabel }}</p>
                        <p class="mt-0.5 text-[11px] text-neutral-500">{{ t('workspaceMenu.currentPlan') }}</p>
                      </div>
                      <div class="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
                        <p class="text-sm font-semibold text-neutral-950">{{ seatCount }} <span class="font-normal text-neutral-400">/ {{ seatsCap <= 0 ? '∞' : seatsCap }}</span></p>
                        <p class="mt-0.5 text-[11px] text-neutral-500">{{ t('workspaceMenu.statSeats') }}</p>
                      </div>
                      <div class="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
                        <p class="text-sm font-semibold text-neutral-950">{{ workflowRunsMonth == null ? '-' : workflowRunsMonth.toLocaleString() }} <span class="font-normal text-neutral-400">/ {{ workflowRunsCap <= 0 ? '∞' : workflowRunsCap.toLocaleString() }}</span></p>
                        <p class="mt-0.5 text-[11px] text-neutral-500">{{ t('workspaceMenu.statWorkflowRuns') }}</p>
                      </div>
                      <div class="px-5 py-3">
                        <p class="text-sm font-semibold text-neutral-950">{{ weeklyTokensPercent == null || weeklyTokensPercent < 90 ? 'Healthy' : 'Review' }}</p>
                        <p class="mt-0.5 text-[11px] text-neutral-500">{{ weeklyTokensPercent == null || weeklyTokensPercent < 90 ? 'All systems within limits' : 'Approaching usage limits' }}</p>
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

                  <SettingsSection
                    id="workspace-settings-usage"
                    title="Usage"
                    variant="panel"
                  >
                    <SettingsSectionRow variant="panel">
                      <template #label>{{ t('workspaceMenu.statWeeklyTokens') }}</template>
                      <template #description>{{ t('workspaceMenu.statWeeklyTokensCaption') }}</template>
                      <template #trailing>
                        <span class="inline-flex items-center rounded-xl bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-950 ring-1 ring-neutral-200/70">
                          {{ tokenUsedWeekly == null ? '-' : tokenUsedWeekly.toLocaleString() }}
                          <span class="ml-1 text-neutral-400">/ {{ weeklyTokenCap <= 0 ? '∞' : weeklyTokenCap.toLocaleString() }}</span>
                        </span>
                      </template>
                    </SettingsSectionRow>
                    <SettingsSectionRow variant="panel">
                      <template #label>{{ t('workspaceMenu.statWorkflowRuns') }}</template>
                      <template #description>Current monthly workspace allowance.</template>
                      <template #trailing>
                        <span class="inline-flex items-center rounded-xl bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-950 ring-1 ring-neutral-200/70">
                          {{ workflowRunsMonth == null ? '-' : workflowRunsMonth.toLocaleString() }}
                          <span class="ml-1 text-neutral-400">/ {{ workflowRunsCap <= 0 ? '∞' : workflowRunsCap.toLocaleString() }}</span>
                        </span>
                      </template>
                    </SettingsSectionRow>
                    <SettingsSectionRow variant="panel">
                      <template #label>{{ t('workspaceMenu.statSeats') }}</template>
                      <template #description>Team seats are managed from Manage members.</template>
                      <template #trailing>
                        <span class="inline-flex items-center rounded-xl bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-950 ring-1 ring-neutral-200/70">
                          {{ seatCount }}
                          <span class="ml-1 text-neutral-400">/ {{ seatsCap <= 0 ? '∞' : seatsCap }}</span>
                        </span>
                      </template>
                    </SettingsSectionRow>
                    <SettingsSectionRow v-if="showPlanManagement" variant="panel" align="start">
                      <template #label>{{ hasPendingChange ? t('workspaceMenu.managePlan') : t('workspaceMenu.managePlan') }}</template>
                      <template #description>
                        <div
                          v-if="hasPendingChange"
                          class="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200/60"
                        >
                          <UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 size-4 shrink-0 text-amber-600" />
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

                        <span v-else>{{ t('workspaceMenu.managePlanDesc') }}</span>
                      </template>
                      <template #trailing>
                        <div v-if="!hasPendingChange" class="flex flex-wrap items-center gap-2">
                          <button
                            v-if="canDowngradeToPro"
                            type="button"
                            class="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                            @click="openDowngradeModal"
                          >
                            {{ t('workspaceMenu.downgradeToPro') }}
                          </button>
                          <button
                            type="button"
                            class="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                            @click="openCancelModal"
                          >
                            {{ t('workspaceMenu.cancelPlan') }}
                          </button>
                        </div>
                      </template>
                    </SettingsSectionRow>
                  </SettingsSection>

                  <SettingsSection
                    id="workspace-settings-llm-keys"
                    :title="t('workspaceMenu.llmKeysTitle')"
                    variant="panel"
                  >
                    <div class="px-5 py-4 sm:px-6">
                      <WorkspaceLLMKeysPanel
                        :workspace-id="currentWorkspaceId"
                        :can-manage="canManageWorkspace"
                        embedded
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    v-if="canClearWorkflows || canTransferOwnership || canDeleteWorkspace"
                    id="workspace-settings-administration"
                    :title="t('workspaceMenu.administration')"
                    variant="panel"
                  >
                    <SettingsSectionRow v-if="canClearWorkflows" variant="panel" align="start" tone="danger">
                      <template #label>{{ t('settings.clearWorkflows') }}</template>
                      <template #description>{{ t('settings.clearWorkflowsDesc') }}</template>
                      <template #trailing>
                        <button
                          type="button"
                          :disabled="workflowCount === 0"
                          class="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white"
                          @click="openClearWorkflows"
                        >
                          {{ t('settings.clearWorkflowsButton') }}
                        </button>
                      </template>
                    </SettingsSectionRow>

                    <SettingsSectionRow v-if="canTransferOwnership" variant="panel" align="start">
                      <template #label>{{ t('workspaceMenu.transferOwnership') }}</template>
                      <template #description>{{ t('workspaceMenu.transferOwnershipDesc') }}</template>
                      <template #trailing>
                        <button
                          type="button"
                          class="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                          @click="openTransferModal"
                        >
                          {{ t('workspaceMenu.transferAction') }}
                        </button>
                      </template>
                    </SettingsSectionRow>

                    <SettingsSectionRow v-if="canDeleteWorkspace" variant="panel" align="start" tone="danger">
                      <template #label>{{ t('workspaceMenu.deleteWorkspace') }}</template>
                      <template #description>{{ t('workspaceMenu.deleteWorkspaceDesc') }}</template>
                      <template #trailing>
                        <button
                          type="button"
                          class="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          @click="openDeleteModal"
                        >
                          {{ t('common.delete') }}
                        </button>
                      </template>
                    </SettingsSectionRow>
                  </SettingsSection>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Clear all workflows modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isClearWorkflowsOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="closeClearWorkflows"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isClearWorkflowsOpen"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            :aria-label="t('settings.clearWorkflowsTitle')"
            @click.stop
          >
            <div class="flex items-start justify-between px-5 py-3.5">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">{{ t('settings.clearWorkflowsTitle') }}</h3>
                <p class="mt-0.5 text-[11px] text-neutral-500">{{ t('settings.clearWorkflowsCannotUndo') }}</p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
                :disabled="isClearingWorkflows"
                :aria-label="t('common.close')"
                @click="closeClearWorkflows"
              >
                <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
              </button>
            </div>

            <div class="px-5 py-4">
              <div class="flex items-start gap-2.5 rounded-lg border border-error-200 bg-error-50 px-4 py-3">
                <UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 size-4 shrink-0 text-error-600" />
                <p class="text-label-md leading-relaxed text-error-700">
                  {{ t('settings.clearWorkflowsWarning', { count: workflowCount }) }}
                </p>
              </div>
              <p v-if="clearWorkflowsError" class="mt-3 text-[11px] text-error-600">{{ clearWorkflowsError }}</p>
            </div>

            <div class="flex justify-end gap-2 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                :disabled="isClearingWorkflows"
                @click="closeClearWorkflows"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-error-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-error-700 disabled:opacity-50"
                :disabled="isClearingWorkflows"
                @click="confirmClearWorkflows"
              >
                {{ isClearingWorkflows ? t('settings.clearWorkflowsClearing') : t('settings.clearWorkflowsConfirm') }}
              </button>
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

  <ClientOnly>
    <ManageMembersModal v-model:open="isManageMembersOpen" />
  </ClientOnly>
</template>
