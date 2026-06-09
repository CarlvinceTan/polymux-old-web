<script setup lang="ts">
import { useI18n } from '#imports'
import { totpFromSetupKey } from '~/composables/vault/totp'

// Reveals the stored authenticator setup key for a credential and renders the
// current rotating code with a countdown ring — i.e. the vault acting as a TOTP
// authenticator. The setup key is fetched once; codes are computed locally.
const props = defineProps<{ passwordId: string }>()

const { t } = useI18n()
const { revealTotpSecret } = usePasswords()
const { copy } = useClipboard()

const code = ref<string | null>(null)
const secondsRemaining = ref(0)
const period = ref(30)
const loading = ref(true)
const errored = ref(false)
const copied = ref(false)

let setupKey: string | null = null
let timer: ReturnType<typeof setInterval> | null = null
let copyTimer: ReturnType<typeof setTimeout> | null = null

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function tick() {
  if (!setupKey) return
  try {
    const res = await totpFromSetupKey(setupKey)
    code.value = res.code
    secondsRemaining.value = res.secondsRemaining
    period.value = res.period
  }
  catch {
    errored.value = true
    stopTimer()
  }
}

async function load() {
  loading.value = true
  errored.value = false
  setupKey = await revealTotpSecret(props.passwordId)
  loading.value = false
  if (!setupKey) {
    errored.value = true
    return
  }
  await tick()
  timer = setInterval(tick, 1000)
}

const formattedCode = computed(() => {
  const c = code.value
  if (!c) return '••• •••'
  const mid = Math.ceil(c.length / 2)
  return `${c.slice(0, mid)} ${c.slice(mid)}`
})

// Countdown ring geometry (r = 9).
const RING_CIRCUMFERENCE = 2 * Math.PI * 9
const ringOffset = computed(() =>
  RING_CIRCUMFERENCE * (1 - (period.value ? secondsRemaining.value / period.value : 0)),
)
const urgent = computed(() => secondsRemaining.value <= 5)

function copyCode() {
  if (!code.value) return
  copy(code.value)
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 1500)
}

onMounted(load)
onUnmounted(() => {
  stopTimer()
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div class="flex items-center gap-3 px-3.5 py-2.5">
    <div class="min-w-0 flex-1">
      <p class="text-xs font-medium text-neutral-500">{{ t('vault.passwords.totpCodeLabel') }}</p>
      <p v-if="errored" class="truncate text-sm text-neutral-400">
        {{ t('vault.passwords.totpError') }}
      </p>
      <p
        v-else
        class="mt-0.5 font-mono text-lg font-semibold leading-none tracking-[0.12em] text-neutral-950 select-all"
        :class="{ 'opacity-30': loading }"
      >
        {{ formattedCode }}
      </p>
    </div>

    <!-- Countdown ring -->
    <div v-if="!errored && !loading" class="relative flex size-8 shrink-0 items-center justify-center">
      <svg class="size-7 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" class="text-neutral-200" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          :stroke-dasharray="RING_CIRCUMFERENCE"
          :stroke-dashoffset="ringOffset"
          :class="urgent ? 'text-red-500' : 'text-neutral-400'"
          style="transition: stroke-dashoffset 1s linear"
        />
      </svg>
      <span
        class="absolute text-[10px] font-semibold tabular-nums"
        :class="urgent ? 'text-red-500' : 'text-neutral-400'"
      >{{ secondsRemaining }}</span>
    </div>
    <svg
      v-else-if="loading"
      class="size-4 shrink-0 animate-spin text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    ><path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" /></svg>

    <button
      type="button"
      class="flex size-8 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-950 disabled:opacity-40 disabled:hover:text-neutral-400"
      :disabled="!code || errored"
      :aria-label="t('vault.passwords.copyCode')"
      @click="copyCode"
    >
      <svg v-if="copied" class="size-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
      <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    </button>
  </div>
</template>
