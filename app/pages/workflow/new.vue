<script setup lang="ts">
import type { ChatMessage, ChatMessageAttachment, ViewportState } from '~/composables/types'

const { t } = useI18n()
const route = useRoute()
const { draft, createDraft, markDraftCommitted, setPendingPrompt } = useWorkflowList()

const TAB_LAST_WORKFLOW_KEY = 'polymux_tab_last_workflow'
const BROWSER_MODE_KEY_PREFIX = 'polymux_workflow_browsermode:'

type BrowserMode = 'server' | 'extension'
function isBrowserMode(v: unknown): v is BrowserMode {
  return v === 'server' || v === 'extension'
}
const browserMode = ref<BrowserMode>('server')

onMounted(async () => {
  if (!draft.value) await createDraft()
  sessionStorage.setItem(TAB_LAST_WORKFLOW_KEY, 'new')
  const id = draft.value?.id
  if (id) {
    try {
      const raw = sessionStorage.getItem(BROWSER_MODE_KEY_PREFIX + id)
      browserMode.value = isBrowserMode(raw) ? raw : 'server'
    } catch {
      browserMode.value = 'server'
    }
  }
})

watch(browserMode, (mode) => {
  if (!import.meta.client) return
  const id = draft.value?.id
  if (!id) return
  try {
    sessionStorage.setItem(BROWSER_MODE_KEY_PREFIX + id, mode)
  } catch {}
})

// Single agent tab, self-referential so the header matches the style on
// real workflow pages without advertising tabs that can't work yet.
const headerTabs = computed(() => ({ [t('workflow.tabs.agent')]: route.path }))

const command = ref('')
const viewportList = ref<ViewportState[]>([])
const emptyMessages: ChatMessage[] = []

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

const { currentWorkspaceId, currentWorkspace } = useWorkspaces()
const guardWorkspaceId = computed(() => currentWorkspaceId.value ?? '')
const guardWorkspacePlan = computed(() => currentWorkspace.value?.plan ?? null)
const { canSendPrompt } = useChatPromptSendGuard(guardWorkspaceId, guardWorkspacePlan)
const { $posthog } = useNuxtApp()

async function beforeSendPrompt(text: string, _attachments: ChatMessageAttachment[]) {
  const t = text.trim()
  if (!t) return false
  return canSendPrompt(t)
}

async function onWelcomeSuggestion() {
  if (!(await canSendPrompt(presetPrompt.trim()))) return
  await onSend(presetPrompt, [])
}
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
    $posthog?.capture('workflow_submitted', {
      workspace_id: currentWorkspaceId.value,
      has_attachments: attachments.length > 0,
    })
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
        v-model:browser-mode="browserMode"
        :welcome="true"
        :chat-title="'New Workflow'"
        :user-name="userName"
        :welcome-suggestion="welcomeSuggestion"
        :messages="emptyMessages"
        :session-id="sessionId"
        :workspace-id="currentWorkspaceId"
        :renameable="false"
        hide-view-switch
        hide-title
        :before-send-prompt="beforeSendPrompt"
        @welcome-suggestion="onWelcomeSuggestion"
        @send="onSend"
      />
    </div>
  </div>
</template>
