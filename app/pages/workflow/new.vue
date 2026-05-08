<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState } from '~/composables/types'

const route = useRoute()
const { draft, createDraft, markDraftCommitted, setPendingPrompt, restoreDraft } = useWorkflowList()

const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'

onMounted(async () => {
  restoreDraft()
  if (!draft.value) await createDraft()
  sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, 'new')
})

// Single agent tab, self-referential so the header matches the style on
// real workflow pages without advertising tabs that can't work yet.
const headerTabs = computed(() => ({ Agent: route.path }))

const command = ref('')
const viewportList = ref<ViewportState[]>([])
const emptyMessages: ChatMessage[] = []

// Backend allocates the draft uuid and returns it from POST /draft-sessions.
// File uploads in <ChatLayout> POST to /sessions/{this id}/files; the server
// accepts those for draft ids via the relaxed validation path. The agent
// sandbox dir at {tempdir}/polymux/{this id}/uploads/ is reused once the
// draft commits on the first user_message.
const sessionId = computed(() => draft.value?.id ?? '')

const isSending = ref(false)

async function onSend(value: string, attachments: ChatMessageAttachment[]) {
  const text = value.trim()
  if (!text || isSending.value) return
  if (!draft.value) return
  isSending.value = true
  try {
    const id = draft.value.id
    setPendingPrompt(id, { text, attachments })
    // Optimistically move the draft into the real-sessions list. The backend
    // commits the workflows row synchronously inside handleUserMessage on the
    // agent page's WS, so by the time fetchSessions next fires the row is in
    // the DB. If the commit fails the agent page surfaces the WS error and
    // the user can retry.
    markDraftCommitted()
    command.value = ''
    await navigateTo(`/workflow/${id}/agent`)
  } finally {
    isSending.value = false
  }
}

const USER_NAME = 'Carlvince'
const welcomeSuggestion = 'Show me something cool'
const presetPrompt = pickRandomPresetPrompt()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <ChatLayout
        v-model:command="command"
        v-model:viewport-list="viewportList"
        :welcome="true"
        :chat-title="'New Workflow'"
        :user-name="USER_NAME"
        :welcome-suggestion="welcomeSuggestion"
        :messages="emptyMessages"
        :session-id="sessionId"
        :active-agent-id="null"
        :browser-mode="false"
        :renameable="false"
        hide-view-switch
        hide-title
        @welcome-suggestion="onSend(presetPrompt, [])"
        @send="onSend"
      />
    </div>
  </div>
</template>
