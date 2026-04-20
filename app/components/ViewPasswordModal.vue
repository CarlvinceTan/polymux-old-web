<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  open: boolean
  passwordId: string
  name: string
  url: string
  username: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const { revealPassword } = usePasswords()
const { copy, copied } = useClipboard()

const secret = ref<string | null>(null)
const revealed = ref(false)
const loading = ref(false)

async function handleReveal() {
  if (secret.value !== null) {
    revealed.value = !revealed.value
    return
  }
  loading.value = true
  secret.value = await revealPassword(props.passwordId)
  revealed.value = true
  loading.value = false
}

function handleCopy() {
  if (secret.value) copy(secret.value)
}

function handleClose() {
  secret.value = null
  revealed.value = false
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) handleClose()
}

watch(() => props.open, (val) => {
  if (!val) {
    secret.value = null
    revealed.value = false
  }
})

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="handleClose"
      >
        <div
          class="relative w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-neutral-950/10"
          role="dialog"
          aria-modal="true"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
            <h2 class="text-body-lg font-semibold text-neutral-950">{{ name }}</h2>
            <button
              type="button"
              class="flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              @click="handleClose"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div class="space-y-4 p-6">
            <div>
              <p class="mb-1 text-label-md font-medium text-neutral-500">{{ t('vault.passwords.urlLabel') }}</p>
              <p class="text-body-md text-neutral-950 truncate">{{ url }}</p>
            </div>
            <div>
              <p class="mb-1 text-label-md font-medium text-neutral-500">{{ t('vault.passwords.usernameLabel') }}</p>
              <p class="text-body-md text-neutral-950">{{ username }}</p>
            </div>
            <div>
              <p class="mb-1 text-label-md font-medium text-neutral-500">{{ t('vault.passwords.passwordLabel') }}</p>
              <div class="flex items-center gap-2">
                <span class="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-body-md text-neutral-950 tracking-widest select-all">
                  {{ revealed && secret ? secret : '••••••••••••' }}
                </span>
                <button
                  type="button"
                  class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-950 disabled:opacity-50"
                  :disabled="loading"
                  :aria-label="revealed ? t('vault.passwords.hidePassword') : t('vault.passwords.revealPassword')"
                  @click="handleReveal"
                >
                  <svg v-if="loading" class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/></svg>
                  <svg v-else-if="revealed" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                </button>
                <button
                  type="button"
                  class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-950 disabled:opacity-50"
                  :disabled="!secret"
                  :aria-label="copied ? t('vault.passwords.copied') : t('vault.passwords.copyPassword')"
                  @click="handleCopy"
                >
                  <svg v-if="copied" class="size-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div class="flex justify-end border-t border-neutral-200 px-6 py-4">
            <button
              type="button"
              class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
              @click="handleClose"
            >
              {{ t('common.close') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
