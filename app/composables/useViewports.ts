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
} from './types'
import type { SessionHandle } from './useSession'

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
    return {
      agentId: p.agent_id,
      url: '',
      agentName: p.label ?? p.session_name,
      currentAction: `TASK: ${p.task.slice(0, 40)}`,
      isLoading: true,
      isWorking: true,
      isDone: false,
    }
  }

  function pendingViewport(): ViewportState {
    return {
      agentId: `${PENDING_PREFIX}${++pendingCounter}`,
      url: '',
      agentName: `BROWSER ${String(viewports.value.length + 1).padStart(2, '0')}`,
      currentAction: 'SPAWNING...',
      isLoading: true,
      isWorking: true,
      isDone: false,
    }
  }

  function updateViewport(agentId: string, patch: Partial<ViewportState>) {
    const idx = viewports.value.findIndex(v => v.agentId === agentId)
    if (idx === -1) return
    const next = [...viewports.value]
    next[idx] = { ...next[idx]!, ...patch }
    viewports.value = next
  }

  function sendPriorityUpdate() {
    const priorities: AgentPriority[] = viewports.value.map(v => ({
      agent_id: v.agentId,
      priority: v.agentId === activeAgentId.value ? 'high' : 'medium',
    }))
    session.send<StreamPriorityUpdatePayload>('stream_priority_update', { priorities })
  }

  watch(
    () => session.sessionState.value,
    (state) => {
      if (!state) {
        viewports.value = []
        browserAgentCap.value = 0
        activeAgentId.value = null
        return
      }
      viewports.value = (state.browser_agents ?? []).map(payloadToViewport)
      browserAgentCap.value = state.browser_agent_cap ?? 0
      if (activeAgentId.value && !viewports.value.some(v => v.agentId === activeAgentId.value)) {
        activeAgentId.value = null
      }
    },
    { immediate: true },
  )

  function handleBrowserSpawned(p: BrowserSpawnedPayload) {
    const pendingIdx = viewports.value.findIndex(v => isPendingId(v.agentId))
    if (pendingIdx !== -1) {
      const next = [...viewports.value]
      next[pendingIdx] = payloadToViewport(p)
      viewports.value = next
    } else if (!viewports.value.some(v => v.agentId === p.agent_id)) {
      viewports.value = [...viewports.value, payloadToViewport(p)]
    }
    activeAgentId.value = p.agent_id
    sendPriorityUpdate()
  }

  function handleBrowserClosed(p: BrowserClosedPayload) {
    updateViewport(p.agent_id, {
      isWorking: false,
      isDone: true,
      currentAction: p.reason === 'completed' ? 'DONE' : p.reason.toUpperCase(),
    })
  }

  function handleBrowserAgentReleased(p: BrowserAgentReleasedPayload) {
    if (activeAgentId.value === p.agent_id) activeAgentId.value = null
    viewports.value = viewports.value.filter(v => v.agentId !== p.agent_id)
    sendPriorityUpdate()
  }

  function handleAgentThinking(p: AgentThinkingPayload) {
    if (p.agent_id === 'orchestrator') return
    if (!viewports.value.some(v => v.agentId === p.agent_id)) return

    const patch: Partial<ViewportState> = {
      currentAction: p.action.toUpperCase(),
      isLoading: false,
    }

    if (p.action.startsWith('tool:') && p.detail) {
      const url = extractUrl(p.detail)
      if (url) patch.url = url
    }

    updateViewport(p.agent_id, patch)
  }

  function handlePageNavigated(p: PageNavigatedPayload) {
    if (!p.url || !viewports.value.some(v => v.agentId === p.agent_id)) return
    updateViewport(p.agent_id, { url: p.url })
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
  })

  function promoteViewport(agentId: string) {
    if (!viewports.value.some(v => v.agentId === agentId)) return
    activeAgentId.value = agentId
    sendPriorityUpdate()
  }

  function demoteActive() {
    activeAgentId.value = null
    sendPriorityUpdate()
  }

  function closeViewport(agentId: string) {
    if (!isPendingId(agentId)) {
      session.send<CloseBrowserAgentPayload>('close_browser_agent', { agent_id: agentId })
    }
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
    activeAgentId: readonly(activeAgentId),
    promoteViewport,
    demoteActive,
    closeViewport,
    spawnBrowserAgent,
    sendPriorityUpdate,
  }
}
