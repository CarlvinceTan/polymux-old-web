import { ref, computed, watch, readonly, onUnmounted } from 'vue'
import type {
  ViewportState,
  BrowserSpawnedPayload,
  BrowserClosedPayload,
  BrowserAgentReleasedPayload,
  AgentThinkingPayload,
  ToolDescriptorPayload,
  PageNavigatedPayload,
  AgentPriority,
  SpawnBrowserAgentPayload,
  CloseBrowserAgentPayload,
  StreamPriorityUpdatePayload,
  ErrorPayload,
} from '../types'
import type { SessionHandle } from '../workflows/useWorkflowSession'
import { NAVIGATION_FREEZE_MS } from './navigationTiming'

const URL_RE = /https?:\/\/[^\s"',)}\]]+/

function extractUrl(text: string): string | null {
  const match = URL_RE.exec(text)
  return match ? match[0] : null
}

export function useViewports(session: SessionHandle) {
  const viewports = ref<ViewportState[]>([])
  const browserMode = computed(() => viewports.value.length > 0)
  const browserAgentCap = ref(0)
  const activeAgentId = ref<string | null>(null)

  let pendingCounter = 0
  const PENDING_PREFIX = '__pending_'

  function isPendingId(id: string) {
    return id.startsWith(PENDING_PREFIX)
  }

  function payloadToViewport(p: BrowserSpawnedPayload): ViewportState {
    // Map the server's lifecycle status to a viewport color:
    //   running              → yellow + 3 dots (only when truly working)
    //   ready                → idle, run icon visible (manually-spawned agent
    //                         that hasn't been tasked yet; persisted as such
    //                         so reload doesn't flip it back to spinning)
    //   completed            → green DONE
    //   failed/stopped/
    //   interrupted          → red INTERRUPTED/FAILED
    //   anything else        → idle gray (defensive — covers undefined on
    //                         cold-start spawns before the first transition).
    // Visual-only entries hydrated from last_browser_states never go through
    // the working/yellow branch: a placeholder must not look like it's busy
    // when the only thing happening is the URL repaint on reload.
    const status = p.status ?? ''
    const isVisualOnly = !!p.is_visual_only
    const isRunning = status === 'running' && !isVisualOnly
    const isReady = status === 'ready'
    const isCompleted = status === 'completed'
    const isFailed = status === 'failed' || status === 'stopped' || status === 'interrupted'
    const action = isRunning
      ? `TASK: ${p.task.slice(0, 40)}`
      : isCompleted
        ? 'DONE'
        : isFailed
          ? status.toUpperCase()
          : isReady
            ? 'READY'
            : isVisualOnly
              ? 'IDLE'
              : `TASK: ${p.task.slice(0, 40)}`
    return {
      agentId: p.agent_id,
      url: p.url ?? '',
      agentName: p.label ?? p.session_name ?? '',
      currentAction: action,
      isLoading: isRunning,
      isWorking: isRunning,
      isDone: isCompleted,
      isFailed,
      isVisualOnly,
    }
  }

  // Default URL for a freshly-spawned chromium tab. Chromium opens new tabs at
  // chrome://newtab (or about:newtab on some builds) and emits a Page.frameNavigated
  // shortly after; we pre-fill the URL bar with this so the pending tile reads
  // the same as the post-page_navigated steady state, instead of flashing an
  // empty bar between click and the first navigation event landing.
  const PENDING_URL_PLACEHOLDER = 'chrome://newtab'

  function pendingViewport(): ViewportState {
    return {
      agentId: `${PENDING_PREFIX}${++pendingCounter}`,
      url: PENDING_URL_PLACEHOLDER,
      agentName: `BROWSER ${String(viewports.value.length + 1).padStart(2, '0')}`,
      currentAction: 'SPAWNING...',
      isLoading: true,
      isWorking: true,
      isDone: false,
      isFailed: false,
      isVisualOnly: false,
    }
  }

  function updateViewport(agentId: string, patch: Partial<ViewportState>) {
    const idx = viewports.value.findIndex(v => v.agentId === agentId)
    if (idx === -1) return
    const next = [...viewports.value]
    next[idx] = { ...next[idx]!, ...patch }
    viewports.value = next
  }

  // Defer URL bar updates by the same window the screencast holds the
  // previous frame for. The chrome bar would otherwise flip to the new URL
  // ahead of the first meaningful paint of that URL, leaving a brief
  // mismatch where the bar says one thing and the viewport still shows the
  // old page (or chromium's blank-flash). With the deferral, the URL and
  // the first new frame land together.
  const pendingUrlUpdates = new Map<string, ReturnType<typeof setTimeout>>()

  function scheduleUrlUpdate(agentId: string, url: string) {
    const existing = pendingUrlUpdates.get(agentId)
    if (existing) clearTimeout(existing)
    const handle = setTimeout(() => {
      pendingUrlUpdates.delete(agentId)
      updateViewport(agentId, { url })
    }, NAVIGATION_FREEZE_MS)
    pendingUrlUpdates.set(agentId, handle)
  }

  function cancelPendingUrlUpdate(agentId: string) {
    const existing = pendingUrlUpdates.get(agentId)
    if (existing) {
      clearTimeout(existing)
      pendingUrlUpdates.delete(agentId)
    }
  }

  function sendPriorityUpdate() {
    const priorities: AgentPriority[] = viewports.value.map(v => ({
      agent_id: v.agentId,
      priority: v.agentId === activeAgentId.value ? 'high' : 'medium',
    }))
    session.send<StreamPriorityUpdatePayload>('stream_priority_update', { priorities })
  }

  function sortByLabel(list: ViewportState[]): ViewportState[] {
    return [...list].sort((a, b) =>
      a.agentName.localeCompare(b.agentName, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }

  // Prefer a still-working viewport as the default active one; fall back to
  // the lowest-labelled agent when every agent is already done.
  function pickDefaultActiveAgent(list: ViewportState[]): string | null {
    if (list.length === 0) return null
    const working = list.find(v => v.isWorking && !v.isDone)
    return (working ?? list[0]!).agentId
  }

  function warnIfOverCap(context: string) {
    if (browserAgentCap.value > 0 && viewports.value.length > browserAgentCap.value) {
      console.warn(
        `[useViewports] ${context}: ${viewports.value.length} viewports exceeds cap of ${browserAgentCap.value}`,
      )
    }
  }

  watch(
    () => session.sessionState.value,
    (state) => {
      if (!state) {
        viewports.value = []
        browserAgentCap.value = 0
        activeAgentId.value = null
        for (const handle of pendingUrlUpdates.values()) clearTimeout(handle)
        pendingUrlUpdates.clear()
        return
      }
      viewports.value = sortByLabel((state.browser_agents ?? []).map(payloadToViewport))
      browserAgentCap.value = state.browser_agent_cap ?? 0
      if (activeAgentId.value && !viewports.value.some(v => v.agentId === activeAgentId.value)) {
        activeAgentId.value = null
      }
      if (!activeAgentId.value && viewports.value.length > 0) {
        activeAgentId.value = pickDefaultActiveAgent(viewports.value)
        sendPriorityUpdate()
      }
      warnIfOverCap('session_state sync')
    },
    { immediate: true },
  )

  function handleBrowserSpawned(p: BrowserSpawnedPayload) {
    // eslint-disable-next-line no-console
    console.debug('[viewports] browser_spawned', { agent_id: p.agent_id, label: p.label, task: p.task?.slice(0, 60) })
    const pendingIdx = viewports.value.findIndex(v => isPendingId(v.agentId))
    if (pendingIdx !== -1) {
      const next = [...viewports.value]
      // BrowserSpawnedPayload for manually-spawned agents arrives without a
      // URL — page_navigated lands separately a beat later. Carry over the
      // pending tile's placeholder URL so the bar doesn't blip back to empty
      // between spawn-confirm and the first navigation event.
      const spawned = payloadToViewport(p)
      if (!spawned.url && next[pendingIdx]!.url) spawned.url = next[pendingIdx]!.url
      next[pendingIdx] = spawned
      viewports.value = next
    } else if (!viewports.value.some(v => v.agentId === p.agent_id)) {
      viewports.value = [...viewports.value, payloadToViewport(p)]
    }
    activeAgentId.value = p.agent_id
    sendPriorityUpdate()
    warnIfOverCap('browser_spawned')
  }

  function handleBrowserClosed(p: BrowserClosedPayload) {
    const completed = p.reason === 'completed'
    updateViewport(p.agent_id, {
      isWorking: false,
      isDone: completed,
      isFailed: !completed,
      currentAction: completed ? 'DONE' : p.reason.toUpperCase(),
    })
  }

  function handleBrowserAgentReleased(p: BrowserAgentReleasedPayload) {
    cancelPendingUrlUpdate(p.agent_id)
    if (activeAgentId.value === p.agent_id) activeAgentId.value = null
    viewports.value = viewports.value.filter(v => v.agentId !== p.agent_id)
    sendPriorityUpdate()
  }

  function handleAgentThinking(p: AgentThinkingPayload) {
    if (p.agent_id === 'orchestrator') return
    const target = viewports.value.find(v => v.agentId === p.agent_id)
    if (!target) return
    // Visual-only placeholders (hydrated from last_browser_states) should not
    // accept live activity events. The DB snapshot is authoritative for them
    // — a stray thinking frame for a freshly-spawned successor with the same
    // id would otherwise flip a red/green tile back to yellow on reload.
    if (target.isVisualOnly) return

    // Any activity on a previously-completed agent means the orchestrator has
    // assigned a new task to the same worker — flip the status line back to
    // yellow so it reflects the live state.
    const patch: Partial<ViewportState> = {
      currentAction: p.action.toUpperCase(),
      isLoading: false,
      isWorking: true,
      isDone: false,
      isFailed: false,
    }

    let pendingUrl: string | null = null
    if (p.action.startsWith('tool:') && p.detail) {
      const url = extractUrl(p.detail)
      if (url) {
        pendingUrl = url
        // eslint-disable-next-line no-console
        console.debug('[viewports] url from agent_thinking detail', { agent_id: p.agent_id, action: p.action, url })
      }
    }

    updateViewport(p.agent_id, patch)
    if (pendingUrl) scheduleUrlUpdate(p.agent_id, pendingUrl)
  }

  function handlePageNavigated(p: PageNavigatedPayload) {
    // eslint-disable-next-line no-console
    console.debug('[viewports] page_navigated', { agent_id: p.agent_id, url: p.url, hasViewport: viewports.value.some(v => v.agentId === p.agent_id) })
    if (!p.url || !viewports.value.some(v => v.agentId === p.agent_id)) return
    scheduleUrlUpdate(p.agent_id, p.url)
  }

  function handleToolDescriptor(p: ToolDescriptorPayload) {
    if (!p.text) return
    if (p.agent_id === 'orchestrator') return
    if (!viewports.value.some(v => v.agentId === p.agent_id)) return
    updateViewport(p.agent_id, { currentAction: p.text.toUpperCase() })
  }

  function handleAgentLimitReached(p: ErrorPayload) {
    if (p.code === 'AGENT_LIMIT_REACHED') {
      const pendingIdx = viewports.value.findLastIndex(v => isPendingId(v.agentId))
      if (pendingIdx !== -1) {
        const next = [...viewports.value]
        next.splice(pendingIdx, 1)
        viewports.value = next
        if (activeAgentId.value && isPendingId(activeAgentId.value)) {
          activeAgentId.value = null
        }
        sendPriorityUpdate()
      }
    }
  }

  session.on<BrowserSpawnedPayload>('browser_spawned', handleBrowserSpawned)
  session.on<BrowserClosedPayload>('browser_closed', handleBrowserClosed)
  session.on<BrowserAgentReleasedPayload>('browser_agent_released', handleBrowserAgentReleased)
  session.on<AgentThinkingPayload>('agent_thinking', handleAgentThinking)
  session.on<ToolDescriptorPayload>('tool_descriptor', handleToolDescriptor)
  session.on<PageNavigatedPayload>('page_navigated', handlePageNavigated)
  session.on<ErrorPayload>('error', handleAgentLimitReached)

  onUnmounted(() => {
    session.off('browser_spawned', handleBrowserSpawned)
    session.off('browser_closed', handleBrowserClosed)
    session.off('browser_agent_released', handleBrowserAgentReleased)
    session.off('agent_thinking', handleAgentThinking)
    session.off('tool_descriptor', handleToolDescriptor)
    session.off('page_navigated', handlePageNavigated)
    session.off('error', handleAgentLimitReached)
    for (const handle of pendingUrlUpdates.values()) clearTimeout(handle)
    pendingUrlUpdates.clear()
  })

  // Backfill a viewport's URL only when it's currently empty. Used to restore
  // the displayed page on revisit when session_state returns live but already
  // completed browser agents (the BrowserSpawnedPayload carries no URL, so
  // payloadToViewport leaves `url: ''`). Won't clobber a real URL that arrived
  // via page_navigated.
  function setViewportUrlIfEmpty(agentId: string, url: string) {
    if (!url) return
    const idx = viewports.value.findIndex(v => v.agentId === agentId)
    if (idx === -1) return
    if (viewports.value[idx]!.url) return
    updateViewport(agentId, { url })
  }

  function closeViewport(agentId: string) {
    if (!isPendingId(agentId)) {
      session.send<CloseBrowserAgentPayload>('close_browser_agent', { agent_id: agentId })
    }
    cancelPendingUrlUpdate(agentId)
    if (activeAgentId.value === agentId) activeAgentId.value = null
    viewports.value = viewports.value.filter(v => v.agentId !== agentId)
    sendPriorityUpdate()
  }

  function spawnBrowserAgent() {
    const pending = pendingViewport()
    viewports.value = [...viewports.value, pending]
    activeAgentId.value = pending.agentId
    sendPriorityUpdate()
    session.send<SpawnBrowserAgentPayload>('spawn_browser_agent', {})
  }

  return {
    viewports: readonly(viewports),
    browserMode: readonly(browserMode),
    browserAgentCap: readonly(browserAgentCap),
    closeViewport,
    spawnBrowserAgent,
    sendPriorityUpdate,
    setViewportUrlIfEmpty,
  }
}
