<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState, UserLocationPayload, ErrorPayload } from '~/composables/types'

const route = useRoute()
const chatId = computed(() => route.params.id as string)

const headerTabs = computed(() => {
  const base = `/chat/${chatId.value}`
  return {
    Orchestrator: `${base}/orchestrator`,
    Browser: `${base}/browser`,
    Artifacts: `${base}/artifacts`,
  } satisfies Record<string, string>
})

const sessionId = computed(() => route.params.id as string)

const { sessions, fetchSessions, renameSession, fetchMessages } = useChatSessions()
const chatTitle = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return s?.title || `Session ${sessionId.value}`
})

const isNewChat = computed(() => {
  const s = sessions.value.find(s => s.id === sessionId.value)
  return !s || s.title === 'New Chat'
})

if (sessions.value.length === 0) {
  fetchSessions()
}

async function onRename(title: string) {
  await renameSession(sessionId.value, title)
}

const USER_NAME = 'Carlvince'
const welcomeSuggestion = 'Show me something cool'

const PRESET_PROMPTS = [
  'Play a game of chess on lichess.org — don\'t stop until you win!',
  'Find me the most expensive hotel in Bali on Trip.com and the cheapest hotel in Dubai on Booking.com',
  'Go to Google Flights and find the cheapest round-trip from New York to Tokyo next month',
  'Go to Hacker News, find the #1 story, read the comments, and give me a summary',
  'Compare the price of the latest MacBook Pro on Amazon vs Best Buy',
  'Find the top trending GitHub repositories today and tell me what\'s hot in open source',
  'Look up the weather in Tokyo, London, and New York — tell me which city is nicest right now',
  'Go to Product Hunt, find today\'s #1 product, visit their site, and explain what they do',
  'Find the most viewed YouTube video uploaded in the last 24 hours',
  'Search for the top-rated Airbnb in Santorini with a sea view',
  'Check the latest tech news on TechCrunch and summarize the top 3 stories, find the #1 story on Hacker News and explain why it matters to developers',
  'Go to Wikipedia, hit Random Article 5 times, and connect them into a short story',
]

const presetPrompt = PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)]!

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

function sendLocationUpdate() {
  if (!geo.enabled.value || !geo.coords.value) return
  const { latitude, longitude, accuracy } = geo.coords.value
  session.send<UserLocationPayload>('user_location', {
    latitude,
    longitude,
    accuracy,
  })
}

watch(session.status, (status) => {
  if (status === 'connected') {
    sendLocationUpdate()
  }
})

watch(geo.coords, () => {
  if (session.status.value === 'connected') {
    sendLocationUpdate()
  }
})

onMounted(async () => {
  const orchestratorHistory = await fetchMessages(sessionId.value)
  chats.orchestrator.loadHistory(orchestratorHistory)

  for (const v of vp.viewports.value) {
    const agentHistory = await fetchMessages(sessionId.value, v.agentId)
    if (agentHistory.length > 0) {
      chats.get(v.agentId).loadHistory(agentHistory)
    }
  }
})

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
provide('chat-title', chatTitle)
provide('chat-is-new', isNewChat)
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
