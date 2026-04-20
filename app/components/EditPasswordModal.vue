<script setup lang="ts">
import { useI18n } from '#imports'

const props = defineProps<{
  open: boolean
  passwordId: string
  initialName: string
  initialUrl: string
  initialUsername: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [entry: { id: string; name: string; url: string; username: string }]
}>()

const { t } = useI18n()
const { updatePassword } = usePasswords()

const name = ref('')
const url = ref('')
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const saving = ref(false)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.initialName
    url.value = props.initialUrl
    username.value = props.initialUsername
    password.value = ''
    showPassword.value = false
  }
})

async function handleSubmit() {
  if (!name.value.trim() || !url.value.trim() || !username.value.trim()) return
  saving.value = true
  const entry = await updatePassword(
    props.passwordId,
    name.value.trim(),
    url.value.trim().startsWith('http') ? url.value.trim() : `https://${url.value.trim()}`,
    username.value.trim(),
    password.value.trim() || undefined,
  )
  saving.value = false
  if (entry) {
    emit('saved', { id: entry.id, name: entry.name, url: entry.url, username: entry.username })
    emit('update:open', false)
  }
}

function handleCancel() {
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) handleCancel()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="props.open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="handleCancel"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="props.open"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="relative px-5 pt-5 pb-5">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="handleCancel"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>

              <h2 class="text-sm font-semibold text-neutral-900 pr-8 mb-5">{{ t('vault.passwords.editPasswordTitle') }}</h2>

              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.urlLabel') }}</label>
                  <input
                    v-model="url"
                    :placeholder="t('vault.passwords.urlPlaceholder')"
                    class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.usernameLabel') }}</label>
                  <input
                    v-model="username"
                    :placeholder="t('vault.passwords.usernamePlaceholder')"
                    class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.newPasswordLabel') }}</label>
                  <div class="relative">
                    <input
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      :placeholder="t('vault.passwords.newPasswordPlaceholder')"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 pr-10 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />
                    <button
                      type="button"
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600"
                      @click="showPassword = !showPassword"
                    >
                      <svg v-if="showPassword" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                @click="handleCancel"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                :disabled="saving || !url.trim() || !username.trim()"
                @click="handleSubmit"
              >
                {{ saving ? t('vault.passwords.saving') : t('common.save') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
