<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChatCredentialRequest } from '~/composables/types'
import type { PasswordEntry } from '~/composables/vault/usePasswords'
import { extractCredentialHost, passwordMatchesSite } from '~/composables/vault/credentialSiteMatch'

/**
 * Inline chat card for RequestCredential — replaces the modal overlay so the
 * picker lives in the conversation and collapses to a one-line summary once
 * the user submits or cancels.
 */
const props = defineProps<{
  request: ChatCredentialRequest
}>()

const emit = defineEmits<{
  submit: [value: { credentialId: string; username: string; allowAgentFill: boolean }]
  cancel: []
}>()

const { t, locale } = useI18n()
const { passwords, fetchPasswords, addPassword, updatePassword, deletePassword, error: vaultError } = usePasswords()
const { members, fetchMembers, currentWorkspaceId } = useWorkspaces()

const selectedId = ref<string | null>(null)
const expandedId = ref<string | null>(null)
const newUsername = ref('')
const newPassword = ref('')
const showNewPassword = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
// Default OFF: the agent signs in via the blindfold secure_login path. Opting
// in additionally lets the agent enter this credential with the plain fill
// tools as a fallback (less isolated — the agent operates the page directly).
const allowAgentFill = ref(false)

const siteHost = computed(() => extractCredentialHost(props.request.site) || props.request.site)

const memberLookup = computed(() => {
  const map = new Map<string, string>()
  for (const m of members.value) {
    const label = m.display_name?.trim() || m.email?.trim() || m.user_id
    map.set(m.user_id, label)
  }
  return map
})

function nameFor(userId: string | null | undefined): string {
  if (!userId) return t('vault.passwords.unknownUser')
  return memberLookup.value.get(userId) ?? t('vault.passwords.unknownUser')
}

const matching = computed<PasswordEntry[]>(() =>
  passwords.value.filter(p => passwordMatchesSite(p, props.request.site)),
)

const isPending = computed(() => props.request.status === 'pending')

watch(
  () => props.request.msgId,
  () => {
    if (!isPending.value) return
    error.value = null
    void fetchPasswords({ force: true })
    const wsId = currentWorkspaceId.value
    if (wsId) void fetchMembers(wsId)
    if (props.request.suggestedUsername) newUsername.value = props.request.suggestedUsername
  },
  { immediate: true },
)

watch(
  matching,
  (entries) => {
    if (!isPending.value || entries.length === 0) return
    if (!selectedId.value || !entries.some(e => e.id === selectedId.value)) {
      selectedId.value = entries[0]!.id
    }
  },
  { immediate: true },
)

let refreshTimer: ReturnType<typeof setInterval> | null = null
watch(isPending, (pending) => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (!pending) return
  refreshTimer = setInterval(() => {
    void fetchPasswords({ force: true })
  }, 4000)
}, { immediate: true })

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

function formatLastUsed(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  if (diffSec < 60) return rtf.format(-diffSec, 'second')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return rtf.format(-diffHr, 'hour')
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return rtf.format(-diffDay, 'day')
  return new Date(then).toLocaleDateString(locale.value)
}

function toggleDetails(entryId: string, event: Event) {
  event.stopPropagation()
  expandedId.value = expandedId.value === entryId ? null : entryId
}

function handleUseExisting() {
  if (!selectedId.value) return
  const match = passwords.value.find(p => p.id === selectedId.value)
  if (!match) return
  // Send only the id + username. The server decrypts the secret server-side and
  // injects it into the browser fill — the password is never revealed here.
  emit('submit', {
    credentialId: match.id,
    username: match.username,
    allowAgentFill: allowAgentFill.value,
  })
}

async function handleSaveAndUse() {
  const u = newUsername.value.trim()
  const p = newPassword.value.trim()
  if (!u || !p) return
  submitting.value = true
  error.value = null
  try {
    const wsId = currentWorkspaceId.value
    if (!wsId) {
      error.value = t('credentialRequest.errorNoWorkspace')
      return
    }
    const url = props.request.site.startsWith('http') ? props.request.site : `https://${siteHost.value || extractCredentialHost(props.request.site) || 'example.com'}`
    const name = siteHost.value.split('.')[0] || siteHost.value
    const displayName = name.charAt(0).toUpperCase() + name.slice(1)

    let entry: PasswordEntry | null = null
    const selected = selectedId.value ? passwords.value.find(pwd => pwd.id === selectedId.value) : null
    if (selected && selected.username === u) {
      entry = await updatePassword(selected.id, selected.name, url, u, p)
    }
    else {
      entry = await addPassword(url, u, p, displayName)
    }

    if (!entry) {
      error.value = vaultError.value || t('credentialRequest.errorSave')
      return
    }
    // The new credential is saved (encrypted) via the vault RPC above; we send
    // only its id + username. The server reads the secret back server-side.
    emit('submit', { credentialId: entry.id, username: u, allowAgentFill: allowAgentFill.value })
  }
  finally {
    submitting.value = false
  }
}

async function handleDeleteEntry(entryId: string, event: Event) {
  event.stopPropagation()
  const ok = await deletePassword(entryId)
  if (!ok) {
    error.value = vaultError.value || t('credentialRequest.errorDelete')
    return
  }
  if (selectedId.value === entryId) selectedId.value = matching.value[0]?.id ?? null
  if (expandedId.value === entryId) expandedId.value = null
}

function handleCancel() {
  if (submitting.value) return
  emit('cancel')
}

onMounted(() => {
  const wsId = currentWorkspaceId.value
  if (isPending.value && wsId) void fetchMembers(wsId)
})
</script>

<template>
  <div
    data-testid="credential-request-card"
    class="my-2 w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm ring-1 ring-neutral-950/5"
    :class="isPending ? '' : 'opacity-90'"
  >
    <template v-if="!isPending">
      <p class="text-sm text-neutral-700">
        {{ request.status === 'cancelled'
          ? t('credentialRequest.cancelledSummary', { site: siteHost || request.site })
          : t('credentialRequest.completedSummary', { site: siteHost || request.site }) }}
      </p>
    </template>

    <template v-else>
      <div class="mb-3 flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <i18n-t keypath="credentialRequest.heading" tag="h3" class="text-sm font-semibold text-neutral-900">
            <template #site>
              <span class="text-neutral-700">{{ siteHost || request.site }}</span>
            </template>
          </i18n-t>
          <p class="mt-0.5 text-xs text-neutral-500">{{ request.purpose }}</p>
        </div>
      </div>

      <div v-if="matching.length > 0" class="mb-4">
        <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('credentialRequest.useSavedLabel') }}</label>
        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          <div
            v-for="entry in matching"
            :key="entry.id"
            class="rounded-lg border transition-colors"
            :class="selectedId === entry.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'"
          >
            <button
              type="button"
              class="w-full text-left px-3 py-2"
              @click="selectedId = entry.id"
            >
              <div class="text-xs font-medium text-neutral-900">{{ entry.username }}</div>
              <div class="text-[10px] text-neutral-500">
                {{ t('credentialRequest.lastUsed', { date: new Date(entry.lastUsed).toLocaleDateString(), count: entry.usageCount }) }}
              </div>
            </button>

            <div v-if="expandedId === entry.id" class="border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-500 space-y-1">
              <p>{{ t('vault.passwords.savedBy', { name: nameFor(entry.createdBy) }) }}</p>
              <p v-if="entry.lastUsedBy">
                {{ t('vault.passwords.lastUsedBy', { name: nameFor(entry.lastUsedBy), when: formatLastUsed(entry.lastUsed) }) }}
              </p>
              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  class="text-neutral-700 hover:text-neutral-950 underline-offset-2 hover:underline"
                  @click="toggleDetails(entry.id, $event)"
                >
                  {{ t('credentialRequest.hideDetails') }}
                </button>
                <button
                  type="button"
                  class="text-red-600 hover:text-red-700 underline-offset-2 hover:underline"
                  @click="handleDeleteEntry(entry.id, $event)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </div>
            <div v-else class="px-3 pb-2">
              <button
                type="button"
                class="text-[11px] text-neutral-500 hover:text-neutral-800 underline-offset-2 hover:underline"
                @click="toggleDetails(entry.id, $event)"
              >
                {{ t('credentialRequest.showDetails') }}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="mt-2 w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="!selectedId || submitting"
          @click="handleUseExisting"
        >
          {{ submitting ? t('credentialRequest.working') : t('credentialRequest.useThisCredential') }}
        </button>

        <div class="my-4 flex items-center gap-2">
          <div class="h-px flex-1 bg-neutral-200" />
          <span class="text-[10px] uppercase tracking-wider text-neutral-400">{{ t('credentialRequest.orSaveNew') }}</span>
          <div class="h-px flex-1 bg-neutral-200" />
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('credentialRequest.usernameLabel') }}</label>
          <input
            v-model="newUsername"
            data-testid="credential-username"
            name="credential-username"
            autocomplete="username"
            :placeholder="request.suggestedUsername || t('credentialRequest.usernamePlaceholder')"
            class="w-full rounded-lg border border-neutral-200 bg-white py-2 px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
          >
        </div>

        <div>
          <label class="block text-xs font-medium text-neutral-500 mb-1.5">{{ t('credentialRequest.passwordLabel') }}</label>
          <div class="relative">
            <input
              v-model="newPassword"
              data-testid="credential-password"
              name="credential-password"
              autocomplete="new-password"
              :type="showNewPassword ? 'text' : 'password'"
              :placeholder="t('credentialRequest.passwordPlaceholder')"
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

      <label class="mt-3 flex items-start gap-2 text-xs text-neutral-500">
        <input
          v-model="allowAgentFill"
          type="checkbox"
          class="mt-0.5 size-3.5 shrink-0 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-950/20"
        >
        <span>{{ t('credentialRequest.allowAgentFill') }}</span>
      </label>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          :disabled="submitting"
          @click="handleCancel"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          data-testid="credential-save-and-use"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="!newUsername.trim() || !newPassword.trim() || submitting"
          @click="handleSaveAndUse"
        >
          {{ submitting ? t('credentialRequest.saving') : t('credentialRequest.saveAndUse') }}
        </button>
      </div>
    </template>
  </div>
</template>
