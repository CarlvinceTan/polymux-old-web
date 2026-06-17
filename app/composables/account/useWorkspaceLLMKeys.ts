// Composable for managing per-workspace LLM API keys (BYOK).
//
// The Nuxt REST endpoints under /api/workspaces/[id]/llm-keys handle the
// encrypted persistence; this composable wraps them in a typed,
// reactive surface for the settings modal.

import type { FetchError } from 'ofetch'

export interface WorkspaceLLMKey {
  id: string
  workspace_id: string
  provider: 'anthropic' | 'openai' | 'gemini'
  api_base: string | null
  last_four: string
  created_by: string
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface LLMKeyError {
  ok: false
  status: number
  message: string
}

function parseError(err: unknown, fallback: string): LLMKeyError {
  const e = err as FetchError | undefined
  const status = e?.statusCode ?? 0
  const message = (e?.data as { statusMessage?: string; message?: string })?.statusMessage
    ?? (e?.data as { message?: string })?.message
    ?? e?.statusMessage
    ?? fallback
  return {
    ok: false,
    status,
    message,
  }
}

export function isLLMKeyError(value: WorkspaceLLMKey | LLMKeyError | null): value is LLMKeyError {
  return value !== null && 'ok' in value && value.ok === false
}

export function useWorkspaceLLMKeys(workspaceId: Ref<string | null | undefined> | ComputedRef<string | null | undefined>) {
  const { t } = useI18n()
  const keys = ref<WorkspaceLLMKey[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchKeys(): Promise<void> {
    const id = unref(workspaceId)
    if (!id) {
      keys.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<WorkspaceLLMKey[]>(`/api/workspaces/${id}/llm-keys`)
      keys.value = data
    }
    catch (err) {
      console.error('[useWorkspaceLLMKeys] list failed', err)
      error.value = parseError(err, 'Failed to list LLM keys.').message
      keys.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function saveKey(
    provider: WorkspaceLLMKey['provider'],
    apiKey: string,
    apiBase?: string | null,
  ): Promise<WorkspaceLLMKey | LLMKeyError> {
    const id = unref(workspaceId)
    if (!id) {
      return { ok: false, status: 0, message: t('llmKeys.noWorkspaceSelected') }
    }
    try {
      const data = await $fetch<WorkspaceLLMKey>(`/api/workspaces/${id}/llm-keys`, {
        method: 'POST',
        body: {
          provider,
          api_key: apiKey,
          api_base: apiBase ?? null,
        },
      })
      // Replace any existing entry for the provider in-place so the UI
      // reflects the new last_four/updated_at without a full refetch.
      const idx = keys.value.findIndex(k => k.provider === provider)
      if (idx >= 0) keys.value[idx] = data
      else keys.value = [...keys.value, data].sort((a, b) => a.provider.localeCompare(b.provider))
      return data
    }
    catch (err) {
      console.error('[useWorkspaceLLMKeys] save failed', err)
      return parseError(err, 'Failed to save LLM key.')
    }
  }

  async function deleteKey(provider: WorkspaceLLMKey['provider']): Promise<boolean> {
    const id = unref(workspaceId)
    if (!id) return false
    try {
      await $fetch(`/api/workspaces/${id}/llm-keys/${provider}`, { method: 'DELETE' })
      keys.value = keys.value.filter(k => k.provider !== provider)
      return true
    }
    catch (err) {
      console.error('[useWorkspaceLLMKeys] delete failed', err)
      error.value = parseError(err, 'Failed to delete LLM key.').message
      return false
    }
  }

  return {
    keys,
    loading,
    error,
    fetchKeys,
    saveKey,
    deleteKey,
  }
}
