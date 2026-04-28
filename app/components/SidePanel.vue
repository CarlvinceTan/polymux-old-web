<script setup lang="ts">
import { ref, nextTick, computed, watch, onBeforeUnmount } from 'vue'
import { vDraggable } from 'vue-draggable-plus'
import { DRAFT_WORKFLOW_ID, type WorkflowSummary } from '~/composables/useWorkflowList'

const { t, locale, locales, setLocale } = useI18n()

const route = useRoute()

// Profile dropdown state
const user = useSupabaseUser()

const {
  workspaces,
  currentWorkspace,
  currentWorkspaceId,
  switchWorkspace,
  fetchWorkspaces
} = useWorkspaces()

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

const planKey = computed<PlanKey>(() => {
  const raw = (currentWorkspace.value?.plan as string | undefined) || 'free'
  const normalised = raw.toLowerCase().trim()
  if (['pro', 'max', 'enterprise'].includes(normalised)) return normalised as PlanKey
  return 'free'
})

const upgradeQuery = computed(() => {
  const q: Record<string, string> = { current: planKey.value }
  if (currentWorkspaceId.value) q.workspaceId = currentWorkspaceId.value
  return q
})

const {
  sessions,
  realSessions,
  draft,
  fetchSessions,
  createDraft,
  restoreDraft,
  renameSession,
  deleteSession,
} = useWorkflowList()

// Writable list bound to the draggable directive. Derived from `realSessions`
// (source of truth) + `draft` + a per-workspace saved order. SortableJS
// mutates this in place during drag; on drop we persist the new order to
// localStorage. IMPORTANT: always mutate this array in place (splice) —
// `vue-draggable-plus` captures the array reference at mount time and has no
// `updated` hook, so reassigning `.value = newArray` leaves the library
// pointing at a stale reference and drag reorders silently fail.
const displaySessions = ref<WorkflowSummary[]>([])

// Stable per-row keys for the workflow `<TransitionGroup>`. Without this, the
// draft → real-session promotion swaps `session.id` from `'new'` to a UUID,
// which Vue treats as a key change → leave + enter animations on the same row.
// The user-visible effect is the row collapsing and re-expanding when only the
// title should appear to change. We carry the draft's slot key over to the
// promoted session so the v-for key is stable across the promotion.
let slotKeyCounter = 0
const slotKeyForId = new Map<string, string>()
function getOrCreateSlotKey(id: string): string {
  let k = slotKeyForId.get(id)
  if (!k) {
    k = `slot-${++slotKeyCounter}`
    slotKeyForId.set(id, k)
  }
  return k
}
function rowKey(session: WorkflowSummary): string {
  return getOrCreateSlotKey(session.id)
}

// Tracks the real session that just took over the draft's row. The URL
// changes from `/workflow/new` to `/workflow/{id}` only after `navigateTo`
// resolves — until then `activeWorkflowId` is `'new'` while the row already
// renders the real id. Without bridging that gap, the row visually loses its
// active highlight during the swap. Cleared once the URL catches up.
const justPromotedId = ref<string | null>(null)

const workflowOrderKey = computed(
  () => `polymux_workflow_order:${currentWorkspaceId.value ?? ''}`,
)

function loadSavedOrder(): string[] {
  if (!import.meta.client) return []
  try {
    const raw = localStorage.getItem(workflowOrderKey.value)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveOrder(ids: string[]) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(workflowOrderKey.value, JSON.stringify(ids))
  } catch {}
}

// Sort real sessions by the saved order. Sessions not yet in the saved order
// (e.g. a freshly-promoted draft) keep their position from `list` and land at
// the top — so a draft that upgrades to a real workflow stays in place.
function applySavedOrder(list: WorkflowSummary[]): WorkflowSummary[] {
  const saved = loadSavedOrder()
  if (saved.length === 0) return list.slice()
  const savedSet = new Set(saved)
  const byId = new Map(list.map(s => [s.id, s]))
  const unknowns = list.filter(s => !savedSet.has(s.id))
  const knowns = saved.flatMap(id => {
    const s = byId.get(id)
    return s ? [s] : []
  })
  return [...unknowns, ...knowns]
}

watch(
  [realSessions, draft, currentWorkspaceId],
  (_n, _o) => {
    const prevReal = (_o?.[0] as WorkflowSummary[] | undefined) ?? []
    const prevDraft = _o?.[1] as WorkflowSummary | null | undefined

    // Promotion handoff: when a draft is replaced by a freshly-created real
    // session, transfer the draft's slot key to the new session so the row's
    // v-for key stays the same across the swap. Also remember that id so the
    // active-highlight bridges the brief URL-still-/new window.
    if (prevDraft && !draft.value) {
      const prevIds = new Set(prevReal.map(s => s.id))
      const promoted = realSessions.value.find(s => !prevIds.has(s.id))
      const draftKey = slotKeyForId.get(DRAFT_WORKFLOW_ID)
      if (promoted && draftKey) {
        slotKeyForId.set(promoted.id, draftKey)
        slotKeyForId.delete(DRAFT_WORKFLOW_ID)
        justPromotedId.value = promoted.id
      }
    }

    // Drop slot keys for ids that no longer exist (deletion / workspace swap)
    // so the map doesn't grow unbounded across a long-lived session.
    const liveIds = new Set<string>()
    if (draft.value) liveIds.add(draft.value.id)
    for (const s of realSessions.value) liveIds.add(s.id)
    for (const id of Array.from(slotKeyForId.keys())) {
      if (!liveIds.has(id)) slotKeyForId.delete(id)
    }

    const ordered = applySavedOrder(realSessions.value)
    const next = draft.value ? [draft.value, ...ordered] : ordered
    displaySessions.value.splice(0, displaySessions.value.length, ...next)
  },
  { deep: true, immediate: true },
)

function onDragMove(evt: { related?: HTMLElement }): boolean {
  // Keep the draft ("New Workflow") pinned at the top: block any move whose
  // drop target is the draft row.
  return !evt.related?.classList?.contains('wf-draft')
}

// SortableJS rewrites the clone's transform as `matrix(...)` on every pointer
// move and sets inline `opacity: 0.8`. Each frame we force opacity to 1, lock
// X to 0 (column-only), and clamp Y to the first/last real row.
//
// `naturalY` tracks the unclamped cursor offset since drag start (by summing
// the deltas SortableJS applies each frame). When the cursor is past a bound,
// we hold the clone at the clamp; the clone only starts following again once
// the cursor re-enters the valid range — rather than tracking the cursor
// step-for-step from the clamped position.
let dragRaf: number | null = null
let listEl: HTMLElement | null = null
let naturalY = 0
let lastClampedY = 0
// Reactive: drag-in-progress flag. Used to suppress per-row hover affordances
// (e.g. the 3-dot menu trigger) on rows the cursor passes over during drag.
const isDragging = ref(false)

function constrainDragPreview() {
  const el = document.querySelector<HTMLElement>('.wf-drag')
  if (el && listEl) {
    if (el.style.opacity !== '1') el.style.opacity = '1'

    let currentY = lastClampedY
    const tf = el.style.transform
    if (tf) {
      try { currentY = new DOMMatrix(tf).f } catch {}
    }
    // SortableJS added cursor delta to our last-written Y.
    naturalY += currentY - lastClampedY

    // Exclude the draft row (pinned at top) and the clone itself (appended
    // inside the <ul> when `fallbackOnBody: false`). That leaves the real
    // rows + invisible ghost — the slot span the clone is allowed to cover.
    const rows = listEl.querySelectorAll<HTMLElement>('li:not(.wf-draft):not(.wf-drag)')
    const first = rows[0]
    const last = rows[rows.length - 1]

    if (first && last) {
      const cloneRect = el.getBoundingClientRect()
      // Where the clone rect would sit if we applied `naturalY` instead of
      // whatever SortableJS currently has in the DOM.
      const shift = naturalY - currentY
      const naturalTop = cloneRect.top + shift
      const naturalBottom = cloneRect.bottom + shift
      // Use offsetTop, not getBoundingClientRect, for first/last row bounds.
      // During sibling reorder, SortableJS applies temporary CSS transforms to
      // animate the rows — getBoundingClientRect returns the animating visual
      // position, which lags the final layout. offsetTop reflects the new
      // layout immediately, so the clamp doesn't lurch during the 200ms swap.
      const listRect = listEl.getBoundingClientRect()
      const topBound = listRect.top + first.offsetTop - listEl.scrollTop
      const bottomBound = listRect.top + last.offsetTop + last.offsetHeight - listEl.scrollTop

      let clampedY = naturalY
      if (naturalTop < topBound) clampedY = naturalY + (topBound - naturalTop)
      else if (naturalBottom > bottomBound) clampedY = naturalY - (naturalBottom - bottomBound)

      const locked = `translate3d(0px, ${clampedY}px, 0px)`
      if (el.style.transform !== locked) el.style.transform = locked
      lastClampedY = clampedY
    }
  }
  dragRaf = requestAnimationFrame(constrainDragPreview)
}

function onDragStart(evt: { from: HTMLElement }) {
  listEl = evt.from
  naturalY = 0
  lastClampedY = 0
  isDragging.value = true
  if (dragRaf != null) cancelAnimationFrame(dragRaf)
  dragRaf = requestAnimationFrame(constrainDragPreview)
}

function onDragEnd() {
  if (dragRaf != null) {
    cancelAnimationFrame(dragRaf)
    dragRaf = null
  }
  listEl = null
  isDragging.value = false
  saveOrder(
    displaySessions.value
      .filter(s => s.id !== DRAFT_WORKFLOW_ID)
      .map(s => s.id),
  )
}

onBeforeUnmount(() => {
  if (dragRaf != null) cancelAnimationFrame(dragRaf)
})

const draggableOptions = {
  // Match the enter/leave transitions (220ms ease) so siblings shifting for a
  // drag reorder move with the same feel as when a workflow is added/deleted.
  animation: 220,
  easing: 'ease',
  direction: 'vertical',
  filter: '.wf-draft',
  preventOnFilter: false,
  forceFallback: true,
  fallbackOnBody: false,
  fallbackTolerance: 3,
  scroll: true,
  scrollSensitivity: 30,
  scrollSpeed: 10,
  ghostClass: 'wf-ghost',
  chosenClass: 'wf-chosen',
  dragClass: 'wf-drag',
  onStart: onDragStart,
  onMove: onDragMove,
  onEnd: onDragEnd,
}

async function ensureAtLeastOneWorkflow() {
  if (!currentWorkspaceId.value) return
  if (sessions.value.length === 0) {
    createDraft()
  }
}

async function bootstrapData() {
  await fetchWorkspaces()
  await fetchSessions()
  restoreDraft()
  await ensureAtLeastOneWorkflow()
}

// Initial data fetch
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await bootstrapData()
})

// Re-bootstrap when the server comes back online — without this, fetches that
// failed during downtime never retry, leaving the sidebar stuck in its empty
// state.
useOnReconnect(bootstrapData)

// Re-fetch sessions when workspace changes
watch(currentWorkspaceId, async () => {
  await fetchSessions()
  restoreDraft()
  await ensureAtLeastOneWorkflow()
})

// User data
const userEmail = computed(() => user.value?.email ?? 'user@example.com')
const userName = computed(() => {
  locale.value
  const meta = user.value?.user_metadata
  return (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || user.value?.email?.split('@')[0]
    || ''
})
const userPlan = computed(() => {
  locale.value
  const raw = (currentWorkspace.value?.plan as string | undefined) || 'free'
  const normalised = raw.toLowerCase().trim()
  if (normalised === 'pro') return t('settings.proPlan')
  if (normalised === 'max') return t('settings.maxPlan')
  if (normalised === 'enterprise') return t('settings.enterprisePlan')
  return t('settings.freePlan')
})
const avatarUrl = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.avatar_url as string | undefined) || (meta?.picture as string | undefined) || null
})
const avatarFailed = ref(false)
watch(avatarUrl, () => { avatarFailed.value = false })

const navItems = computed(() => {
  locale.value // explicit reactive dependency so labels update on locale switch
  return [
    { to: '/integrations/installed', label: t('nav.integrations'), key: 'integrations' },
    { to: '/storage/files', label: t('nav.storage'), key: 'storage' },
    { to: '/vault/passwords', label: t('nav.vault'), key: 'vault' },
  ]
})

// Search modal state
const isSearchOpen = ref(false)

const isProfileDropdownOpen = ref(false)
const profileDropdownRef = ref<InstanceType<typeof Menu> | null>(null)
const isLanguageOpen = ref(false)
const isHelpOpen = ref(false)
const isSettingsModalOpen = ref(false)
const isBugReportOpen = ref(false)
const languageBtnRef = ref<HTMLElement | null>(null)
const helpBtnRef = ref<HTMLElement | null>(null)
const languagePanelRef = ref<HTMLElement | null>(null)
const helpPanelRef = ref<HTMLElement | null>(null)
const languagePanelStyle = ref<Record<string, string>>({})
const helpPanelStyle = ref<Record<string, string>>({})

const availableLocales = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map(l => ({
    code: l.code,
    name: l.name,
  }))
)

const helpMenuItems = computed(() => [
  { key: 'terms', label: computed(() => 'Terms and Conditions') },
  { key: 'privacy', label: computed(() => 'Privacy Policy') },
  { key: 'cookies', label: computed(() => 'Cookies Policy') },
  { key: 'bug', label: computed(() => 'Bug Report') },
])

function isActive(path: string) {
  if (path === '/dashboard' || path === '/dashboard/home') {
    return route.path.startsWith('/dashboard')
  }
  if (path === '/integrations/installed') {
    return route.path.startsWith('/integrations') || route.path.startsWith('/workspace')
  }
  if (path === '/storage/files') {
    return route.path.startsWith('/storage')
  }
  if (path === '/vault/passwords') {
    return route.path.startsWith('/vault')
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}

function isMainNavItemActive(path: string): boolean {
  const p = route.path
  if (p === '/config' || p.startsWith('/config/')) return false
  return isActive(path)
}

async function createWorkflow() {
  if (!draft.value) createDraft()
  await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
}

// `/workflow/new` is a static route so `route.params.id` is undefined there —
// derive the active id from the path instead so the draft row highlights too.
const activeWorkflowId = computed(() => {
  const m = route.path.match(/^\/workflow\/([^/]+)/)
  return m?.[1]
})
const isWorkflowListItemActive = (id: string) => {
  if (activeWorkflowId.value === id) return true
  // Bridge the promotion window: draft is gone but URL is still `/workflow/new`.
  return activeWorkflowId.value === DRAFT_WORKFLOW_ID
    && !draft.value
    && id === justPromotedId.value
}

// Clear the bridge once the route catches up to the real id (or anywhere else).
watch(activeWorkflowId, (id) => {
  if (id !== DRAFT_WORKFLOW_ID) justPromotedId.value = null
})

function openWorkflow(id: string) {
  navigateTo(`/workflow/${id}`)
}

const activeDropdownIndex = ref<number | null>(null)
const hoveredWorkflowId = ref<string | null>(null)

// Workspace dropdown state
const isWorkspaceDropdownOpen = ref(false)
const isCreateWorkspaceOpen = ref(false)
const workspaceDropdownRef = ref<{ dropdownRef: HTMLElement | null } | null>(null)

function toggleWorkspaceDropdown() {
  isWorkspaceDropdownOpen.value = !isWorkspaceDropdownOpen.value
}

function closeWorkspaceDropdown() {
  isWorkspaceDropdownOpen.value = false
}

function canDeleteWorkflow(id: string): boolean {
  if (sessions.value.length > 1) return true
  // Only one entry left: allow deletion only when it's a real workflow, which
  // gets seamlessly replaced with a fresh draft. Deleting the sole draft is a no-op.
  return id !== DRAFT_WORKFLOW_ID
}

// Delete-confirmation modal state. The destructive workflow-delete path now
// surfaces a confirmation that explicitly enumerates the side effects (chat
// history, artifacts, runs, schedule, live session) and, on confirm, hands off
// to the original deletion routine. Drafts and unused workflows skip the modal
// — there is no durable state to lose.
const pendingDeleteId = ref<string | null>(null)
const pendingDeleteName = ref('')
const isDeleteModalOpen = ref(false)
const isDeleting = ref(false)

function requestDeleteWorkflow(id: string) {
  if (!canDeleteWorkflow(id)) return
  // Drafts have no durable state — nuke immediately, no modal.
  if (id === DRAFT_WORKFLOW_ID) {
    void runDeleteWorkflow(id)
    return
  }
  const session = sessions.value.find(s => s.id === id)
  pendingDeleteId.value = id
  pendingDeleteName.value = session?.title ?? ''
  isDeleteModalOpen.value = true
  activeDropdownIndex.value = null
}

async function confirmDeleteWorkflow() {
  const id = pendingDeleteId.value
  if (!id) return
  isDeleting.value = true
  try {
    await runDeleteWorkflow(id)
  } finally {
    isDeleting.value = false
    isDeleteModalOpen.value = false
    pendingDeleteId.value = null
    pendingDeleteName.value = ''
  }
}

async function runDeleteWorkflow(id: string) {
  const wasActive = id === activeWorkflowId.value
  const idx = sessions.value.findIndex(s => s.id === id)
  const siblings = sessions.value.filter(s => s.id !== id)
  const fallback = siblings[Math.min(Math.max(idx, 0), siblings.length - 1)] ?? null

  await deleteSession(id)
  activeDropdownIndex.value = null

  if (sessions.value.length === 0) {
    // Deleted the sole real workflow with no draft — seamlessly seed a draft
    // so the list is never empty.
    createDraft()
    if (wasActive) await navigateTo(`/workflow/${DRAFT_WORKFLOW_ID}`)
    return
  }
  if (wasActive && fallback) {
    await navigateTo(`/workflow/${fallback.id}`)
  }
}

const editingId = ref<string | null>(null)
const editingValue = ref('')

function canRenameWorkflow(id: string): boolean {
  // Draft ("New Workflow") is not renameable — its title is fixed until it's
  // promoted to a real session by the user's first prompt.
  return id !== DRAFT_WORKFLOW_ID
}

function startRename(id: string, title: string) {
  if (!canRenameWorkflow(id)) {
    activeDropdownIndex.value = null
    return
  }
  editingId.value = id
  editingValue.value = title
  activeDropdownIndex.value = null

  nextTick(() => {
    const input = document.querySelector('input[autofocus]') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function confirmRename(id: string) {
  if (editingValue.value.trim()) {
    await renameSession(id, editingValue.value.trim())
  }
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
  editingValue.value = ''
}

function closeDropdown() {
  activeDropdownIndex.value = null
}

function getDropdownPosition(id: string) {
  const trigger = document.querySelector(`.workflow-list-trigger[data-id="${id}"]`)
  if (!trigger) return { top: 0, left: 0 }
  const rect = trigger.getBoundingClientRect()
  return {
    top: rect.bottom,
    left: rect.left,
  }
}

const ROW_HEIGHT = 32 // py-1.5 (6px+6px) + 20px line-height = 32px
const PANEL_PADDING = 4 // py-1 = 4px
const LANGUAGE_PANEL_HEIGHT = 8 * ROW_HEIGHT + PANEL_PADDING * 2 // 264px
const HELP_PANEL_HEIGHT = 4 * ROW_HEIGHT + PANEL_PADDING * 2 // 136px

function positionSubmenu(
  triggerEl: HTMLElement,
  panelHeight: number,
  anchorRow?: number, // 0-based: align this row's centre with the trigger mid
): Record<string, string> {
  const rect = triggerEl.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  // if anchorRow given, offset so that row's centre aligns with midY
  const anchorOffset = anchorRow !== undefined
    ? PANEL_PADDING + anchorRow * ROW_HEIGHT + ROW_HEIGHT / 2
    : panelHeight / 2
  const rawTop = midY - anchorOffset
  // clamp so the panel stays within the viewport
  const top = Math.max(8, Math.min(rawTop, window.innerHeight - panelHeight - 8))
  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${rect.right + 8}px`,
  }
}

function handleWorkspaceSwitch(id: string) {
  switchWorkspace(id)
  isWorkspaceDropdownOpen.value = false
}

async function selectLocale(code: string) {
  void setLocale(code as typeof locale.value)
  // Keeping menus open as requested
}

function openLanguagePanel() {
  if (!languageBtnRef.value) return
  // anchor row 2 (third row, 0-based) aligns its centre with the Language trigger
  languagePanelStyle.value = positionSubmenu(languageBtnRef.value, LANGUAGE_PANEL_HEIGHT, 2)
  isLanguageOpen.value = true
  isHelpOpen.value = false
}

function openHelpPanel() {
  if (!helpBtnRef.value) return
  // anchor row 3 (last of 4 items, 0-based) aligns its text centre with the Help trigger
  helpPanelStyle.value = positionSubmenu(helpBtnRef.value, HELP_PANEL_HEIGHT, 3)
  isHelpOpen.value = true
  isLanguageOpen.value = false
}

function selectHelpItem(key: string) {
  if (key === 'privacy') {
    navigateTo('/privacy-policy')
  } else if (key === 'terms') {
    navigateTo('/terms-of-service')
  } else if (key === 'cookies') {
    navigateTo('/cookie-policy')
  } else if (key === 'bug') {
    isBugReportOpen.value = true
  }
  isHelpOpen.value = false
  closeProfileDropdown()
}

function closeProfileDropdown() {
  isProfileDropdownOpen.value = false
  isLanguageOpen.value = false
  isHelpOpen.value = false
}

function handleSettings() {
  isSettingsModalOpen.value = true
  closeProfileDropdown()
}

function handleInstallApp() {
  closeProfileDropdown()
  navigateTo('/install-app')
}

// Extension install — the banner in PageHeader surfaces this for first-time
// users; after dismissal it lives here in the profile menu. Both paths share
// the same openInstallExtension action so browser detection stays consistent.
const {
  bannerDismissed: extensionBannerDismissed,
  openInstallExtension,
} = useExtensionPrefs()

function handleInstallExtension() {
  closeProfileDropdown()
  openInstallExtension({ chromeRequiredMessage: t('common.chromeRequired') })
}

function handleUpgradePlan() {
  closeProfileDropdown()
  navigateTo({ path: '/pricing', query: upgradeQuery.value })
}

async function handleLogout() {
  const { signOut } = useSignOut()
  await signOut()
}

function handleClickOutside(event: MouseEvent) {
  // Close workflow list dropdown
  const dropdown = document.querySelector('.workflow-list-dropdown')
  if (dropdown && !dropdown.contains(event.target as Node)) {
    const trigger = document.querySelector('.workflow-list-trigger')
    if (trigger && !trigger.contains(event.target as Node)) {
      closeDropdown()
    }
  }

  // Close workspace dropdown
  const dropdownEl = workspaceDropdownRef.value?.dropdownRef
  if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
    const workspaceTrigger = document.querySelector('.workspace-dropdown-trigger')
    if (workspaceTrigger && !workspaceTrigger.contains(event.target as Node)) {
      closeWorkspaceDropdown()
    }
  }

  // Close profile dropdown
  const profileDropdown = profileDropdownRef.value?.$el
  const isInsideProfile = profileDropdown && profileDropdown.contains(event.target as Node)
  const isInsideLanguage = languagePanelRef.value && languagePanelRef.value.contains(event.target as Node)
  const isInsideHelp = helpPanelRef.value && helpPanelRef.value.contains(event.target as Node)
  const isInsideTrigger = document.querySelector('.profile-trigger')?.contains(event.target as Node)

  if (!isInsideProfile && !isInsideLanguage && !isInsideHelp && !isInsideTrigger) {
    closeProfileDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <aside class="flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden bg-neutral-100 py-3 px-3 lg:w-[272px]"
    aria-label="Main sidebar">
    <!-- Logo & CTA -->
    <div class="shrink-0 space-y-4">
      <div class="relative">
        <div class="group flex items-center gap-3 cursor-pointer workspace-dropdown-trigger w-full"
          @click="toggleWorkspaceDropdown">
          <!-- Logo Icon -->
          <div v-if="currentWorkspace?.avatar_url" class="h-6 w-6 shrink-0 overflow-hidden rounded-md">
            <img :src="currentWorkspace.avatar_url" alt="" class="h-full w-full object-cover" />
          </div>
          <AccountIcon v-else :initials="currentWorkspace?.name?.substring(0, 2).toUpperCase() || 'W'" size="md" />
          <!-- Title & Company -->
          <div class="flex flex-col flex-1 min-w-0">
            <div class="flex items-end justify-between">
              <span class="text-base font-bold text-neutral-950 truncate min-w-0 flex-1 mr-2">{{ currentWorkspace?.name || 'Loading...' }}</span>
              <svg class="size-4.5 text-neutral-500 mb-px transition-opacity"
                :class="isWorkspaceDropdownOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-active:opacity-100'"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <span class="text-xs font-medium tracking-wide text-neutral-500">
              {{ currentWorkspace?.role === 'owner' ? t('workspace.roleOwner') : currentWorkspace?.role === 'admin' ? t('workspace.roleAdmin') : t('workspace.roleMember') }}
            </span>
          </div>
        </div>

        <!-- Workspace Dropdown -->
        <Menu v-if="isWorkspaceDropdownOpen" ref="workspaceDropdownRef" :open="isWorkspaceDropdownOpen">
          <MenuItem
            v-for="ws in workspaces"
            :key="ws.id"
            :text="ws.name"
            @click="handleWorkspaceSwitch(ws.id)"
          >
            <template #icon>
              <div v-if="ws.avatar_url" class="h-4 w-4 shrink-0 overflow-hidden rounded-md">
                <img :src="ws.avatar_url" alt="" class="h-full w-full object-cover" />
              </div>
              <AccountIcon v-else :initials="ws.name.substring(0, 2).toUpperCase()" size="sm" color="bg-neutral-800" />
            </template>
            <template v-if="ws.id === currentWorkspace?.id" #icon-right>
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </template>
          </MenuItem>
          
          <MenuItem :text="t('nav.addWorkspace')" :has-divider="workspaces.length > 0" @click="isCreateWorkspaceOpen = true; isWorkspaceDropdownOpen = false">
            <template #icon>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </template>
          </MenuItem>
        </Menu>
      </div>
      <button type="button" @click="createWorkflow"
        class="w-full h-9.5 flex items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-center text-body-md font-normal text-white transition-opacity hover:opacity-90 outline-none">
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {{ t('nav.newWorkflow') }}
      </button>
    </div>

    <!-- Navigation (scrollable) -->
    <nav class="mt-10 flex-1 flex flex-col min-h-0 overflow-hidden" aria-label="Main">
      <ul class="flex flex-col gap-1 shrink-0">
        <!-- Dashboard First -->
        <li>
          <NuxtLink to="/dashboard"
            class="relative flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="(!isSearchOpen && isMainNavItemActive('/dashboard'))
              ? 'font-semibold'
              : 'hover:bg-neutral-200/60'">
            <span v-if="!isSearchOpen && isMainNavItemActive('/dashboard')"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <!-- Dashboard: layout grid -->
            <svg class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>{{ t('nav.dashboard') }}</span>
          </NuxtLink>
        </li>

        <!-- Search - Between Dashboard and Workspace -->
        <li>
          <button type="button" @click="isSearchOpen = true"
            class="relative flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="isSearchOpen ? 'font-semibold' : 'hover:bg-neutral-200/60'">
            <span v-if="isSearchOpen"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <svg class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>{{ t('common.search') }}</span>
          </button>
        </li>

        <!-- Rest of nav items: Workspace, Storage, Vault -->
        <li v-for="item in navItems" :key="item.key">
          <NuxtLink :to="item.to"
            class="relative flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors outline-none"
            :class="(!isSearchOpen && isMainNavItemActive(item.to))
              ? 'font-semibold'
              : 'hover:bg-neutral-200/60'
              ">
            <span v-if="!isSearchOpen && isMainNavItemActive(item.to)"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <svg v-if="item.key === 'integrations'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
            </svg>
            <!-- Storage: box/archive icon -->
            <svg v-else-if="item.key === 'storage'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M21 8v13H3V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
            <!-- Vault: lock -->
            <svg v-else-if="item.key === 'vault'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              {{ item.label }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <!-- Workflows -->
      <div class="mt-6 flex flex-col flex-1 min-h-0 relative">
        <h3 class="mb-2 pl-2.5 text-meta font-semibold uppercase tracking-wide text-neutral-500 shrink-0">{{ t('nav.workflows') }}
        </h3>
        <TransitionGroup
          v-draggable="[displaySessions, draggableOptions]"
          tag="ul"
          name="wf"
          class="flex flex-col gap-0.5 flex-1 overflow-y-auto scrollbar-hide relative pb-4"
        >
          <li
            v-for="session in displaySessions"
            :key="rowKey(session)"
            class="relative wf-item"
            :class="session.id === DRAFT_WORKFLOW_ID ? 'wf-draft' : ''"
          >
            <div v-if="editingId !== session.id" @click="openWorkflow(session.id)"
              @mouseenter="hoveredWorkflowId = session.id"
              @mouseleave="hoveredWorkflowId = null"
              class="relative flex w-full cursor-pointer items-center rounded-md py-1.5 pl-2.5 pr-2 text-left text-nav text-neutral-950 outline-none"
              :class="isWorkflowListItemActive(session.id) ? 'bg-neutral-300' : (isDragging ? '' : 'hover:bg-neutral-200/90')">
              <span
                class="min-w-0 flex-1 truncate"
                :title="session.title"
                @dblclick.stop="startRename(session.id, session.title)"
              >{{ session.title }}</span>
              <div
                class="shrink-0 overflow-hidden"
                :class="(!isDragging && (hoveredWorkflowId === session.id || activeDropdownIndex === session.id)) ? 'w-4 ml-1.5' : 'w-0'"
                @click.stop
              >
                <svg @click="activeDropdownIndex = activeDropdownIndex === session.id ? null : session.id"
                  class="workflow-list-trigger size-4 text-neutral-400 cursor-pointer hover:text-neutral-950"
                  :data-id="session.id"
                  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>

                <div v-if="activeDropdownIndex === session.id"
                  class="fixed z-9999 mt-1 w-32 rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden workflow-list-dropdown"
                  :style="{ top: getDropdownPosition(session.id).top + 'px', left: getDropdownPosition(session.id).left + 'px' }">
                  <button @click.stop :disabled="session.id === DRAFT_WORKFLOW_ID"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav transition-colors"
                    :class="session.id === DRAFT_WORKFLOW_ID
                      ? 'text-neutral-300 cursor-not-allowed'
                      : 'text-neutral-950 hover:bg-neutral-100 cursor-pointer'">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share
                  </button>
                  <button @click.stop="startRename(session.id, session.title)"
                    :disabled="session.id === DRAFT_WORKFLOW_ID"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav transition-colors"
                    :class="session.id === DRAFT_WORKFLOW_ID
                      ? 'text-neutral-300 cursor-not-allowed'
                      : 'text-neutral-950 hover:bg-neutral-100 cursor-pointer'">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Rename
                  </button>
                  <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
                  <button @click.stop="requestDeleteWorkflow(session.id)"
                    :disabled="!canDeleteWorkflow(session.id)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav transition-colors"
                    :class="canDeleteWorkflow(session.id)
                      ? 'text-red-600 hover:bg-red-50 cursor-pointer'
                      : 'text-neutral-300 cursor-not-allowed'">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>

            <div v-else
              class="group relative flex w-full items-center justify-between rounded-md py-1.5 pl-2.5 pr-2 text-left text-nav text-neutral-950">
              <input v-model="editingValue" @keyup.enter="confirmRename(session.id)" @keyup.esc="cancelRename"
                @blur="confirmRename(session.id)" type="text"
                class="flex-1 bg-transparent border-0 outline-none min-w-0 py-0.75 m-0 h-auto leading-normal"
                autofocus />
            </div>
          </li>
        </TransitionGroup>
        <div
          class="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-100 to-transparent pointer-events-none z-10">
        </div>
      </div>
    </nav>

    <div class="mt-auto shrink-0 border-t border-neutral-200/80 pt-2 relative">
      <div class="relative">
        <button @click="isProfileDropdownOpen = !isProfileDropdownOpen"
          class="profile-trigger flex items-center gap-2 w-full rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors hover:bg-neutral-200/60 outline-none">
          <template v-if="avatarUrl && !avatarFailed">
            <img
              :src="avatarUrl"
              referrerpolicy="no-referrer"
              class="h-6 w-6 rounded-md object-cover ring-1 ring-neutral-200/80 shrink-0"
              alt=""
              @error="avatarFailed = true"
            />
          </template>
          <AccountIcon v-else :initials="(userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2)
            .toUpperCase()" size="md" color="bg-neutral-800" role="img" aria-label="User profile" />
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate font-semibold text-neutral-950">
              {{ userName }}
            </p>
            <p class="truncate text-meta text-neutral-600">
              {{ userPlan }}
            </p>
          </div>
        </button>
      </div>

      <!-- Language submenu panel — teleported to body to escape overflow-hidden -->
      <Teleport to="body">
        <div
          v-if="isProfileDropdownOpen && isLanguageOpen"
          ref="languagePanelRef"
          class="fixed w-44 rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 z-[9999]"
          :style="languagePanelStyle"
        >
          <button
            v-for="loc in availableLocales"
            :key="loc.code"
            type="button"
            class="flex w-full items-center justify-between px-3 py-1.5 text-sm cursor-pointer transition-colors hover:bg-neutral-100"
            :class="locale === loc.code ? 'font-medium text-neutral-950' : 'text-neutral-700'"
            @click="selectLocale(loc.code)"
          >
            <span>{{ loc.name }}</span>
            <svg v-if="locale === loc.code" viewBox="0 0 20 20" fill="currentColor" class="size-3.5 shrink-0 text-neutral-950" aria-hidden="true">
              <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </Teleport>

      <!-- Help submenu panel — teleported to body to escape overflow-hidden -->
      <Teleport to="body">
        <div
          v-if="isProfileDropdownOpen && isHelpOpen"
          ref="helpPanelRef"
          class="fixed w-52 rounded-2xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 z-[9999]"
          :style="helpPanelStyle"
        >
          <button
            v-for="item in helpMenuItems"
            :key="item.key"
            type="button"
            class="flex w-full items-center px-3 py-1.5 text-sm cursor-pointer transition-colors text-neutral-700 hover:bg-neutral-100"
            @click="selectHelpItem(item.key)"
          >
            <span>{{ item.label.value }}</span>
          </button>
        </div>
      </Teleport>

      <Menu v-if="isProfileDropdownOpen" ref="profileDropdownRef" :open="isProfileDropdownOpen" placement="above">
        <div class="px-3 py-1.5 text-xs text-neutral-500 truncate">
          {{ userEmail }}
        </div>
        <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
        <MenuItem :text="t('common.settings')" @click="handleSettings">
          <template #icon>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
              <path d="M10.549 2C11.35 2 12 2.65 12 3.451c0 .195.138.403.385.501q.102.041.204.085l.09.032c.212.06.415.007.536-.114a1.453 1.453 0 0 1 2.055.001l.774.774.1.11a1.454 1.454 0 0 1-.1 1.945c-.138.138-.187.382-.081.625l.085.205.042.087c.108.192.289.298.459.298C17.35 8 18 8.65 18 9.451v1.098C18 11.35 17.35 12 16.549 12c-.17 0-.35.106-.46.298l-.041.087-.085.204c-.106.243-.057.488.08.626a1.453 1.453 0 0 1 0 2.055l-.773.774a1.453 1.453 0 0 1-2.055 0 .55.55 0 0 0-.535-.114l-.091.033q-.1.044-.203.084c-.247.098-.386.306-.386.5C12 17.35 11.35 18 10.548 18H9.452C8.65 18 8 17.35 8 16.548a.55.55 0 0 0-.298-.46l-.087-.041-.205-.085c-.243-.106-.487-.056-.625.082a1.453 1.453 0 0 1-1.944.1l-.11-.1-.775-.774a1.453 1.453 0 0 1 0-2.055l.047-.057a.56.56 0 0 0 .066-.478l-.032-.091-.085-.204c-.098-.247-.306-.385-.5-.385C2.65 12 2 11.35 2 10.549V9.45C2 8.65 2.65 8 3.451 8c.195 0 .402-.138.5-.385l.086-.205.032-.09a.56.56 0 0 0-.066-.48l-.048-.055a1.453 1.453 0 0 1 0-2.055l.775-.775.11-.1a1.453 1.453 0 0 1 1.945.1c.138.138.382.188.625.082q.102-.045.205-.086c.247-.098.385-.305.385-.5C8 2.65 8.65 2 9.451 2zM9.45 3a.45.45 0 0 0-.45.451c0 .674-.457 1.21-1.017 1.43l-.173.072c-.554.241-1.256.187-1.733-.29a.45.45 0 0 0-.568-.059l-.07.06-.776.774a.45.45 0 0 0 0 .64c.447.446.523 1.091.332 1.626l-.042.106-.071.173C4.66 8.543 4.125 9 3.452 9A.45.45 0 0 0 3 9.451v1.098c0 .249.202.451.451.451.674 0 1.209.457 1.43 1.017l.072.172c.242.553.187 1.256-.29 1.733a.453.453 0 0 0 0 .64l.774.775.072.059a.45.45 0 0 0 .568-.06c.477-.476 1.18-.532 1.734-.29q.085.037.172.071l.104.046c.511.244.913.753.913 1.385 0 .25.203.452.452.452h1.096c.25 0 .452-.203.452-.452 0-.674.457-1.209 1.017-1.43l.172-.072.105-.042c.535-.191 1.18-.114 1.628.333a.453.453 0 0 0 .64 0l.775-.774a.453.453 0 0 0 0-.641c-.477-.477-.532-1.18-.29-1.734q.037-.085.071-.172l.046-.104c.244-.51.754-.912 1.385-.912a.45.45 0 0 0 .451-.451V9.45a.45.45 0 0 0-.451-.45c-.632 0-1.14-.402-1.385-.913l-.046-.104-.072-.172c-.242-.554-.186-1.257.29-1.734a.45.45 0 0 0 .06-.568l-.06-.072-.774-.774a.454.454 0 0 0-.569-.059l-.071.06c-.477.476-1.18.53-1.734.29l-.171-.072C11.457 4.66 11 4.125 11 3.452A.45.45 0 0 0 10.549 3zM10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>
            </svg>
          </template>
        </MenuItem>
        <div ref="languageBtnRef">
          <MenuItem
            :text="t('common.language')"
            @click.stop="isLanguageOpen ? isLanguageOpen = false : openLanguagePanel()"
            :class="isLanguageOpen ? 'bg-neutral-100' : ''"
          >
            <template #icon>
              <div class="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                  <path d="M7.27 3.05a7.467 7.467 0 1 1-.018.007l.01-.004zm1.372 11.478a8 8 0 0 0-1.464 1.362 6.53 6.53 0 0 0 3.373.62 6.2 6.2 0 0 1-.969-.835 10 10 0 0 1-.94-1.147m4.515-1.993c-.626.13-1.275.323-1.93.581-.654.258-1.26.56-1.808.892.276.386.555.73.835 1.02.45.468.88.788 1.258.958.376.17.665.178.881.093.218-.085.425-.289.584-.67.16-.383.257-.91.267-1.558a9 9 0 0 0-.087-1.316M3.637 8.52a6.5 6.5 0 0 0 .285 3.876 6.5 6.5 0 0 0 2.433 3.027 9 9 0 0 1 1.772-1.674 16.4 16.4 0 0 1-1.243-2.52 16.5 16.5 0 0 1-.81-2.693 9 9 0 0 1-2.436-.016m12.444 3.864a8 8 0 0 0-2 .003c.07.523.103 1.02.096 1.48a6.2 6.2 0 0 1-.14 1.272 6.53 6.53 0 0 0 2.044-2.755M11.095 6.77c-.607.37-1.271.701-1.98.981s-1.423.49-2.119.633c.165.79.417 1.638.757 2.5s.733 1.653 1.151 2.344c.607-.37 1.272-.701 1.982-.981s1.422-.49 2.117-.634a15.6 15.6 0 0 0-.756-2.499 15.6 15.6 0 0 0-1.152-2.344m2.548-2.194a9 9 0 0 1-1.77 1.674c.457.751.881 1.602 1.243 2.521.362.92.633 1.83.81 2.692a9 9 0 0 1 2.435.016 6.5 6.5 0 0 0-.282-3.875 6.5 6.5 0 0 0-2.436-3.028m-7.681.286a6.53 6.53 0 0 0-2.044 2.753c.603.08 1.279.082 1.999-.002-.07-.523-.1-1.02-.094-1.48a6.2 6.2 0 0 1 .139-1.27m2.526-.85c-.376-.17-.665-.177-.883-.091s-.423.288-.583.669c-.16.383-.256.91-.266 1.557a9 9 0 0 0 .086 1.316c.627-.13 1.276-.321 1.93-.58.655-.257 1.26-.561 1.807-.893a9 9 0 0 0-.833-1.02c-.45-.468-.88-.787-1.258-.957m4.334.096a6.53 6.53 0 0 0-3.372-.62c.328.224.654.506.969.834q.48.5.94 1.147a8 8 0 0 0 1.464-1.362"></path>
                </svg>
              </div>
            </template>
            <template #icon-right>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>
            </template>
          </MenuItem>
        </div>
        <MenuItem :text="t('common.upgradePlan')" @click="handleUpgradePlan">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
              <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m-.354 3.146a.5.5 0 0 1 .63-.064l.078.064 2.5 2.5a.5.5 0 1 1-.707.708L10.5 8.207V13l-.01.1a.5.5 0 0 1-.98 0L9.5 13V8.207L7.854 9.854a.5.5 0 0 1-.707-.708z"></path>
            </svg>
          </template>
        </MenuItem>
        <MenuItem :text="t('common.installApp')" @click="handleInstallApp">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
              <path d="M16.5 13a.5.5 0 0 1 .5.5v2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 1 .5-.5M10 3a.5.5 0 0 1 .5.5v8.686l3.126-3.518a.5.5 0 0 1 .748.664l-4 4.5-.08.071a.5.5 0 0 1-.668-.071l-4-4.5-.059-.082A.5.5 0 0 1 6.3 8.6l.075.068L9.5 12.186V3.5A.5.5 0 0 1 10 3"></path>
            </svg>
          </template>
        </MenuItem>
        <MenuItem
          v-if="extensionBannerDismissed"
          :text="t('common.installExtension')"
          @click="handleInstallExtension"
        >
          <template #icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" class="size-[18px]" aria-hidden="true">
              <path d="M6 5 L10.5 5 A2 2 0 1 1 13.5 5 L18 5 A1 1 0 0 1 19 6 L19 10.5 A2 2 0 1 0 19 13.5 L19 18 A1 1 0 0 1 18 19 L13.5 19 A2 2 0 1 0 10.5 19 L6 19 A1 1 0 0 1 5 18 L5 13.5 A2 2 0 1 1 5 10.5 L5 6 A1 1 0 0 1 6 5 Z" />
            </svg>
          </template>
        </MenuItem>
        <div ref="helpBtnRef">
          <MenuItem
            :text="t('common.help')"
            @click.stop="isHelpOpen ? isHelpOpen = false : openHelpPanel()"
            :class="isHelpOpen ? 'bg-neutral-100' : ''"
          >
            <template #icon>
              <div class="flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                  <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5m0-7a2.5 2.5 0 0 1 1.34 4.61l-.14.084a1.9 1.9 0 0 0-.522.402c-.126.146-.178.28-.178.404v.25a.5.5 0 0 1-1 0v-.25c0-.428.185-.784.418-1.056.23-.268.525-.475.8-.627l.169-.107A1.5 1.5 0 1 0 8.5 8.5a.5.5 0 0 1-1 0A2.5 2.5 0 0 1 10 6"/>
                </svg>
              </div>
            </template>
            <template #icon-right>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path></svg>
            </template>
          </MenuItem>
        </div>
        <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
        <MenuItem :text="t('common.signOut')" destructive @click="handleLogout">
            <template #icon>
              <svg viewBox="0 0 20 20" fill="currentColor" class="size-[18px]" aria-hidden="true">
                <path d="M9.5 3A1.5 1.5 0 0 1 11 4.5v3l-.01.1a.5.5 0 0 1-.98 0L10 7.5v-3a.5.5 0 0 0-.5-.5h-5l-.1.01a.5.5 0 0 0-.4.49v11a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .49-.4l.01-.1v-3a.5.5 0 0 1 1 0v3l-.008.153A1.5 1.5 0 0 1 9.5 17h-5A1.5 1.5 0 0 1 3 15.5v-11a1.5 1.5 0 0 1 1.347-1.492L4.5 3zm3.12 3.675a.5.5 0 0 1 .705-.055l3.5 3 .074.08a.5.5 0 0 1-.074.68l-3.5 3-.083.057a.5.5 0 0 1-.638-.744l.07-.073 2.474-2.12H7.5a.5.5 0 0 1 0-1h7.648l-2.473-2.12a.5.5 0 0 1-.055-.705"></path>
              </svg>
            </template>
          </MenuItem>
      </Menu>
    </div>

    <SearchModal v-model:open="isSearchOpen" />
    <SettingsModal v-model:open="isSettingsModalOpen" />
    <BugReportModal v-model:open="isBugReportOpen" />
    <CreateWorkspaceModal v-model:open="isCreateWorkspaceOpen" />
    <DeleteWorkflowModal
      v-model:open="isDeleteModalOpen"
      :workflow-name="pendingDeleteName"
      :submitting="isDeleting"
      @confirm="confirmDeleteWorkflow"
    />
  </aside>
</template>

<style scoped>
/* Leave: collapse height + fade. Staying in flow means the siblings
   slide up smoothly as the row shrinks, no position:absolute needed
   (which previously caused a flash alongside SortableJS). */
.wf-leave-active {
  transition: max-height 0.22s ease, opacity 0.18s ease, margin 0.22s ease, padding 0.22s ease;
  overflow: hidden;
  pointer-events: none;
}
.wf-leave-from {
  max-height: 40px;
}
.wf-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Enter: matching expand + fade for added rows. */
.wf-enter-active {
  transition: max-height 0.22s ease, opacity 0.18s ease;
  overflow: hidden;
}
.wf-enter-from {
  max-height: 0;
  opacity: 0;
}
.wf-enter-to {
  max-height: 40px;
  opacity: 1;
}

/* Drag-to-reorder affordance (real sessions only). Disable text selection on
   rows so a quick mousedown before the drag threshold can't highlight text. */
.wf-item {
  user-select: none;
}
.wf-item > div:first-child {
  cursor: grab;
}
.wf-draft > div:first-child {
  cursor: pointer;
}
.wf-chosen > div:first-child {
  cursor: grabbing;
}

/* Placeholder slot while dragging: invisible but occupies the row's space so
   siblings animate around a gap. */
.wf-ghost {
  opacity: 0;
}

/* Floating clone that follows the cursor. Styled to look identical to a
   stationary row — no shadow, no tint. Opacity and transform are rewritten
   every frame by `constrainDragPreview`, which also clamps Y to the list. */
.wf-drag {
  box-shadow: none;
}
</style>
