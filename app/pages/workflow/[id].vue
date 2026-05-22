<script setup lang="ts">
import type { ViewportState, UserLocationPayload, ErrorPayload } from '~/composables/types'
import type { ViewMode } from '~/components/chat/ChatLayout.vue'
import { DRAFT_WORKFLOW_ID } from '~/composables/workflows/useWorkflowList'
import {
  clearStickyOverBudget,
  invalidateUsageCache,
  markStickyOverBudget,
} from '~/composables/chat/useChatPromptSendGuard'

// Re-mount the page when the workflow id changes. `useAgentChats` keys its
// `useState` by the sessionId captured at construction, so reusing the layout
// across workflows would bind the new workflow's incoming WS messages to the
// previous workflow's `chat-messages-{id}` slot — and `fetchMessages` is only
// called from `onMounted`, so the new workflow's history would never load.
// A per-id key makes the parent layout (and all the composables it owns)
// recreate cleanly on each workflow switch.
definePageMeta({
  key: route => route.params.id as string,
})

const { t } = useI18n()
const route = useRoute()
const workflowId = computed(() => route.params.id as string)

const headerTabs = computed(() => {
  const base = `/workflow/${workflowId.value}`
  return {
    [t('workflow.tabs.agent')]: `${base}/agent`,
    [t('workflow.tabs.schedule')]: `${base}/schedule`,
    [t('workflow.tabs.artifacts')]: `${base}/artifacts`,
  } satisfies Record<string, string>
})

const sessionId = computed(() => route.params.id as string)

const { sessions, sessionsLoaded, renameSession, fetchMessages, deleteSessionIfEmpty, setSessionRunning } = useWorkflowList()

const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'

const isNewWorkflow = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return !s || s.title === 'New Workflow'
})

// Stale-URL guard: after sign-in (or workspace switch) the URL may point at a
// session that was deleted, lives in another workspace, or never existed.
// Once the session list is known for the current workspace, bounce to
// /workflow/new instead of letting child pages (artifacts, agent, schedule)
// hammer the API with 404s for an id that's never going to resolve.
watch(
  [sessions, sessionsLoaded],
  ([list, loaded]) => {
    if (!loaded) return
    if (list.some(s => s.id === sessionId.value)) return
    void navigateTo('/workflow/new', { replace: true })
  },
  { immediate: true },
)

async function onRename(title: string) {
  await renameSession(sessionId.value, title)
}

const supabaseUser = useSupabaseUser()
const userName = computed(() => {
  const meta = supabaseUser.value?.user_metadata
  const full = (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || supabaseUser.value?.email?.split('@')[0]
    || ''
  return full.trim().split(/\s+/)[0] || ''
})
const welcomeSuggestion = 'Show me something cool'

const presetPrompt = pickWelcomePrompt()

const session = useWorkflowSession(sessionId)
const chats = useAgentChats(session)
const messageFeedback = useMessageFeedback(sessionId.value)
const vp = useViewports(session)
const wsScreencast = useScreencast(session)
const runtimeConfig = useRuntimeConfig()
const extensionId = computed<string>(() => (runtimeConfig.public.extensionId as string | undefined) ?? '')
const extScreencast = useExtensionScreencast(session, extensionId)

// Mode-agnostic façade for downstream consumers (ViewportGallery / Viewport):
// in server mode wsScreencast carries frames over the session WS binary
// channel and extScreencast contributes nothing; in extension mode the
// reverse holds. Either way, agent ids are unique across both paths so the
// merge never collides on a single id. cursorPositions only flow through
// the WS path (the server emits cursor events from midas; the extension
// runtime doesn't surface them yet) so we forward that ref directly.
const mergedFrameUrls = computed(() => {
  const ws = wsScreencast.frameUrls.value
  const ext = extScreencast.frameUrls.value
  if (ext.size === 0) return ws
  if (ws.size === 0) return ext
  const merged = new Map<string, string>()
  for (const [k, v] of ws.entries()) merged.set(k, v)
  for (const [k, v] of ext.entries()) merged.set(k, v)
  return merged
})
const screencast = {
  frameUrls: readonly(mergedFrameUrls),
  cursorPositions: wsScreencast.cursorPositions,
  cleanup: () => {
    wsScreencast.cleanup()
    extScreencast.cleanup()
  },
}

// Pre-WS REST hydration: fill the gallery from the workflow row's persisted
// `last_browser_states` as soon as the /sessions list lands, so the gallery
// isn't briefly empty while the WS handshake completes. The WS `session_state`
// will overwrite this once it arrives — useViewports.hydrate() is a no-op
// after the first real session_state lands.
watch(
  () => sessions.value.find(s => s.id === sessionId.value)?.last_browser_states,
  (states) => {
    if (states && states.length > 0) vp.hydrate(states)
  },
  { immediate: true },
)
const geo = useGeolocation()
const toast = useAppToast()
// Owns workflow_run state at the page level so the SidePanel "running kind"
// watch below can distinguish node-driven runs (progress arc) from
// chat-driven activity (spinner). Each `workflow_run_*` WS event is handled
// exactly once by this single instance; WorkflowNodeCanvas injects it for
// its Run/Stop toggle so a second composable instance never doubles up.
const workflowRun = useWorkflowRun(session)
provide('workflow-run', workflowRun)

// Title resolution order:
// 1. Backend-generated title from the websocket `title_response` (only set
//    after the user's first send for a fresh workflow). This is the source
//    of truth the moment it arrives — the watcher below also persists it
//    via `renameSession`, but reading it here means we don't have to wait
//    for the round-trip + reactivity propagation through `realSessions`.
// 2. The persisted title from the session list (covers manual renames and
//    workflows that already had a title at page load).
// 3. "New Workflow" placeholder while we have neither — keeps the heading
//    stable until the backend title arrives instead of flashing a cryptic
//    "Session abc-123…" id-based fallback.
const workflowTitle = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  if (s?.title && s.title !== 'New Workflow') return s.title
  if (chats.summarisedTitle.value) return chats.summarisedTitle.value
  return s?.title || 'New Workflow'
})

const { currentWorkspace } = useWorkspaces()
const workspaceId = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return s?.workspace_id ?? currentWorkspace.value?.id ?? ''
})

const workspacePlan = computed(() => currentWorkspace.value?.plan ?? null)

/** Replay prompt text after a TOKEN_BUDGET_ERROR rolls back an optimistic send. */
const chatBudgetRestorePrompt = ref<string | null>(null)
/**
 * Server-supplied "weekly cap reached" copy. Non-null ⇒ a blocking modal is
 * rendered over the workflow UI; clearing it (via the modal's dismiss button)
 * also clears the sticky over-budget flag so the user can attempt to retry.
 */
const budgetExceededMessage = ref<string | null>(null)
function dismissBudgetModal() {
  budgetExceededMessage.value = null
  clearStickyOverBudget(workspaceId.value || undefined)
}
// Bind workflow save/reject listeners to the page lifetime so the builder's
// incremental SaveWorkflow events are never dropped while the user is in
// Chat or Viewport view (where `WorkflowNodeCanvas` is unmounted).
useWorkflowAgentEvents(session, workspaceId)

// Mirror the agent's in-progress workflow tree (pre-save) into shared state
// for WorkflowNodeCanvas to render — same lifetime reasoning as above.
useWorkflowDraft(session, sessionId)

session.on<ErrorPayload>('error', (p) => {
  if (p.code === 'AGENT_LIMIT_REACHED') {
    toast.show(
      `Browser agent limit reached for your plan. Upgrade for more.`,
      'warning',
      8000,
    )
  }
  if (p.code === 'TOKEN_BUDGET_EXCEEDED') {
    // Invalidate the cached usage so the next send re-fetches from Supabase
    // rather than trusting the optimistic increment from the prior attempt.
    invalidateUsageCache(workspaceId.value || undefined)
    // Sticky-block every subsequent send: Supabase's flushed floor lags the
    // server's in-memory counter by ~5 s, so a fresh RPC may still report
    // "OK" right after the server has rejected. The flag stays set until the
    // user dismisses the budget modal (which calls clearStickyOverBudget).
    markStickyOverBudget(workspaceId.value || undefined)
    const replay = chats.rollbackOrchestratorAfterBudgetError()
    if (replay) chatBudgetRestorePrompt.value = replay
    budgetExceededMessage.value = p.message || t('chat.weeklyTokenBudgetToastFallback')
    return
  }
  // Extension mode was selected for this workflow but no paired Chrome is
  // available to host the new sub-agent. Surface a hint to either pair via
  // the popup or fall back to server mode — we don't auto-fall-back per the
  // manual-only design.
  if (p.code === 'EXTENSION_NOT_CONNECTED') {
    toast.show(t('browser.modeNotConnectedError'), 'warning', 10000)
  }
})

const LOCATION_MIN_INTERVAL_MS = 5_000
const LOCATION_MIN_DISTANCE_M = 10

let lastSentAt = 0
let lastSentLat: number | null = null
let lastSentLon: number | null = null

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function sendLocationUpdate(force = false) {
  if (!geo.enabled.value || !geo.coords.value) return
  const { latitude, longitude, accuracy } = geo.coords.value
  const now = Date.now()
  if (!force && lastSentLat !== null && lastSentLon !== null) {
    const elapsed = now - lastSentAt
    const moved = haversineMeters(lastSentLat, lastSentLon, latitude, longitude)
    if (elapsed < LOCATION_MIN_INTERVAL_MS && moved < LOCATION_MIN_DISTANCE_M) return
  }
  lastSentAt = now
  lastSentLat = latitude
  lastSentLon = longitude
  session.send<UserLocationPayload>('user_location', {
    latitude,
    longitude,
    accuracy,
  })
}

watch(session.status, (status) => {
  if (status === 'connected') {
    sendLocationUpdate(true)
  }
})

watch(geo.coords, () => {
  if (session.status.value === 'connected') {
    sendLocationUpdate()
  }
})

watch(sessionId, (id) => {
  if (id) sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, id)
})

/**
 * True when the user never sent anything: a persisted user message would land in
 * `chats.orchestrator.messages`. Title check guards against deleting a legitimate
 * workflow whose history hasn't finished loading (real workflows get renamed away
 * from 'New Workflow' on first response).
 */
function isCurrentWorkflowUnused(): boolean {
  const s = sessions.value.find(s => s.id === sessionId.value)
  if (!s || s.title !== 'New Workflow') return false
  const hasUserMessage = chats.orchestrator.messages.value.some(m => m.role === 'user')
  return !hasUserMessage
}

function cleanupIfUnused() {
  if (!isCurrentWorkflowUnused()) return
  const id = sessionId.value
  const stored = sessionStorage.getItem(TAB_LAST_WORKFLOW_KEY)
  if (stored === id) sessionStorage.removeItem(TAB_LAST_WORKFLOW_KEY)
  void deleteSessionIfEmpty(id)
}

onBeforeRouteLeave((to) => {
  // Still navigating inside the same workflow's nested tabs (orchestrator/browser/…) — keep it.
  if (to.params.id === sessionId.value) return
  // Leaving the workflow — drop unused drafts. Viewport persistence is
  // server-side now: spawn/close/page-navigated callbacks update
  // last_browser_states + is_running on the workflow row directly, so the
  // client doesn't need to flush anything here.
  cleanupIfUnused()
})

if (import.meta.client) {
  const onPageHide = () => cleanupIfUnused()
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onPageHide)
  onUnmounted(() => {
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('beforeunload', onPageHide)
  })
}

const loadedAgentHistories = new Set<string>()

onMounted(async () => {
  // Per-tab memory so `/workflow` (no id) restores this workflow on re-entry within the tab.
  sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, sessionId.value)

  const orchestratorHistory = await fetchMessages(sessionId.value)
  // null = HTTP 403: workflow doesn't exist or RLS hides it from this user.
  // Redirect now rather than waiting for fetchSessions's watcher to fire —
  // workspace bootstrap can stretch that to several seconds, during which
  // useWorkflowSession's WebSocket would be banging out 403 reconnects.
  if (orchestratorHistory === null) {
    void navigateTo('/workflow/new', { replace: true })
    return
  }
  chats.orchestrator.loadHistory(orchestratorHistory)
  // Hydrate the calling user's thumbs-up/down state so reload reflects every
  // bubble the user previously rated.
  await messageFeedback.load()

  for (const v of vp.viewports.value) {
    const agentHistory = await fetchMessages(sessionId.value, v.agentId)
    if (agentHistory && agentHistory.length > 0) {
      chats.get(v.agentId).loadHistory(agentHistory)
    }
    loadedAgentHistories.add(v.agentId)
  }
})

watch(() => vp.viewports.value, async (viewports) => {
  for (const v of viewports) {
    if (loadedAgentHistories.has(v.agentId)) continue
    loadedAgentHistories.add(v.agentId)
    const agentHistory = await fetchMessages(sessionId.value, v.agentId)
    if (agentHistory && agentHistory.length > 0) {
      chats.get(v.agentId).loadHistory(agentHistory)
    }
  }
})

onUnmounted(() => screencast.cleanup())

// Viewport restoration is server-authoritative: session_state carries the
// per-agent snapshot (live agents inline, otherwise IsVisualOnly placeholders
// hydrated from last_browser_states with their persisted status + URL). The
// client never issues spawn_browser_agent on reload — that would actually
// start operating the workflow, which is reserved for explicit user prompts
// or scheduled cloud runs.

// Drive the SidePanel running-indicator. Two distinct activity modes share
// the workflow row's "running" slot, and they MUST stay distinguishable —
// they represent fundamentally different things the user is doing:
//
//   'workflow' (progress arc) ─ the workflow_run engine is executing the
//     persisted node graph. Triggered by the dock's Run button or by a
//     scheduled cron firing. Read-only against the workflow definition: no
//     nodes are being added, edited, or removed during a run.
//
//   'chat' (spinner) ─ orchestrator/agent activity in service of a chat turn.
//     Includes orchestrator streaming, mid-think, freshly-sent prompts, AND
//     orchestrator-spawned browser agents that keep working in the
//     background after the user has navigated away. The workflow definition
//     can mutate at any moment.
//
// Order matters below: a confirmed workflow_run wins outright; otherwise
// any local chat signal classifies the activity as chat-driven. When no
// local signal is present we defer to the server's running_kind (carried on
// session_state), which is computed from activeRuns vs agent statuses on
// the same session — so 'chat' there means "agents are still working in the
// background", which the SidePanel must NOT misrepresent as a workflow_run.
const workflowRunActive = computed(() =>
  workflowRun.runStatus.value === 'running' || workflowRun.runStatus.value === 'pending',
)
const chatActive = computed(() => {
  if (chats.orchestrator.isStreaming.value) return true
  if (chats.orchestrator.thinking.value != null) return true
  // waitingForAgent is the authoritative chat-turn flag: set on send/edit,
  // cleared by the orchestrator's turn-end frame or by a server-side stop.
  // It survives the same conditions the dots indicator does, so the spinner
  // and the dots clear together instead of diverging when activity ends.
  if (chats.orchestrator.waitingForAgent.value) return true
  if ((vp.viewports.value as ViewportState[]).some(v => v.isWorking)) return true
  return false
})
const runningKind = computed<'chat' | 'workflow' | null>(() => {
  if (workflowRunActive.value) return 'workflow'
  if (chatActive.value) return 'chat'
  // No local chat signal. Don't fall back to session_state.running_kind ===
  // 'chat' here: the server doesn't rebroadcast session_state when a
  // browser agent transitions from running → completed (only browser_closed
  // fires), so the cached running_kind on the wire lags past the agent's
  // actual completion. chatActive already covers chat-driven activity via
  // real-time WS signals (waitingForAgent, viewport.isWorking) — trusting
  // it exclusively keeps the spinner in sync with the dots.
  //
  // We DO still trust serverKind === 'workflow' as a reload-safe fallback:
  // workflowRun.hydrate isn't called on page load, so workflowRunActive can
  // miss an in-flight scheduled / cron run that the server knows about.
  if (session.sessionState.value?.running_kind === 'workflow') return 'workflow'
  return null
})

watch(
  runningKind,
  (kind) => {
    if (!sessionId.value) return
    setSessionRunning(sessionId.value, kind)
  },
  { immediate: true },
)

// Release the override when this page tears down so the SidePanel falls back
// to server-authoritative is_running for this row. Otherwise the last-known
// override would linger and the indicator could keep painting (or hiding)
// activity after we've lost the local signals to update it.
onUnmounted(() => {
  if (sessionId.value) setSessionRunning(sessionId.value, null)
})

const titleRequested = ref(false)

watch(chats.summarisedTitle, (title) => {
  if (title) renameSession(sessionId.value, title)
})

// Only show the welcome/new-workflow UI for genuinely new workflows (drafts or
// freshly-promoted sessions still titled "New Workflow"). For existing
// workflows, the messages array is briefly empty between mount and the async
// `fetchMessages` resolving — without this gate, switching workflows flashes
// the welcome UI during that window.
const welcome = computed(() =>
  chats.orchestrator.messages.value.length === 0 && isNewWorkflow.value,
)

const viewportList = computed({
  get: () => vp.viewports.value as ViewportState[],
  set: () => {},
})

// ── View-mode state ─────────────────────────────────────────────────────────
// Owned at the workflow-page level (rather than ChatLayout) so it survives
// Agent ↔ Schedule ↔ Artifacts tab swaps within a single workflow visit.
//
// Persistence: sessionStorage (per browser tab). Re-entering the workflow
// from another page in the same tab restores the prior view; closing the tab
// drops the memory and the next visit starts in chat.
//
// Auto-switch: whenever the user prompts (send / edit / retry) we arm a
// one-shot trigger. The first time `vp.viewports` grows after that — i.e.
// the orchestrator delegated to a browser agent — we flip to the viewport
// view. Manual view changes (or one auto-switch firing) disarm it, so the
// user's choice is never overridden once they've expressed one for the
// current prompt cycle.
const VIEW_MODE_KEY_PREFIX = 'polymux_workflow_viewmode:'

function loadViewMode(id: string): ViewMode | null {
  if (!import.meta.client) return null
  if (!id || id === DRAFT_WORKFLOW_ID) return null
  try {
    const raw = sessionStorage.getItem(VIEW_MODE_KEY_PREFIX + id)
    if (raw === 'chat' || raw === 'viewport' || raw === 'flow') return raw
  } catch {}
  return null
}

function saveViewMode(id: string, mode: ViewMode) {
  if (!import.meta.client) return
  if (!id || id === DRAFT_WORKFLOW_ID) return
  try {
    sessionStorage.setItem(VIEW_MODE_KEY_PREFIX + id, mode)
  } catch {}
}

const viewMode = ref<ViewMode>('chat')
const autoSwitchArmed = ref(false)

onMounted(() => {
  viewMode.value = loadViewMode(sessionId.value) ?? 'chat'
})

watch(viewMode, (mode) => {
  saveViewMode(sessionId.value, mode)
  // Any view-mode commit clears the arm — covers both the auto-switch
  // itself (one-shot) and any manual click on the view switcher.
  autoSwitchArmed.value = false
})

watch(sessionId, (id) => {
  viewMode.value = loadViewMode(id) ?? 'chat'
  autoSwitchArmed.value = false
})

// ── Browser-mode state ──────────────────────────────────────────────────────
// Same lifetime as viewMode — owned by the workflow page so it survives the
// Agent / Schedule / Artifacts swap. Per-workflow hint lives in sessionStorage
// (matches viewMode).
//
// Persistence layers, in order of authority:
//   1. The workflow row's `last_browser_mode` column — the cross-device,
//      cross-tab truth. session_ws hydrates the in-memory session from this
//      on first connect, then writes back to it on every set_browser_mode.
//      session_state.browser_mode is the wire surface; our reconciler below
//      adopts it without exception.
//   2. sessionStorage (per-workflow) — pre-WS hint so the picker shows the
//      right radio before the first session_state arrives. Overwritten by
//      the wire value once it lands. If absent, the UI defaults to Polymux
//      Server (`server`).
//
// Scheduled / unattended runs ignore the column and stay on 'server'
// because they have no live client to drive the user's local Chrome.
type BrowserMode = 'server' | 'extension'
const BROWSER_MODE_KEY_PREFIX = 'polymux_workflow_browsermode:'

function isBrowserMode(v: unknown): v is BrowserMode {
  return v === 'server' || v === 'extension'
}

function loadBrowserMode(id: string): BrowserMode | null {
  if (!import.meta.client) return null
  if (!id || id === DRAFT_WORKFLOW_ID) return null
  try {
    const raw = sessionStorage.getItem(BROWSER_MODE_KEY_PREFIX + id)
    return isBrowserMode(raw) ? raw : null
  } catch {
    return null
  }
}

function saveBrowserMode(id: string, mode: BrowserMode) {
  if (!import.meta.client) return
  if (!id || id === DRAFT_WORKFLOW_ID) return
  try {
    sessionStorage.setItem(BROWSER_MODE_KEY_PREFIX + id, mode)
  } catch {}
}

const browserMode = ref<BrowserMode>('server')
// Skip the next send_browser_mode after a sessionState-driven reconciliation
// so the server's echo doesn't get re-echoed back at it as a fresh write.
let suppressNextBrowserModeSend = false
// Block client→server writes until the first session_state echo arrives.
// Without this, mount-time hydration from sessionStorage would race the
// server's DB hydration: a tab opened with stale 'server' sessionStorage
// could overwrite a DB-canonical 'extension' value chosen in another tab.
// After the first echo the server has confirmed its current view, the
// reconciler has adopted it, and any subsequent change is a deliberate
// user toggle worth persisting.
let browserModeReady = false

onMounted(() => {
  browserMode.value = loadBrowserMode(sessionId.value) ?? 'server'
})

watch(browserMode, (mode) => {
  saveBrowserMode(sessionId.value, mode)
  if (suppressNextBrowserModeSend) {
    suppressNextBrowserModeSend = false
    return
  }
  if (!browserModeReady) {
    // Mount-time hydration. The server is about to echo its own value; if
    // it matches ours the reconciler will simply flip browserModeReady.
    // If it disagrees the reconciler adopts the server value — either way
    // the user's first deliberate toggle (post-ready) is what actually
    // writes to the DB.
    return
  }
  // useWorkflowSession buffers sends until the socket reaches OPEN, so this
  // is safe to call even when the WS is still connecting on first mount.
  session.send('set_browser_mode', { mode })
})

watch(sessionId, (id) => {
  const next = loadBrowserMode(id) ?? 'server'
  if (next !== browserMode.value) {
    browserMode.value = next
  }
})

// Reconcile with the server's echo on every session_state. The server
// canonicalises mode (unknown strings collapse to 'server') so its echo is
// Server is canonical now that the workflow row carries `last_browser_mode`:
// session_ws hydrates the in-memory mode from the DB on first connect, so the
// first session_state echo IS the cross-device truth. We always adopt it,
// overriding any stale local sessionStorage value. This means a fresh page
// can briefly mismatch the cross-device choice (sessionStorage gets a default
// 'server' until the first echo arrives) — but a one-frame mismatch is
// invisible to the user because the picker UI gates its enabled state on the
// extension status, not on browserMode.
//
// Subsequent echoes also adopt the server value: tab A toggles, server
// broadcasts session_state to tab A and tab B, tab B's local ref flips
// without requiring it to send anything. suppressNextBrowserModeSend gates
// the immediate downstream send-out so we don't loop the adoption back into
// another set_browser_mode write.
watch(
  () => session.sessionState.value?.browser_mode,
  (serverMode) => {
    if (!serverMode || !isBrowserMode(serverMode)) return
    if (serverMode !== browserMode.value) {
      suppressNextBrowserModeSend = true
      browserMode.value = serverMode
    }
    // Unblock the watcher-driven write path now that we know what the
    // server thinks. Done after the adoption so the suppress flag covers
    // the immediate downstream watch fire.
    browserModeReady = true
  },
)

watch(() => vp.viewports.value.length, (len, prev) => {
  if (!autoSwitchArmed.value) return
  if (len <= (prev ?? 0)) return
  if (viewMode.value !== 'viewport') {
    viewMode.value = 'viewport'
  } else {
    autoSwitchArmed.value = false
  }
})

function armAutoSwitch() {
  autoSwitchArmed.value = true
}

provide('workflow-id', sessionId)
provide('workflow-workspace-id', workspaceId)
provide('workflow-workspace-plan', workspacePlan)
provide('chat-budget-restore-prompt', chatBudgetRestorePrompt)
provide('chat-chats', chats)
provide('chat-vp', vp)
provide('chat-screencast', screencast)
provide('chat-session', session)
provide('chat-title', workflowTitle)
provide('chat-is-new', isNewWorkflow)
provide('chat-welcome', welcome)
provide('chat-viewport-list', viewportList)
provide('chat-user-name', userName)
provide('chat-welcome-suggestion', welcomeSuggestion)
provide('chat-preset-prompt', presetPrompt)
provide('chat-title-requested', titleRequested)
provide('chat-view-mode', viewMode)
provide('chat-browser-mode', browserMode)
provide('chat-arm-auto-switch', armAutoSwitch)
provide('chat-on-rename', onRename)
provide('chat-on-close-viewport', (agentId: string) => { vp.closeViewport(agentId); chats.drop(agentId) })
provide('chat-on-spawn-browser-agent', () => vp.spawnBrowserAgent())
provide('chat-message-feedback', messageFeedback)
</script>

<template>
  <FeatureGate name="workflows">
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <!-- Key by workflow id only so Agent / Schedule / Artifacts swaps (and query
           changes such as artifact deeplinks) don't destroy sibling pages outright.
           The agent tab opts into keep-alive to preserve flow-canvas UI state between
           those visits — see workflow/[id]/agent.vue. -->
      <NuxtPage
        :key="workflowId"
        class="min-h-0 min-w-0 flex-1"
      />
    </div>

    <!-- Weekly token budget modal: shown after the server rejects a send
         with TOKEN_BUDGET_EXCEEDED. Blocks further sends (sticky cap) until
         the user dismisses it, so the spinner can't keep firing against a
         workspace that's already out of tokens. -->
    <BudgetExceededModal
      v-if="budgetExceededMessage"
      :open="true"
      :message="budgetExceededMessage"
      @dismiss="dismissBudgetModal"
    />

    <!-- Credential picker: opens whenever the orchestrator fires
         RequestCredential. Lives at the workflow page level so the modal
         survives across the agent / schedule / artifacts sub-tabs and the
         pending-state outlives any single child component. -->
    <CredentialRequestModal
      v-if="chats.pendingCredentialRequest.value"
      :open="true"
      :site="chats.pendingCredentialRequest.value.site"
      :purpose="chats.pendingCredentialRequest.value.purpose"
      :suggested-username="chats.pendingCredentialRequest.value.suggestedUsername"
      @submit="(v: { credentialId: string; username: string; password: string }) => chats.provideCredential(chats.pendingCredentialRequest.value!.msgId, v)"
      @cancel="chats.provideCredential(chats.pendingCredentialRequest.value!.msgId, { cancelled: true })"
      @update:open="(open: boolean) => { if (!open && chats.pendingCredentialRequest.value) chats.provideCredential(chats.pendingCredentialRequest.value.msgId, { cancelled: true }) }"
    />
  </div>
  </FeatureGate>
</template>
