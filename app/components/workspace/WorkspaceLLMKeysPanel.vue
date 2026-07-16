<script setup lang="ts">
// LLM API key management panel (BYOK — Bring Your Own Key).
//
// Surfaces in the Workspace Settings modal between Members and Administration.
// Workspaces can attach an API key per provider; the server uses the
// workspace key for every Chat() call originating from this workspace,
// silently falling back to the shared server key when no workspace key
// exists for the provider.
//
// Plaintext keys never leave this component — we POST the secret to the
// server and only read back last_four/created_at/last_used_at after.

import { isLLMKeyError, useWorkspaceLLMKeys, type WorkspaceLLMKey } from '~/composables/account/useWorkspaceLLMKeys'

interface Props {
  workspaceId: string | null
  canManage: boolean
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false,
})

const toast = useAppToast()
const { t } = useI18n()
const workspaceId = computed(() => props.workspaceId)

const { keys, loading, error, fetchKeys, saveKey, deleteKey } = useWorkspaceLLMKeys(workspaceId)

const providerOptions = computed(() => [
  { value: 'anthropic' as const, label: t('llmKeys.providers.anthropic'), hint: t('llmKeys.keyFormatHints.anthropic'), baseHint: t('llmKeys.baseUrlDefaults.anthropic') },
  { value: 'openai' as const, label: t('llmKeys.providers.openai'), hint: t('llmKeys.keyFormatHints.openai'), baseHint: t('llmKeys.baseUrlDefaults.openai') },
  { value: 'gemini' as const, label: t('llmKeys.providers.gemini'), hint: t('llmKeys.keyFormatHints.gemini'), baseHint: t('llmKeys.baseUrlDefaults.gemini') },
])

const providerLabel = (p: WorkspaceLLMKey['provider']) =>
  providerOptions.value.find(o => o.value === p)?.label ?? p

// Inline "add new key" form state. Reused for "rotate" by pre-selecting the
// provider — submitting POST with the same provider upserts the row.
const isAdding = ref(false)
const formProvider = ref<WorkspaceLLMKey['provider']>('anthropic')
const formKey = ref('')
const formBaseUrl = ref('')
const submitting = ref(false)

function resetForm() {
  isAdding.value = false
  formKey.value = ''
  formBaseUrl.value = ''
}

function openAdd() {
  formProvider.value = 'anthropic'
  formKey.value = ''
  formBaseUrl.value = ''
  isAdding.value = true
}

function openRotate(k: WorkspaceLLMKey) {
  formProvider.value = k.provider
  formKey.value = ''
  formBaseUrl.value = k.api_base ?? ''
  isAdding.value = true
}

async function handleSubmit() {
  if (!formKey.value.trim() || submitting.value) return
  submitting.value = true
  const apiBase = formBaseUrl.value.trim() || null
  const result = await saveKey(formProvider.value, formKey.value.trim(), apiBase)
  submitting.value = false

  if (isLLMKeyError(result)) {
    toast.show(result.message, 'error', 8000)
    return
  }

  toast.show(t('llmKeys.savedToast', { provider: providerLabel(result.provider), lastFour: result.last_four }), 'info', 4000)
  resetForm()
}

async function handleDelete(k: WorkspaceLLMKey) {
  const ok = window.confirm(
    t('llmKeys.confirmRemove', { provider: providerLabel(k.provider), lastFour: k.last_four }),
  )
  if (!ok) return
  const success = await deleteKey(k.provider)
  if (success) {
    toast.show(t('llmKeys.removedToast', { provider: providerLabel(k.provider) }), 'info', 3500)
  }
  else if (error.value) {
    toast.show(error.value, 'error', 8000)
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return t('llmKeys.relativeNever')
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return t('llmKeys.relativeJustNow')
  if (ms < 3_600_000) return t('llmKeys.relativeMinutesAgo', { n: Math.floor(ms / 60_000) })
  if (ms < 86_400_000) return t('llmKeys.relativeHoursAgo', { n: Math.floor(ms / 3_600_000) })
  return t('llmKeys.relativeDaysAgo', { n: Math.floor(ms / 86_400_000) })
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
  <section :class="embedded ? 'py-0' : 'py-5'">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div v-if="!embedded" class="min-w-0">
        <h3 class="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          {{ t('workspaceMenu.llmKeysTitle') }}
        </h3>
        <p class="mt-1.5 text-[11px] leading-snug text-neutral-500">
          {{ t('workspaceMenu.llmKeysDesc') }}
        </p>
      </div>
      <p v-else class="min-w-0 text-sm leading-relaxed text-neutral-500">
        {{ t('workspaceMenu.llmKeysDesc') }}
      </p>
      <button
        v-if="canManage && !isAdding"
        type="button"
        class="shrink-0 self-center rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
        @click="openAdd"
      >
        + {{ t('llmKeys.addKey') }}
      </button>
    </div>

    <div v-if="loading && keys.length === 0" class="rounded-lg border border-neutral-200 bg-white px-3.5 py-4 text-[11px] text-neutral-500">
      {{ t('llmKeys.loading') }}
    </div>

    <div v-else-if="keys.length === 0 && !isAdding" class="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3.5 py-4 text-[11px] text-neutral-500">
      {{ t('llmKeys.empty') }}
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
            {{ t('llmKeys.lastUsed', { when: formatRelative(k.last_used_at) }) }}
          </p>
          <p v-if="k.api_base" class="mt-0.5 truncate font-mono text-[10px] text-neutral-400">
            {{ k.api_base }}
          </p>
        </div>
        <div v-if="canManage" class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            class="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            @click="openRotate(k)"
          >
            {{ t('llmKeys.rotate') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
            @click="handleDelete(k)"
          >
            {{ t('llmKeys.remove') }}
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
        <label class="block text-[11px] font-medium text-neutral-700">{{ t('llmKeys.provider') }}</label>
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
        <label class="block text-[11px] font-medium text-neutral-700">{{ t('llmKeys.apiKey') }}</label>
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
          {{ t('llmKeys.keyHint') }}
        </p>
      </div>
      <div>
        <label class="block text-[11px] font-medium text-neutral-700">
          {{ t('llmKeys.baseUrl') }}
          <span class="font-normal text-neutral-400">{{ t('llmKeys.baseUrlOptional') }}</span>
        </label>
        <input
          v-model="formBaseUrl"
          name="llm-api-base"
          type="url"
          autocomplete="off"
          spellcheck="false"
          :placeholder="providerOptions.find(p => p.value === formProvider)?.baseHint"
          class="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-xs text-neutral-950 focus:border-neutral-400 focus:outline-none"
        >
        <p class="mt-1 text-[10px] leading-snug text-neutral-500">
          {{ t('llmKeys.baseUrlHint') }}
        </p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          :disabled="submitting"
          @click="resetForm"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="submit"
          class="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="!formKey.trim() || submitting"
        >
          {{ submitting ? t('workspaceMenu.saving') : t('llmKeys.saveKey') }}
        </button>
      </div>
    </form>
  </section>
</template>
