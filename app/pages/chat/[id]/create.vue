<script setup lang="ts">
import type { ChatMessage, ChatViewportConfig } from '~/components/ChatLayout.vue'

const route = useRoute()
const chatTitle = computed(() => {
  const id = route.params.id as string
  return (route.query.name as string) || `Chat ${id}`
})

const USER_NAME = 'Carlvince'

const welcomeSuggestion = 'Show me something cool'

const messages = ref<ChatMessage[]>([])
const command = ref('')
const browserMode = ref(false)
const viewportList = ref<ChatViewportConfig[]>([])

const welcome = computed(() => messages.value.length === 0)

function ensureBrowserViewports() {
  if (viewportList.value.length) return
  viewportList.value = [
    {
      url: 'lichess.org',
      agentName: 'BROWSER 01',
      currentAction: 'READY — LICHESS',
      isLoading: false,
      isWorking: false,
      isDone: true,
    },
    {
      url: 'booking.com/search?region=bali',
      agentName: 'BROWSER 02',
      currentAction: 'LOADING LISTINGS…',
      isLoading: true,
      isWorking: true,
      isDone: false,
    },
    {
      url: 'maps.google.com/?malaysia-hotels',
      agentName: 'BROWSER 03',
      currentAction: 'MAP IDLE',
      isLoading: true,
      isWorking: false,
      isDone: false,
    },
    {
      url: 'github.com/explore',
      agentName: 'BROWSER 04',
      currentAction: 'SCROLLING FEED',
      isLoading: false,
      isWorking: true,
      isDone: false,
    },
    {
      url: 'news.ycombinator.com',
      agentName: 'BROWSER 05',
      currentAction: 'READY',
      isLoading: false,
      isWorking: false,
      isDone: true,
    },
    {
      url: 'flights.google.com',
      agentName: 'BROWSER 06',
      currentAction: 'SEARCH RUNNING…',
      isLoading: true,
      isWorking: true,
      isDone: false,
    },
    {
      url: 'openstreetmap.org',
      agentName: 'BROWSER 07',
      currentAction: 'TILES LOADED',
      isLoading: false,
      isWorking: false,
      isDone: true,
    },
    {
      url: 'docs.python.org/3/',
      agentName: 'BROWSER 08',
      currentAction: 'DOC IDLE',
      isLoading: false,
      isWorking: false,
      isDone: false,
    },
  ]
}

function useExample(text: string) {
  messages.value.push({ role: 'user', text })
  messages.value.push({
    role: 'agent',
    text: 'Placeholder reply — connect the agent runtime to stream real responses.',
  })
}

function onSend(value: string) {
  const t = value.trim()
  if (!t) return
  command.value = ''

  const useBrowser = t.toLowerCase() === 'use browser'

  messages.value.push({ role: 'user', text: t })

  if (useBrowser) {
    ensureBrowserViewports()
    browserMode.value = true
    messages.value.push({
      role: 'agent',
      text:
        'Browser layout is on. The main viewport uses the left; smaller ones sit in a row below — click any thumbnail to swap it to the top.',
    })
    return
  }

  if (messages.value.length === 1) {
    messages.value.push({
      role: 'agent',
      text: 'Placeholder reply — connect the agent runtime to stream real responses.',
    })
  }
}
</script>

<template>
  <ChatLayout
    v-model:command="command"
    v-model:browser-mode="browserMode"
    v-model:viewport-list="viewportList"
    :welcome="welcome"
    :chat-title="chatTitle"
    :user-name="USER_NAME"
    :welcome-suggestion="welcomeSuggestion"
    :messages="messages"
    @welcome-suggestion="useExample(welcomeSuggestion)"
    @send="onSend"
  />
</template>
