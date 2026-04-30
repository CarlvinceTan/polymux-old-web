<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PasswordEntry } from '~/composables/usePasswords'

/**
 * CredentialRequestModal opens when the agent calls RequestCredential. The
 * user can pick an existing saved entry that matches the requested site, or
 * fall back to entering a fresh pair which is stored in the vault and then
 * returned to the agent. The password never leaves the vault on the
 * existing-entry path — we reveal-decrypt locally and pass it back over WS
 * for the immediate fill, while keeping the credential_id so future
 * workflow runs can fetch silently.
 */
const props = defineProps<{
  open: boolean
  site: string
  purpose: string
  suggestedUsername?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'submit': [value: { credentialId: string; username: string; password: string }]
  'cancel': []
}>()

const { passwords, fetchPasswords, addPassword, revealPassword } = usePasswords()

// Existing-entry selection.
const selectedId = ref<string | null>(null)

// New-entry form state.
const newUsername = ref('')
const newPassword = ref('')
const showNewPassword = ref(false)

// Saving / revealing state — disables the buttons during async work.
const submitting = ref(false)
const error = ref<string | null>(null)

// Hostname extracted from props.site, used as both a filter for matching
// existing entries and the default name when saving a fresh one.
const siteHost = computed(() => extractHost(props.site))

const matching = computed<PasswordEntry[]>(() => {
  const host = siteHost.value
  if (!host) return []
  return passwords.value.filter((p) => {
    const phost = extractHost(p.url) || extractHost(p.name)
    return phost === host
  })
})

// Pre-select the most-recently-used matching entry on open. Falls back to
// the first match. Empty if the user hasn't saved anything for this site.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    error.value = null
    fetchPasswords()
    if (props.suggestedUsername) newUsername.value = props.suggestedUsername
    queueMicrotask(() => {
      if (matching.value.length > 0) selectedId.value = matching.value[0]!.id
    })
  },
)

function extractHost(input: string): string {
  if (!input) return ''
  try {
    const href = input.startsWith('http') ? input : `https://${input}`
    return new URL(href).hostname.replace(/^www\./, '')
  }
  catch {
    return input.replace(/\/.*$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '')
  }
}

async function handleUseExisting() {
  if (!selectedId.value) return
  const match = passwords.value.find(p => p.id === selectedId.value)
  if (!match) return
  submitting.value = true
  error.value = null
  try {
    const password = await revealPassword(match.id)
    if (password == null) {
      error.value = 'Could not retrieve the saved password.'
      return
    }
    emit('submit', {
      credentialId: match.id,
      username: match.username,
      password,
    })
    emit('update:open', false)
    reset()
  }
  finally {
    submitting.value = false
  }
}

async function handleSaveAndUse() {
  const u = newUsername.value.trim()
  const p = newPassword.value.trim()
  if (!u || !p) return
  submitting.value = true
  error.value = null
  try {
    const url = props.site.startsWith('http') ? props.site : `https://${siteHost.value}`
    const name = siteHost.value.split('.')[0] || siteHost.value
    const entry = await addPassword(url, u, p, name.charAt(0).toUpperCase() + name.slice(1))
    if (!entry) {
      error.value = 'Could not save the credential to the vault.'
      return
    }
    emit('submit', { credentialId: entry.id, username: u, password: p })
    emit('update:open', false)
    reset()
  }
  finally {
    submitting.value = false
  }
}

function handleCancel() {
  if (submitting.value) return
  emit('cancel')
  emit('update:open', false)
  reset()
}

function reset() {
  selectedId.value = null
  newUsername.value = ''
  newPassword.value = ''
  showNewPassword.value = false
  error.value = null
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
            <div class="relative px-5 pt-5 pb-2">
              <button
                type="button"
                class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="handleCancel"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>

              <h2 class="text-sm font-semibold text-neutral-900 pr-8 mb-1">
                The agent needs to sign in to <span class="text-neutral-700">{{ siteHost || props.site }}</span>
              </h2>
              <p class="text-xs text-neutral-500 mb-4">{{ props.purpose }}</p>

              <!-- Existing matching credentials -->
              <div v-if="matching.length > 0" class="mb-4">
                <label class="block text-xs font-medium text-neutral-500 mb-1.5">Use a saved credential</label>
                <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <button
                    v-for="entry in matching"
                    :key="entry.id"
                    type="button"
                    class="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                    :class="selectedId === entry.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'"
                    @click="selectedId = entry.id"
                  >
                    <div class="text-xs font-medium text-neutral-900">{{ entry.username }}</div>
                    <div class="text-[10px] text-neutral-500">last used {{ new Date(entry.lastUsed).toLocaleDateString() }} · {{ entry.usageCount }} use(s)</div>
                  </button>
                </div>
                <button
                  type="button"
                  class="mt-2 w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  :disabled="!selectedId || submitting"
                  @click="handleUseExisting"
                >
                  {{ submitting ? 'Working…' : 'Use this credential' }}
                </button>
                <div class="my-4 flex items-center gap-2">
                  <div class="h-px flex-1 bg-neutral-200" />
                  <span class="text-[10px] uppercase tracking-wider text-neutral-400">or save a new one</span>
                  <div class="h-px flex-1 bg-neutral-200" />
                </div>
              </div>

              <!-- New entry form -->
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">Username or email</label>
                  <input
                    v-model="newUsername"
                    :placeholder="props.suggestedUsername || 'you@example.com'"
                    class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                  >
                </div>

                <div>
                  <label class="block text-xs font-medium text-neutral-500 mb-1.5">Password</label>
                  <div class="relative">
                    <input
                      v-model="newPassword"
                      :type="showNewPassword ? 'text' : 'password'"
                      placeholder="Stored in your workspace vault"
                      class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 pr-10 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                    >
                    <button
                      type="button"
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600"
                      @click="showNewPassword = !showNewPassword"
                    >
                      <svg v-if="showNewPassword" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    </button>
                  </div>
                </div>

                <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                :disabled="submitting"
                @click="handleCancel"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                :disabled="!newUsername.trim() || !newPassword.trim() || submitting"
                @click="handleSaveAndUse"
              >
                {{ submitting ? 'Saving…' : 'Save & use' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
