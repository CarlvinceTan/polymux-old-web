<script setup lang="ts">
import { ref } from 'vue'
import type { FileAttachmentState } from '~/composables/chat/useAttachments'
import type { ChatMessageAttachment } from '~/composables/types'
import { getMicPermissionState, requestMicAccess, useSpeechRecognition } from '~/composables/device/useSpeechRecognition'
import { useAppToast } from '~/composables/ui/useAppToast'

const { t, locale } = useI18n()
const toast = useAppToast()
const { isExtensionModeGloballyAllowed } = useMeFeatures()
const { settings: userSettings } = useUserSettings()

const props = withDefaults(
  defineProps<{
    hint?: string
    modelValue?: string
    attachments?: FileAttachmentState[]
    disabled?: boolean
    browserMode?: 'server' | 'extension'
    /** Orchestrator and/or browser agents are actively working. */
    agentsActive?: boolean
  }>(),
  {
    hint: undefined,
    modelValue: '',
    attachments: () => [],
    disabled: false,
    browserMode: 'server',
    agentsActive: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:browserMode': [value: 'server' | 'extension']
  /** Fired with the editor's plain text and the ordered, position-tagged
   *  attachments. The parent forwards both to the chat layer. */
  send: [value: string, attachments: ChatMessageAttachment[]]
  pause: []
  'attach-files': [files: FileList]
  'remove-file': [id: string]
}>()

const browserModeProxy = computed({
  get: () => props.browserMode,
  set: (v) => emit('update:browserMode', v),
})

const inputValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const localeToBcp47: Record<string, string> = {
  en: 'en-US', ko: 'ko-KR', zh: 'zh-CN', ja: 'ja-JP',
  de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT',
}

let voiceBase = ''
let voiceFinal = ''

const { isSupported: voiceSupported, isListening, toggle: toggleVoice } = useSpeechRecognition({
  lang: computed(() => localeToBcp47[locale.value] ?? locale.value),
  silenceTimeoutSeconds: computed(() => userSettings.value.voice_auto_shutoff_seconds),
  onFinal: (text) => {
    voiceFinal += text
    inputValue.value = voiceBase + voiceFinal
  },
  onInterim: (text) => {
    inputValue.value = voiceBase + voiceFinal + text
  },
  onEnd: () => {
    voiceBase = inputValue.value
    voiceFinal = ''
  },
  onError: (code) => {
    if (code === 'aborted' || code === 'no-speech') return
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      toast.show(t('chat.voicePermissionBlocked'), 'warning')
      return
    }
    toast.show(t('chat.voiceError'), 'error')
  },
})

const resolvedHint = computed(() => {
  locale.value
  if (isListening.value) return t('chat.voiceListening')
  return props.hint ?? t('chat.globalCommandPlaceholder')
})

async function onVoiceClick() {
  if (!voiceSupported.value) {
    toast.show(t('chat.voiceUnsupported'), 'warning')
    return
  }
  if (!isListening.value) {
    if (await getMicPermissionState() === 'denied') {
      const granted = await requestMicAccess()
      if (!granted) {
        toast.show(t('chat.voicePermissionBlocked'), 'warning')
        return
      }
    }
    const cur = String(inputValue.value ?? '')
    voiceBase = cur && !cur.endsWith(' ') ? cur + ' ' : cur
    voiceFinal = ''
  }
  toggleVoice()
}

const editorRef = ref<InstanceType<typeof import('./InlineChipEditor.vue').default> | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const expandedPrompt = ref(false)

const hasDraftText = computed(() => String(props.modelValue ?? '').length > 0)
const hasContent = computed(() => hasDraftText.value || (props.attachments?.length ?? 0) > 0)
const showPauseButton = computed(() => props.agentsActive && !hasContent.value)

function onSubmit(text: string, attachments: ChatMessageAttachment[]) {
  emit('send', text, attachments)
}

function onSendClick() {
  editorRef.value?.submit?.()
}

function onPrimaryClick() {
  if (showPauseButton.value) {
    emit('pause')
    return
  }
  onSendClick()
}

function onAttachClick() {
  // Remember where the caret was before opening the file picker so the chip
  // lands inline when the user returns. Without this, focusing the file
  // dialog would have moved focus away and the saved range is lost.
  editorRef.value?.rememberSelection?.()
  fileInputRef.value?.click()
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  // FileList is live: clearing input.value below empties it before async
  // consumers (addFiles awaits fetchUploadConfig before iterating) get to
  // read it. Snapshot into a DataTransfer-owned FileList so the emitted
  // reference stays valid after the reset.
  const dt = new DataTransfer()
  for (const f of input.files) dt.items.add(f)
  emit('attach-files', dt.files)
  input.value = ''
}
</script>

<template>
  <div class="flex w-full flex-col items-stretch gap-3.5 pt-1.5">

    <!-- Hidden native file input -->
    <input
      ref="fileInputRef"
      name="prompt-attachments"
      type="file"
      multiple
      class="absolute h-0 w-0 overflow-hidden opacity-0"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileInputChange"
    >

    <div
      class="prompt-shell relative flex w-full min-h-13 rounded-2xl bg-[#e8e8e8] p-2 transition-[background-color] duration-150"
      :class="[
        expandedPrompt ? 'items-start' : 'items-center',
        hasContent && 'prompt-shell--raised',
      ]"
    >
      <div class="flex flex-col items-center min-w-0 flex-1 pl-1 sm:pl-2 pr-12.25">
        <InlineChipEditor
          ref="editorRef"
          v-model="inputValue"
          :attachments="props.attachments"
          :placeholder="resolvedHint"
          :disabled="props.disabled"
          :max-lines="4"
          class="w-full"
          @submit="onSubmit"
          @remove-attachment="(id) => emit('remove-file', id)"
          @update:expanded="(v) => expandedPrompt = v"
        />
      </div>
      <button
        type="button"
        data-testid="workflow-send-button"
        class="absolute right-2 flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-on-primary transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="expandedPrompt ? 'bottom-2' : 'top-1/2 -translate-y-1/2'"
        :disabled="props.disabled"
        :aria-label="showPauseButton ? t('workflow.stop') : t('common.send')"
        @click="onPrimaryClick"
      >
        <svg
          v-if="showPauseButton"
          class="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="7" y="7" width="10" height="10" rx="1.75" />
        </svg>
        <svg
          v-else
          class="size-4.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div class="flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-2 text-caption font-semibold tracking-overline text-secondary">
      <button type="button" class="inline-flex items-center gap-1 transition-opacity hover:opacity-70" @click="onAttachClick">
        <UIcon name="i-heroicons-paper-clip-20-solid" class="shrink-0 size-3.5" />
        <span>{{ t('common.attach').toUpperCase() }}</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
        :class="isListening ? 'text-red-500' : ''"
        :aria-pressed="isListening"
        :aria-label="isListening ? t('chat.voiceListening') : t('common.voice')"
        @click="onVoiceClick"
      >
        <span class="relative inline-flex shrink-0 items-center justify-center size-3.5">
          <span v-if="isListening" class="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />
          <UIcon name="i-heroicons-microphone-20-solid" class="relative shrink-0 size-3.5" />
        </span>
        <span>{{ (isListening ? t('chat.voiceListening') : t('common.voice')).toUpperCase() }}</span>
      </button>
      <BrowserModeMenu
        v-model="browserModeProxy"
        :feature-enabled="isExtensionModeGloballyAllowed()"
      />
    </div>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.prompt-shell:focus-within,
.prompt-shell.prompt-shell--raised {
  @apply bg-neutral-50 outline outline-neutral-300/80 ring-1 ring-neutral-200/90;
}
</style>
