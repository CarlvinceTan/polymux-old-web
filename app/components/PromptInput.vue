<script setup lang="ts">
// Prompt input component props
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

// Component event emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [value: string]
  pause: []
  attach: []
  voice: []
  'global-settings': []
}>()

// Two-way binding for input value
const inputValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** After pause is pressed, show send again until `agentActive` goes false */
const pauseDismissed = ref(false)

// Reset pause dismissed state when agent becomes inactive
watch(
  () => props.agentActive,
  (active) => {
    if (!active) pauseDismissed.value = false
  },
)

// Show pause button when agent is active and pause hasn't been dismissed
const showPause = computed(() => props.agentActive && !pauseDismissed.value)

// Handle primary action button click (send or pause)
function onPrimaryAction() {
  if (showPause.value) {
    pauseDismissed.value = true
    emit('pause')
    return
  }
  emit('send', inputValue.value)
}
</script>

<template>
  <!-- Main container with gap spacing -->
  <div
    class="flex w-full flex-col px-1.5 pt-1.5 sm:px-2"
    :class="props.fullWidth ? 'items-stretch gap-3' : 'items-center gap-4'"
  >
    <!-- Input field with send/pause button -->
    <div
      class="flex w-full transition-colors focus-within:outline"
      :class="
        props.fullWidth
          ? 'relative min-h-[3.25rem] items-center rounded-2xl bg-neutral-100 p-2 focus-within:bg-white focus-within:outline-neutral-300/80 focus-within:ring-1 focus-within:ring-neutral-200/90'
          : 'max-w-3xl items-center gap-2 rounded-md bg-surface-container-low py-2.5 pl-6 pr-2.5 focus-within:bg-surface-container-lowest focus-within:outline-outline-variant/15'
      "
    >
      <!-- Text input field -->
      <input
        v-model="inputValue"
        type="text"
        class="min-w-0 flex-1 bg-transparent leading-normal text-on-surface placeholder:text-secondary focus:outline-none"
        :class="
          props.fullWidth
            ? 'text-body-md py-0 pl-1 sm:pl-2 pr-[3.25rem]'
            : 'text-body-lg'
        "
        :placeholder="props.hint"
        autocomplete="off"
      />
      <!-- Primary action button (send arrow or pause bars) -->
      <button
        type="button"
        class="flex shrink-0 items-center justify-center text-on-primary transition-opacity hover:opacity-90 active:opacity-80"
        :class="
          props.fullWidth
            ? 'absolute right-2 top-1/2 size-9 -translate-y-1/2 rounded-lg bg-neutral-950'
            : 'btn-gradient size-10 rounded-[0.375rem]'
        "
        :aria-label="showPause ? 'Pause' : 'Send'"
        @click="onPrimaryAction"
      >
        <!-- Send icon: thin NE arrow -->
        <svg v-if="!showPause" class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="none"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
        <!-- Pause icon: two vertical bars -->
        <svg v-else class="size-4.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true">
          <rect x="6" y="5" width="3.5" height="14" rx="0.5" />
          <rect x="14.5" y="5" width="3.5" height="14" rx="0.5" />
        </svg>
      </button>
    </div>

    <!-- Action buttons row: Attach, Voice, Settings -->
    <div
      class="flex w-full flex-wrap items-center justify-center gap-y-2 text-secondary"
      :class="
        props.fullWidth
          ? 'gap-x-8 text-caption font-semibold tracking-overline text-neutral-400'
          : 'gap-x-14 text-label-md font-medium tracking-wide max-w-3xl'
      "
    >
      <!-- Attach button -->
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('attach')">
        <UIcon name="i-heroicons-paper-clip-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'ATTACH' : 'Attach' }}</span>
      </button>
      <!-- Voice input button -->
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('voice')">
        <UIcon name="i-heroicons-microphone-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'VOICE' : 'Voice' }}</span>
      </button>
      <!-- Settings button -->
      <button type="button" class="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
        :class="props.fullWidth ? 'gap-1' : ''" @click="emit('global-settings')">
        <UIcon name="i-heroicons-adjustments-vertical-20-solid" class="shrink-0"
          :class="props.fullWidth ? 'size-3.5' : 'size-4'" />
        <span>{{ props.fullWidth ? 'SETTINGS' : 'Settings' }}</span>
      </button>
    </div>
  </div>
</template>
