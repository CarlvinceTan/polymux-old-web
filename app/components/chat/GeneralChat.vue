<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ChatMessageAttachment } from '~/composables/types'

// The in-built general chat (Vercel AI SDK). One Chat instance per chat id —
// the page keys this component on chatId so a new chat gets a fresh instance.
// Streams from /api/chat/agent and hydrates durable turns from
// /api/chat/:id/messages so refreshes and sidebar navigation behave like a real
// chat thread.
const props = defineProps<{ chatId: string }>()

const { t } = useI18n()
const { fetchChats } = useWorkspaceChatList()

// First name for the personalised welcome greeting.
const supabaseUser = useSupabaseUser()
const userName = computed(() => {
  const meta = supabaseUser.value?.user_metadata
  const full = (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || supabaseUser.value?.email?.split('@')[0]
    || ''
  return full.trim().split(/\s+/)[0] || ''
})

const chat = new Chat<UIMessage>({
  id: props.chatId,
  messages: [],
  generateId: () => crypto.randomUUID(),
  onFinish: () => { void fetchChats() },
  transport: new DefaultChatTransport({
    api: '/api/chat/agent',
    body: () => ({ chatId: props.chatId }),
  }),
})

const input = ref('')
const loadingHistory = ref(true)
const historyError = ref('')
const isBusy = computed(() => chat.status === 'submitted' || chat.status === 'streaming')
const isEmpty = computed(() => !loadingHistory.value && chat.messages.length === 0)

onMounted(async () => {
  loadingHistory.value = true
  historyError.value = ''
  try {
    chat.messages = await $fetch<UIMessage[]>(`/api/chat/${props.chatId}/messages`)
  }
  catch {
    historyError.value = t('chat.loadHistoryError')
  }
  finally {
    loadingHistory.value = false
  }
})

// A UIMessage carries ordered `parts`; render the text parts joined.
function textOf(message: { parts?: Array<{ type: string; text?: string }> }): string {
  return (message.parts ?? [])
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

// PromptInput emits (text, attachments); this surface is text-only for now.
function onPromptSend(value: string, _attachments: ChatMessageAttachment[]) {
  const text = value.trim()
  if (!text || isBusy.value) return
  input.value = ''
  void chat.sendMessage({ text })
}

function onPause() {
  void chat.stop()
}

// Suggestion cards prefill the composer with a ready-to-send prompt (the same
// "prefill a prompt" affordance as the welcome chip) so the user can review or
// extend it before sending.
function onSuggestionSelect(prompt: string) {
  input.value = prompt
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- Empty state: centred greeting + composer + suggestion grid as one block. -->
    <div v-if="loadingHistory" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 px-4 py-10">
        <div class="h-4 w-2/5 animate-pulse rounded bg-neutral-200" />
        <div class="h-4 w-3/5 animate-pulse rounded bg-neutral-200" />
        <div class="h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
      </div>
    </div>

    <div v-else-if="isEmpty" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-10">
        <GeneralChatWelcome :user-name="userName" @select="onSuggestionSelect">
          <PromptInput
            v-model="input"
            :hint="t('chat.messagePlaceholder')"
            :agents-active="isBusy"
            options-context="console"
            @send="onPromptSend"
            @pause="onPause"
          />
        </GeneralChatWelcome>
        <p v-if="historyError" class="mt-3 text-center text-[11px] text-red-500">
          {{ historyError }}
        </p>
      </div>
    </div>

    <!-- Conversation + bottom composer. -->
    <template v-else>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-3xl px-4 py-6">
          <div class="flex flex-col gap-4">
            <div
              v-for="m in chat.messages"
              :key="m.id"
              class="flex"
              :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-body-md"
                :class="m.role === 'user' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'"
              >{{ textOf(m) || (isBusy ? '…' : '') }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="shrink-0">
        <div class="mx-auto w-full max-w-3xl px-4 pb-4">
          <PromptInput
            v-model="input"
            :hint="t('chat.messagePlaceholder')"
            :agents-active="isBusy"
            options-context="console"
            @send="onPromptSend"
            @pause="onPause"
          />
        </div>
      </div>
    </template>
  </div>
</template>
