<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Placeholder / hint shown in the input */
    hint?: string
    /** When true, the primary action shows pause until dismissed */
    agentActive?: boolean
    modelValue?: string
    /** Span full width of parent (no max-width cap) */
    fullWidth?: boolean
  }>(),
  {
    hint: 'Issue a global command...',
    agentActive: false,
    modelValue: '',
    fullWidth: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [value: string]
  pause: []
  attach: []
  voice: []
  'global-settings': []
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const pauseDismissed = ref(false)

watch(
  () => props.agentActive,
  (active) => {
    if (!active) pauseDismissed.value = false
  },
)

const showPause = computed(() => props.agentActive && !pauseDismissed.value)

const textareaRef = ref<HTMLTextAreaElement | null>(null)

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

function onPrimaryAction() {
  if (showPause.value) {
    pauseDismissed.value = true
    emit('pause')
    return
  }
  emit('send', inputValue.value)
}

function onTextareaKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing) return
  e.preventDefault()
  onPrimaryAction()
}
</script>

<template>
  <div class="flex w-full flex-col px-1.5 pt-1.5 sm:px-2"
    :class="props.fullWidth ? 'items-stretch gap-3' : 'items-center gap-4'">
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
        <textarea ref="textareaRef" v-model="inputValue" rows="1"
          class="scrollbar-hide min-h-0 w-full resize-none overflow-y-auto bg-transparent py-0 leading-normal text-on-surface placeholder:text-secondary focus:outline-none"
          :class="props.fullWidth
            ? 'text-body-md max-h-20'
            : 'min-w-0 flex-1 text-body-lg max-h-24'
            " :placeholder="props.hint" autocomplete="off" @keydown="onTextareaKeydown" />
      </div>
      <button type="button"
        class="flex shrink-0 items-center justify-center text-on-primary transition-opacity hover:opacity-90 active:opacity-80"
        :class="props.fullWidth
          ? [
            'absolute right-2 size-9 rounded-lg bg-neutral-950',
            expandedPrompt ? 'bottom-2' : 'top-1/2 -translate-y-1/2',
          ]
          : 'btn-gradient size-10 rounded-[0.375rem]'
          " :aria-label="showPause ? 'Pause' : 'Send'" @click="onPrimaryAction">
        <svg v-if="!showPause" class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="none"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
        <svg v-else class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true">
          <rect x="6" y="5" width="3.5" height="14" rx="0.5" />
          <rect x="14.5" y="5" width="3.5" height="14" rx="0.5" />
        </svg>
      </button>
    </div>

    <div class="flex w-full flex-wrap items-center justify-center gap-y-2 text-secondary" :class="props.fullWidth
      ? 'gap-x-8 text-caption font-semibold tracking-overline text-neutral-400'
      : 'gap-x-14 text-label-md font-medium tracking-wide max-w-3xl'
      ">
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('attach')">
        <UIcon name="i-heroicons-paper-clip-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'ATTACH' : 'Attach' }}</span>
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('voice')">
        <UIcon name="i-heroicons-microphone-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'VOICE' : 'Voice' }}</span>
      </button>
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('global-settings')">
        <UIcon name="i-heroicons-adjustments-vertical-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'SETTINGS' : 'Settings' }}</span>
      </button>
    </div>
  </div>
</template>
