import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Credential classification + agent-access policy mirror the Postgres enums
// (public.credential_type, public.agent_access_policy). A stored password is
// either a site login ('login') or a free-standing secret / API key ('secret').
export type CredentialType = Database['public']['Enums']['credential_type']
export type AgentAccessPolicy = Database['public']['Enums']['agent_access_policy']

export interface PasswordEntry {
  id: string
  name: string
  url: string
  username: string
  // 'login' = site credential (url + username); 'secret' = API key / token
  // (name + value, no url/username). Defaults to 'login' for legacy rows.
  type: CredentialType
  // Whether agents may use this credential: 'allowed' (silent inject),
  // 'consent_required' (ask the user first — the default), or 'blocked'.
  agentAccess: AgentAccessPolicy
  lastUsed: string
  usageCount: number
  weak: boolean
  // Provenance — shown in the password details modal. UUIDs;
  // the UI resolves them to display names via useWorkspaces().members and
  // falls back to "unknown" when the user has left the workspace.
  createdBy: string
  lastUsedBy: string | null
  createdAt: string
}

interface WorkspacePasswordRow {
  id: string
  workspace_id: string
  created_by: string
  name: string
  url: string
  username: string
  vault_secret_id: string
  is_weak: boolean
  type: CredentialType
  agent_access: AgentAccessPolicy
  usage_count: number
  last_used_at: string | null
  last_used_by: string | null
  created_at: string
  updated_at: string
}

function toEntry(row: WorkspacePasswordRow): PasswordEntry {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    type: row.type ?? 'login',
    agentAccess: row.agent_access ?? 'consent_required',
    lastUsed: row.last_used_at ?? row.created_at,
    usageCount: row.usage_count,
    weak: row.is_weak,
    createdBy: row.created_by,
    lastUsedBy: row.last_used_by,
    createdAt: row.created_at,
  }
}

// Single source of truth for the passwords listing fetch + row→entry mapping.
// Shared by the live useQuery below and the warm-cache prefetch hook so both
// populate the ['workspace-passwords', wsId] slot with the SAME mapped shape
// (prefetching raw rows would make the live query render the wrong shape).
export async function fetchPasswordEntries(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<PasswordEntry[]> {
  const { data, error } = await supabase
    .from('workspace_passwords')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as WorkspacePasswordRow[]).map(toEntry)
}

export function prefetchPasswords(
  queryClient: ReturnType<typeof useQueryClient>,
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: ['workspace-passwords', workspaceId],
    queryFn: () => fetchPasswordEntries(supabase, workspaceId),
  })
}

export function isWeakPassword(password: string): boolean {
  if (password.length < 8) return true
  if (!/[A-Z]/.test(password)) return true
  if (!/[0-9]/.test(password)) return true
  if (!/[^A-Za-z0-9]/.test(password)) return true
  return false
}

export function usePasswords() {
  const { t } = useI18n()
  const supabase = useSupabaseClient()
  const { currentWorkspace } = useWorkspaces()
  const queryClient = useQueryClient()

  const wsId = computed(() => currentWorkspace.value?.id)
  const error = ref<string | null>(null)

  const query = useQuery({
    queryKey: computed(() => ['workspace-passwords', wsId.value]),
    queryFn: async () => {
      const id = wsId.value
      if (!id) return []
      error.value = null
      return fetchPasswordEntries(supabase, id)
    },
    enabled: computed(() => !!wsId.value),
  })

  const passwords = computed(() => query.data.value ?? [])
  const loading = computed(() => query.isLoading.value)

  async function fetchPasswords(opts?: { force?: boolean }) {
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: ['workspace-passwords', wsId.value] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['workspace-passwords', wsId.value] })
    }
  }

  async function addPassword(
    url: string,
    username: string,
    password: string,
    name: string,
    opts?: { type?: CredentialType; agentAccess?: AgentAccessPolicy },
  ): Promise<PasswordEntry | null> {
    const id = wsId.value
    if (!id) return null
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('create_workspace_password', {
        p_workspace_id: id,
        p_name: name,
        p_url: url,
        p_username: username,
        p_password: password,
        p_is_weak: isWeakPassword(password),
        p_type: opts?.type ?? 'login',
        p_agent_access: opts?.agentAccess ?? 'consent_required',
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      queryClient.setQueryData(['workspace-passwords', id], (old: PasswordEntry[] | undefined) =>
        [entry, ...(old ?? [])],
      )
      // The unified Vault-B credentials list is a separate query slot; new rows
      // must land there too so the credentials table updates without a refetch.
      queryClient.setQueryData(['workspace-credentials', id], (old: PasswordEntry[] | undefined) =>
        [entry, ...(old ?? [])],
      )
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('vault.passwords.errors.saveFailed')
      return null
    }
  }

  // NOTE: there is deliberately no client-side password reveal. Passwords are
  // encrypted at rest in Supabase Vault and can only be decrypted server-side
  // (service-role) for agent injection — the get_workspace_password_secret RPC
  // has been dropped and its client EXECUTE grant revoked (SOC 2). The browser
  // never receives a stored plaintext password.

  async function updatePassword(
    pwdId: string,
    name: string,
    url: string,
    username: string,
    password?: string,
    opts?: { type?: CredentialType; agentAccess?: AgentAccessPolicy },
  ): Promise<PasswordEntry | null> {
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('update_workspace_password', {
        p_password_id: pwdId,
        p_name: name,
        p_url: url,
        p_username: username,
        p_password: password ?? undefined,
        p_is_weak: password !== undefined ? isWeakPassword(password) : undefined,
        p_type: opts?.type ?? undefined,
        p_agent_access: opts?.agentAccess ?? undefined,
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      const id = wsId.value
      if (id) {
        const patch = (old: PasswordEntry[] | undefined) => {
          const arr = [...(old ?? [])]
          const idx = arr.findIndex(p => p.id === pwdId)
          if (idx !== -1) arr[idx] = entry
          return arr
        }
        queryClient.setQueryData(['workspace-passwords', id], patch)
        queryClient.setQueryData(['workspace-credentials', id], patch)
      }
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('vault.passwords.errors.updateFailed')
      return null
    }
  }

  async function importPasswords(
    entries: Array<{ name: string; url: string; username: string; password: string }>,
  ): Promise<{ imported: number; failed: number }> {
    let imported = 0
    let failed = 0
    error.value = null

    for (const entry of entries) {
      const result = await addPassword(entry.url, entry.username, entry.password, entry.name)
      if (result) imported++
      else failed++
    }

    const id = wsId.value
    if (id) {
      await queryClient.invalidateQueries({ queryKey: ['workspace-passwords', id] })
    }

    return { imported, failed }
  }

  async function deletePassword(pwdId: string): Promise<boolean> {
    error.value = null
    try {
      const { error: err } = await supabase.rpc('delete_workspace_password', {
        p_password_id: pwdId,
      })
      if (err) throw err
      const id = wsId.value
      if (id) {
        const drop = (old: PasswordEntry[] | undefined) => (old ?? []).filter(p => p.id !== pwdId)
        queryClient.setQueryData(['workspace-passwords', id], drop)
        queryClient.setQueryData(['workspace-credentials', id], drop)
      }
      return true
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('vault.passwords.errors.deleteFailed')
      return false
    }
  }

  return {
    passwords,
    loading,
    error,
    fetchPasswords,
    addPassword,
    importPasswords,
    updatePassword,
    deletePassword,
  }
}
