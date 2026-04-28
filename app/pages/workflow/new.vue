<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState } from '~/composables/types'

const route = useRoute()
const { draft, createDraft, promoteDraft, setPendingPrompt, restoreDraft } = useWorkflowList()

const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'

onMounted(() => {
  restoreDraft()
  if (!draft.value) createDraft()
  sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, 'new')
})

// Single console tab, self-referential so the header matches the style on
// real workflow pages without advertising tabs that can't work yet.
const headerTabs = computed(() => ({ Console: route.path }))

const command = ref('')
const viewportList = ref<ViewportState[]>([])
const emptyMessages: ChatMessage[] = []

const isPromoting = ref(false)

async function onSend(value: string, attachments: ChatMessageAttachment[]) {
  const text = value.trim()
  if (!text || isPromoting.value) return
  isPromoting.value = true
  try {
    const real = await promoteDraft()
    if (!real) return
    setPendingPrompt(real.id, { text, attachments })
    command.value = ''
    await navigateTo(`/workflow/${real.id}/agent`)
  } finally {
    isPromoting.value = false
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
        :session-id="'new'"
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
