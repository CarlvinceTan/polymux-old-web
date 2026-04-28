<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { FileAttachmentState } from '~/composables/useAttachments'
import { getMicPermissionState, requestMicAccess, useSpeechRecognition } from '~/composables/useSpeechRecognition'
import { useAppToast } from '~/composables/useAppToast'

const { t, locale } = useI18n()
const toast = useAppToast()

const props = withDefaults(
  defineProps<{
    hint?: string
    modelValue?: string
    fullWidth?: boolean
    attachments?: FileAttachmentState[]
    disabled?: boolean
  }>(),
  {
    hint: undefined,
    modelValue: '',
    fullWidth: false,
    attachments: () => [],
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [value: string]
  'attach-files': [files: FileList]
  'remove-file': [id: string]
}>()

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

/** True once content needs more than one visible line (wrap or newline). */
const expandedPrompt = ref(false)

function clampTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  const lh = Number.parseFloat(getComputedStyle(el).lineHeight)
  const linePx = Number.isFinite(lh) ? lh : props.fullWidth ? 20 : 24
  const maxPx = linePx * 4

  const isBlank = !String(inputValue.value ?? '').trim()
  el.style.height = '0px'

  if (isBlank) {
    expandedPrompt.value = false
    el.style.height = `${linePx}px`
    return
  }

  const raw = el.scrollHeight
  expandedPrompt.value = raw > linePx + 2
  const next = Math.min(Math.max(raw, linePx), maxPx)
  el.style.height = `${next}px`
}

watch(inputValue, async () => {
  await nextTick()
  clampTextareaHeight()
})

watch(
  () => props.fullWidth,
  async () => {
    await nextTick()
    clampTextareaHeight()
  },
)

onMounted(async () => {
  await nextTick()
  clampTextareaHeight()
})

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
  <div class="flex w-full flex-col px-1.5 sm:px-2"
    :class="[
      props.fullWidth ? 'items-stretch gap-3.5' : 'items-center gap-5',
      attachments && attachments.length > 0 ? 'pt-0' : 'pt-1.5',
    ]">

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
      :class="props.fullWidth ? '' : 'max-w-3xl'"
    >
      <FileAttachment
        v-for="file in attachments"
        :key="file.id"
        :name="file.name"
        :status="file.status"
        :progress="file.progress"
        :half-row="props.fullWidth"
        @remove="emit('remove-file', file.id)"
      />
    </TransitionGroup>

    <div class="flex w-full transition-colors focus-within:outline" :class="props.fullWidth
      ? [
        'relative min-h-13 rounded-2xl bg-neutral-100 p-2 transition-[background-color] duration-150',
        'focus-within:bg-neutral-50 focus-within:outline focus-within:outline-neutral-300/80 focus-within:ring-1 focus-within:ring-neutral-200/90',
        'has-[textarea:not(:placeholder-shown)]:bg-neutral-50',
        expandedPrompt ? 'items-start' : 'items-center',
      ]
      : [
        'max-w-3xl gap-2 rounded-md bg-surface-container-low py-2.5 pl-6 pr-2.5 transition-[background-color] duration-150',
        'focus-within:bg-neutral-50 focus-within:outline focus-within:outline-outline-variant/15',
        'has-[textarea:not(:placeholder-shown)]:bg-neutral-50',
        expandedPrompt ? 'items-end' : 'items-center',
      ]
      ">
      <div class="flex flex-col items-center min-w-0 flex-1" :class="props.fullWidth ? 'pl-1 sm:pl-2 pr-12.25' : ''">
        <textarea ref="textareaRef" v-model="inputValue" rows="1" name="prompt"
          :disabled="props.disabled"
          class="scrollbar-hide min-h-0 w-full resize-none overflow-y-auto bg-transparent py-0 leading-normal text-on-surface placeholder:text-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          :class="props.fullWidth
            ? 'text-body-md max-h-20'
            : 'min-w-0 flex-1 text-body-lg max-h-24'
            " :placeholder="resolvedHint" autocomplete="off" @keydown="onTextareaKeydown" />
      </div>
      <button type="button"
        class="flex shrink-0 items-center justify-center text-on-primary transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        :class="props.fullWidth
          ? [
            'absolute right-2 size-9 rounded-lg bg-neutral-950',
            expandedPrompt ? 'bottom-2' : 'top-1/2 -translate-y-1/2',
          ]
          : 'btn-gradient size-10 rounded-[0.375rem]'
          " :disabled="props.disabled" :aria-label="t('common.send')" @click="onSendClick">
        <svg class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="none"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div class="flex w-full flex-wrap items-center justify-center gap-y-2 text-secondary" :class="props.fullWidth
      ? 'gap-x-8 text-caption font-semibold tracking-overline text-neutral-400'
      : 'gap-x-14 text-label-md font-medium tracking-wide max-w-3xl'
      ">
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="onAttachClick">
        <UIcon name="i-heroicons-paper-clip-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? t('common.attach').toUpperCase() : t('common.attach') }}</span>
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="[
          props.fullWidth ? 'gap-1' : '',
          isListening ? 'text-red-500' : '',
        ]"
        :aria-pressed="isListening"
        :aria-label="isListening ? t('chat.voiceListening') : t('common.voice')"
        @click="onVoiceClick">
        <span class="relative inline-flex shrink-0 items-center justify-center"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'">
          <span v-if="isListening"
            class="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />
          <UIcon name="i-heroicons-microphone-20-solid" class="relative shrink-0"
            :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        </span>
        <span>{{
          isListening
            ? (props.fullWidth ? t('chat.voiceListening').toUpperCase() : t('chat.voiceListening'))
            : (props.fullWidth ? t('common.voice').toUpperCase() : t('common.voice'))
        }}</span>
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70 whitespace-nowrap"
        :class="props.fullWidth ? 'gap-1' : ''">
        <UIcon name="i-heroicons-adjustments-vertical-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? t('common.settings').toUpperCase() : t('common.settings') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
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
