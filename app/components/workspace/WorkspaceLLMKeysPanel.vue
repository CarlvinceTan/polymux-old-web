<script setup lang="ts">
// LLM API key management panel (BYOK — Bring Your Own Key).
//
// Surfaces in the Workspace Settings modal between Members and Administration.
// Pro+ workspaces can attach an API key per provider; the server uses the
// workspace key for every Chat() call originating from this workspace,
// silently falling back to the shared server key when no workspace key
// exists for the provider.
//
// Plaintext keys never leave this component — we POST the secret to the
// server and only read back last_four/created_at/last_used_at after.

import { isLLMKeyError, useWorkspaceLLMKeys, type WorkspaceLLMKey } from '~/composables/account/useWorkspaceLLMKeys'
import { byokAllowedFromPlan } from '~/utils/planLimits'

interface Props {
  workspaceId: string | null
  plan: string | null
  canManage: boolean
}

const props = defineProps<Props>()

const toast = useAppToast()
const { t } = useI18n()
const workspaceId = computed(() => props.workspaceId)

const { keys, loading, error, fetchKeys, saveKey, deleteKey } = useWorkspaceLLMKeys(workspaceId)

const planAllowsBYOK = computed(() => byokAllowedFromPlan(props.plan))

const providerOptions: Array<{ value: WorkspaceLLMKey['provider']; label: string; hint: string }> = [
  { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'sk-ant-…' },
  { value: 'openai',    label: 'OpenAI (GPT)',       hint: 'sk-…' },
  { value: 'gemini',    label: 'Google Gemini',      hint: 'AIza…' },
]

const providerLabel = (p: WorkspaceLLMKey['provider']) =>
  providerOptions.find(o => o.value === p)?.label ?? p

// Inline "add new key" form state. Reused for "rotate" by pre-selecting the
// provider — submitting POST with the same provider upserts the row.
const isAdding = ref(false)
const formProvider = ref<WorkspaceLLMKey['provider']>('anthropic')
const formKey = ref('')
const submitting = ref(false)

function resetForm() {
  isAdding.value = false
  formKey.value = ''
}

function openAdd() {
  formProvider.value = 'anthropic'
  formKey.value = ''
  isAdding.value = true
}

function openRotate(k: WorkspaceLLMKey) {
  formProvider.value = k.provider
  formKey.value = ''
  isAdding.value = true
}

async function handleSubmit() {
  if (!formKey.value.trim() || submitting.value) return
  submitting.value = true
  const result = await saveKey(formProvider.value, formKey.value.trim())
  submitting.value = false

  if (isLLMKeyError(result)) {
    if (result.upgradeRequired) {
      toast.show(
        result.message || 'BYOK is available on Pro and above. Upgrade your plan to add an LLM key.',
        'warning',
        10000,
      )
      // Stay on the form — user can dismiss manually.
      return
    }
    toast.show(result.message, 'error', 8000)
    return
  }

  toast.show(`Saved ${providerLabel(result.provider)} key (…${result.last_four}).`, 'info', 4000)
  resetForm()
}

async function handleDelete(k: WorkspaceLLMKey) {
  const ok = window.confirm(
    `Remove the ${providerLabel(k.provider)} API key (…${k.last_four})? `
    + `Future runs will fall back to the shared server key.`,
  )
  if (!ok) return
  const success = await deleteKey(k.provider)
  if (success) {
    toast.show(`Removed ${providerLabel(k.provider)} key.`, 'info', 3500)
  }
  else if (error.value) {
    toast.show(error.value, 'error', 8000)
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

watchEffect(() => {
  if (!workspaceId.value) return
  // RLS already gates SELECT to admins/owners — for plain members the list
  // simply comes back empty, so it's safe to always fetch when the panel
  // is mounted.
  void fetchKeys()
})
</script>

<template>
  <section class="py-5">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h3 class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          {{ t('workspaceMenu.llmKeysTitle', 'LLM API Keys') }}
        </h3>
        <p class="mt-1.5 text-[11px] leading-snug text-neutral-500">
          {{ t(
            'workspaceMenu.llmKeysDesc',
            'Bring your own LLM API key. When set, every run in this workspace uses your key instead of the shared one — tokens come out of your provider account, not your weekly budget.',
          ) }}
        </p>
      </div>
      <button
        v-if="canManage && planAllowsBYOK && !isAdding"
        type="button"
        class="shrink-0 self-center rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
        @click="openAdd"
      >
        + Add key
      </button>
    </div>

    <div
      v-if="!planAllowsBYOK"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11px] leading-snug text-amber-900"
    >
      <p class="font-medium">BYOK is a Pro feature.</p>
      <p class="mt-1 text-amber-800">
        Upgrade your workspace to Pro or Max to plug in your own Anthropic, OpenAI, or Gemini API
        key. Your tokens won't count against the plan's weekly budget.
      </p>
    </div>

    <div v-else>
      <div v-if="loading && keys.length === 0" class="rounded-lg border border-neutral-200 bg-white px-3.5 py-4 text-[11px] text-neutral-500">
        Loading keys…
      </div>

      <div v-else-if="keys.length === 0 && !isAdding" class="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3.5 py-4 text-[11px] text-neutral-500">
        No LLM keys configured yet. Runs in this workspace use the shared server key.
      </div>

      <ul v-else-if="keys.length > 0" class="space-y-2">
        <li
          v-for="k in keys"
          :key="k.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5"
        >
          <div class="min-w-0">
            <p class="truncate text-xs font-medium text-neutral-950">{{ providerLabel(k.provider) }}</p>
            <p class="mt-0.5 text-[11px] text-neutral-500">
              <span class="font-mono">…{{ k.last_four }}</span>
              <span class="mx-1.5">·</span>
              Last used {{ formatRelative(k.last_used_at) }}
            </p>
          </div>
          <div v-if="canManage" class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              @click="openRotate(k)"
            >
              Rotate
            </button>
            <button
              type="button"
              class="rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
              @click="handleDelete(k)"
            >
              Remove
            </button>
          </div>
        </li>
      </ul>

      <!-- Add / rotate form -->
      <form
        v-if="canManage && isAdding"
        class="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-white p-3.5"
        @submit.prevent="handleSubmit"
      >
        <div>
          <label class="block text-[11px] font-medium text-neutral-700">Provider</label>
          <select
            v-model="formProvider"
            name="llm-provider"
            class="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-950 focus:border-neutral-400 focus:outline-none"
          >
            <option v-for="p in providerOptions" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-medium text-neutral-700">API key</label>
          <input
            v-model="formKey"
            name="llm-api-key"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="providerOptions.find(p => p.value === formProvider)?.hint"
            class="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-xs text-neutral-950 focus:border-neutral-400 focus:outline-none"
          >
          <p class="mt-1 text-[10px] leading-snug text-neutral-500">
            The key is encrypted at rest. We only display the last four characters back to you;
            the full key cannot be retrieved.
          </p>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            :disabled="submitting"
            @click="resetForm"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            :disabled="!formKey.trim() || submitting"
          >
            {{ submitting ? 'Saving…' : 'Save key' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
