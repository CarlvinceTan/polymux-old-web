<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState, UserLocationPayload, ErrorPayload } from '~/composables/types'

const route = useRoute()
const workflowId = computed(() => route.params.id as string)

const headerTabs = computed(() => {
  const base = `/workflow/${workflowId.value}`
  return {
    Agent: `${base}/agent`,
    Schedule: `${base}/schedule`,
    Artifacts: `${base}/artifacts`,
  } satisfies Record<string, string>
})

const sessionId = computed(() => route.params.id as string)

const { sessions, fetchSessions, renameSession, fetchMessages, deleteSessionIfEmpty } = useChatSessions()

const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'
const workflowTitle = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return s?.title || `Session ${sessionId.value}`
})

const isNewWorkflow = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return !s || s.title === 'New Workflow'
})

if (sessions.value.length === 0) {
  fetchSessions()
}

async function onRename(title: string) {
  await renameSession(sessionId.value, title)
}

const USER_NAME = 'Carlvince'
const welcomeSuggestion = 'Show me something cool'

const presetPrompt = pickRandomPresetPrompt()

const session = useSession(sessionId)
const chats = useAgentChats(session, sessionId.value)
const vp = useViewports(session)
const screencast = useScreencast(session)
const geo = useGeolocation()
const toast = useAppToast()

session.on<ErrorPayload>('error', (p) => {
  if (p.code === 'AGENT_LIMIT_REACHED') {
    toast.show(
      `Browser agent limit reached for your plan. Upgrade for more.`,
      'warning',
      8000,
    )
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

onMounted(async () => {
  // Per-tab memory so `/workflow` (no id) restores this workflow on re-entry within the tab.
  sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, sessionId.value)

  const orchestratorHistory = await fetchMessages(sessionId.value)
  chats.orchestrator.loadHistory(orchestratorHistory)

  for (const v of vp.viewports.value) {
    const agentHistory = await fetchMessages(sessionId.value, v.agentId)
    if (agentHistory.length > 0) {
      chats.get(v.agentId).loadHistory(agentHistory)
    }
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
  const orchestratorHistory = await fetchMessages(sessionId.value)
  chats.orchestrator.loadHistory(orchestratorHistory)

  for (const v of vp.viewports.value) {
    const agentHistory = await fetchMessages(sessionId.value, v.agentId)
    if (agentHistory.length > 0) {
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
    if (agentHistory.length > 0) {
      chats.get(v.agentId).loadHistory(agentHistory)
    }
  }
})

onUnmounted(() => screencast.cleanup())

const titleRequested = ref(false)

watch(chats.summarisedTitle, (title) => {
  if (title) onRename(title)
})

const welcome = computed(() => chats.orchestrator.messages.value.length === 0)

const viewportList = computed({
  get: () => vp.viewports.value as ViewportState[],
  set: () => {},
})
const browserMode = computed(() => vp.browserMode.value)

provide('chat-session-id', sessionId)
provide('chat-chats', chats)
provide('chat-vp', vp)
provide('chat-screencast', screencast)
provide('chat-session', session)
provide('chat-title', workflowTitle)
provide('chat-is-new', isNewWorkflow)
provide('chat-welcome', welcome)
provide('chat-viewport-list', viewportList)
provide('chat-browser-mode', browserMode)
provide('chat-user-name', USER_NAME)
provide('chat-welcome-suggestion', welcomeSuggestion)
provide('chat-preset-prompt', presetPrompt)
provide('chat-title-requested', titleRequested)
provide('chat-on-rename', onRename)
provide('chat-on-promote-viewport', (agentId: string) => vp.promoteViewport(agentId))
provide('chat-on-demote-active', () => vp.demoteActive())
provide('chat-on-close-viewport', (agentId: string) => { vp.closeViewport(agentId); chats.drop(agentId) })
provide('chat-on-spawn-browser-agent', () => vp.spawnBrowserAgent())
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <NuxtPage
        :key="route.fullPath"
        class="min-h-0 min-w-0 flex-1"
      />
    </div>
  </div>
</template>
