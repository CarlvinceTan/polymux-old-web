<script setup lang="ts">
import { useI18n } from '#imports'
import { derivePasswordName, normalizeImportUrl } from '~/utils/vault/passwordImport'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  // `type` is 'login' (url + username + password) or 'secret' (name + value
  // [+ optional scope], no url/username). New credentials default the
  // agent-access policy to 'consent_required' on the page side.
  'add': [entry: { name: string; url: string; username: string; password: string; type: 'login' | 'secret' }]
}>()

const { t } = useI18n()

type Tab = 'add' | 'import'
type CredType = 'login' | 'secret'

const tab = ref<Tab>('add')
const credType = ref<CredType>('login')

// Login fields
const url = ref('')
const username = ref('')
const password = ref('')
const showPassword = ref(false)

// Secret / API-key fields
const secretName = ref('')
const secretScope = ref('')
const secretValue = ref('')
const showSecret = ref(false)

const canSubmit = computed(() => {
  if (credType.value === 'login') {
    return !!(url.value.trim() && username.value.trim() && password.value.trim())
  }
  return !!(secretName.value.trim() && secretValue.value.trim())
})

function resetForm() {
  url.value = ''
  username.value = ''
  password.value = ''
  showPassword.value = false
  secretName.value = ''
  secretScope.value = ''
  secretValue.value = ''
  showSecret.value = false
}

function resetState() {
  tab.value = 'add'
  credType.value = 'login'
  resetForm()
}

function handleSubmit() {
  if (!canSubmit.value) return

  if (credType.value === 'login') {
    const trimmedUrl = url.value.trim()
    emit('add', {
      name: derivePasswordName(trimmedUrl),
      url: normalizeImportUrl(trimmedUrl),
      username: username.value.trim(),
      password: password.value.trim(),
      type: 'login',
    })
  }
  else {
    emit('add', {
      name: secretName.value.trim(),
      url: '',
      username: secretScope.value.trim(),
      password: secretValue.value.trim(),
      type: 'secret',
    })
  }

  resetState()
  emit('update:open', false)
}

function handleCancel() {
  resetState()
  emit('update:open', false)
}

function handleImportDone() {
  resetState()
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) handleCancel()
}

watch(() => props.open, (open) => {
  if (!open) resetState()
})

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
            class="flex max-h-[min(85svh,640px)] w-full flex-col overflow-hidden rounded-2xl bg-white modal-surface"
            :class="tab === 'import' ? 'max-w-lg' : 'max-w-md'"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="relative shrink-0 px-5 pt-5 pb-4">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="handleCancel"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>

              <h2 class="pr-8 text-sm font-semibold text-neutral-900 mb-3">
                {{ tab === 'add' ? t('vault.credentials.add.title') : t('vault.passwords.import.title') }}
              </h2>

              <div class="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                  :class="tab === 'add' ? 'bg-white text-neutral-900 ring-1 ring-neutral-200/80' : 'text-neutral-500'"
                  @click="tab = 'add'"
                >
                  {{ t('vault.passwords.addTab') }}
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                  :class="tab === 'import' ? 'bg-white text-neutral-900 ring-1 ring-neutral-200/80' : 'text-neutral-500'"
                  @click="tab = 'import'"
                >
                  {{ t('vault.passwords.importTab') }}
                </button>
              </div>
            </div>

            <div v-if="tab === 'add'" class="flex min-h-0 flex-1 flex-col">
              <div class="px-5 pb-5 space-y-4">
                <!-- Credential type: a site login vs a free-standing secret / API key -->
                <div class="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
                  <button
                    type="button"
                    data-testid="vault-add-type-login"
                    class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                    :class="credType === 'login' ? 'bg-white text-neutral-900 ring-1 ring-neutral-200/80' : 'text-neutral-500'"
                    @click="credType = 'login'"
                  >
                    {{ t('vault.credentials.add.typeLogin') }}
                  </button>
                  <button
                    type="button"
                    data-testid="vault-add-type-secret"
                    class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                    :class="credType === 'secret' ? 'bg-white text-neutral-900 ring-1 ring-neutral-200/80' : 'text-neutral-500'"
                    @click="credType = 'secret'"
                  >
                    {{ t('vault.credentials.add.typeSecret') }}
                  </button>
                </div>

                <!-- Login fields -->
                <template v-if="credType === 'login'">
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.urlLabel') }}</label>
                    <input
                      v-model="url"
                      data-testid="vault-add-password-url"
                      name="vault-url"
                      autocomplete="url"
                      :placeholder="t('vault.passwords.urlPlaceholder')"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.usernameLabel') }}</label>
                    <input
                      v-model="username"
                      data-testid="vault-add-password-username"
                      name="vault-username"
                      autocomplete="username"
                      :placeholder="t('vault.passwords.usernamePlaceholder')"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.passwords.passwordLabel') }}</label>
                    <div class="relative">
                      <input
                        v-model="password"
                        name="vault-password"
                        autocomplete="new-password"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="t('vault.passwords.passwordPlaceholder')"
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
                </template>

                <!-- Secret / API-key fields -->
                <template v-else>
                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.credentials.add.secretNameLabel') }}</label>
                    <input
                      v-model="secretName"
                      data-testid="vault-add-secret-name"
                      name="vault-secret-name"
                      autocomplete="off"
                      :placeholder="t('vault.credentials.add.secretNamePlaceholder')"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.credentials.add.secretValueLabel') }}</label>
                    <div class="relative">
                      <input
                        v-model="secretValue"
                        data-testid="vault-add-secret-value"
                        name="vault-secret-value"
                        autocomplete="off"
                        :type="showSecret ? 'text' : 'password'"
                        :placeholder="t('vault.credentials.add.secretValuePlaceholder')"
                        class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 pr-10 font-mono text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:font-sans placeholder:text-neutral-400"
                      />
                      <button
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600"
                        @click="showSecret = !showSecret"
                      >
                        <svg v-if="showSecret" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('vault.credentials.add.secretScopeLabel') }}</label>
                    <input
                      v-model="secretScope"
                      data-testid="vault-add-secret-scope"
                      name="vault-secret-scope"
                      autocomplete="off"
                      :placeholder="t('vault.credentials.add.secretScopePlaceholder')"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    />
                  </div>
                </template>

                <!-- Agent-access default note: new credentials require consent. -->
                <p class="flex items-start gap-1.5 text-xs leading-snug text-neutral-400">
                  <svg class="mt-0.5 size-3.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  {{ t('vault.credentials.add.consentNote') }}
                </p>
              </div>

              <div class="mt-auto flex justify-end gap-2 px-5 py-3.5">
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
                  :disabled="!canSubmit"
                  @click="handleSubmit"
                >
                  {{ t('common.save') }}
                </button>
              </div>
            </div>

            <div v-else class="flex min-h-0 flex-1 flex-col px-5 pb-5">
              <ImportPasswordsPanel
                :active="props.open && tab === 'import'"
                @done="handleImportDone"
              />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
