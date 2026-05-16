<script setup lang="ts">
import { ref } from 'vue'
import type { FileAttachmentState } from '~/composables/chat/useAttachments'
import { getMicPermissionState, requestMicAccess, useSpeechRecognition } from '~/composables/device/useSpeechRecognition'
import { useAppToast } from '~/composables/ui/useAppToast'
import { useAutoResizeTextarea } from '~/composables/ui/useAutoResizeTextarea'

const { t, locale } = useI18n()
const toast = useAppToast()
const { isExtensionModeGloballyAllowed } = useMeFeatures()

const props = withDefaults(
  defineProps<{
    hint?: string
    modelValue?: string
    attachments?: FileAttachmentState[]
    disabled?: boolean
    browserMode?: 'server' | 'extension'
  }>(),
  {
    hint: undefined,
    modelValue: '',
    attachments: () => [],
    disabled: false,
    browserMode: 'server',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:browserMode': [value: 'server' | 'extension']
  send: [value: string]
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

// Don't auto-flip extension → server when the global flag is off: the user
// still sees the settings menu (just disabled) so silently rewriting their
// selection would mask the explanation BrowserModeMenu surfaces in the
// disabled state. Backwards: the existing workflow row may have
// `last_browser_mode=extension` from before the flag was toggled off; the
// server still routes those to 'server' on the wire, so leaving the local
// ref alone is just cosmetic.

const localeToBcp47: Record<string, string> = {
  en: 'en-US', ko: 'ko-KR', zh: 'zh-CN', ja: 'ja-JP',
  de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT',
}

let voiceBase = ''
let voiceFinal = ''

const { isSupported: voiceSupported, isListening, toggle: toggleVoice } = useSpeechRecognition({
  lang: computed(() => localeToBcp47[locale.value] ?? locale.value),
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

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const { expanded: expandedPrompt } = useAutoResizeTextarea(textareaRef, inputValue, { maxLines: 4 })

const hasDraftText = computed(() => String(props.modelValue ?? '').length > 0)

function onSendClick() {
  emit('send', inputValue.value)
}

function onTextareaKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing) return
  e.preventDefault()
  onSendClick()
}

function onAttachClick() {
  fileInputRef.value?.click()
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  emit('attach-files', input.files)
  input.value = ''
}

</script>

<template>
  <div
    class="flex w-full flex-col items-stretch gap-3.5"
    :class="attachments && attachments.length > 0 ? 'pt-0' : 'pt-1.5'"
  >

    <!-- Hidden native file input (absolute so it doesn't participate in flex gap) -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="absolute h-0 w-0 overflow-hidden opacity-0"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileInputChange"
    >

    <!-- Attachment chips above the input box -->
    <TransitionGroup
      v-if="attachments && attachments.length > 0"
      tag="div"
      name="chip"
      appear
      class="relative flex w-full flex-wrap-reverse gap-1.5"
    >
      <FileAttachment
        v-for="file in attachments"
        :key="file.id"
        :name="file.name"
        :status="file.status"
        :progress="file.progress"
        half-row
        @remove="emit('remove-file', file.id)"
      />
    </TransitionGroup>

    <div
      class="prompt-shell relative flex w-full min-h-13 rounded-2xl bg-[#e8e8e8] p-2 transition-[background-color] duration-150"
      :class="[
        expandedPrompt ? 'items-start' : 'items-center',
        hasDraftText && 'prompt-shell--raised',
      ]"
    >
      <div class="flex flex-col items-center min-w-0 flex-1 pl-1 sm:pl-2 pr-12.25">
        <textarea
          ref="textareaRef"
          v-model="inputValue"
          rows="1"
          name="prompt"
          :disabled="props.disabled"
          class="scrollbar-hide min-h-0 w-full resize-none overflow-y-auto bg-transparent py-0 leading-normal text-on-surface placeholder:text-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 text-body-md max-h-20"
          :placeholder="resolvedHint"
          autocomplete="off"
          @keydown="onTextareaKeydown"
        />
      </div>
      <button
        type="button"
        class="absolute right-2 flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-on-primary transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="expandedPrompt ? 'bottom-2' : 'top-1/2 -translate-y-1/2'"
        :disabled="props.disabled"
        :aria-label="t('common.send')"
        @click="onSendClick"
      >
        <svg class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

.chip-move,
.chip-enter-active,
.chip-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.chip-leave-active {
  position: absolute;
}
</style>
