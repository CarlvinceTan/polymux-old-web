export interface PasswordEntry {
  id: string
  name: string
  url: string
  username: string
  lastUsed: string
  usageCount: number
  weak: boolean
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
  usage_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

function toEntry(row: WorkspacePasswordRow): PasswordEntry {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    lastUsed: row.last_used_at ?? row.created_at,
    usageCount: row.usage_count,
    weak: row.is_weak,
  }
}

export function isWeakPassword(password: string): boolean {
  if (password.length < 8) return true
  if (!/[A-Z]/.test(password)) return true
  if (!/[0-9]/.test(password)) return true
  if (!/[^A-Za-z0-9]/.test(password)) return true
  return false
}

export function usePasswords() {
  const supabase = useSupabaseClient()
  const { currentWorkspace } = useWorkspaces()

  const passwords = useState<PasswordEntry[]>('workspace-passwords', () => [])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPasswords() {
    const wsId = currentWorkspace.value?.id
    if (!wsId) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('workspace_passwords')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false })
      if (err) throw err
      passwords.value = (data as WorkspacePasswordRow[]).map(toEntry)
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to load passwords'
    }
    finally {
      loading.value = false
    }
  }

  async function addPassword(
    url: string,
    username: string,
    password: string,
    name: string,
  ): Promise<PasswordEntry | null> {
    const wsId = currentWorkspace.value?.id
    if (!wsId) return null
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('create_workspace_password', {
        p_workspace_id: wsId,
        p_name: name,
        p_url: url,
        p_username: username,
        p_password: password,
        p_is_weak: isWeakPassword(password),
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      passwords.value.unshift(entry)
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to save password'
      return null
    }
  }

  async function revealPassword(id: string): Promise<string | null> {
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('get_workspace_password_secret', {
        p_password_id: id,
      })
      if (err) throw err
      // Update local usage stats
      const idx = passwords.value.findIndex(p => p.id === id)
      if (idx !== -1) {
        passwords.value[idx] = {
          ...passwords.value[idx]!,
          usageCount: (passwords.value[idx]!.usageCount ?? 0) + 1,
          lastUsed: new Date().toISOString(),
        }
      }
      return data as string
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to reveal password'
      return null
    }
  }

  async function updatePassword(
    id: string,
    name: string,
    url: string,
    username: string,
    password?: string,
  ): Promise<PasswordEntry | null> {
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('update_workspace_password', {
        p_password_id: id,
        p_name: name,
        p_url: url,
        p_username: username,
        p_password: password ?? null,
        p_is_weak: password !== undefined ? isWeakPassword(password) : null,
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      const idx = passwords.value.findIndex(p => p.id === id)
      if (idx !== -1) passwords.value[idx] = entry
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to update password'
      return null
    }
  }

  async function deletePassword(id: string): Promise<boolean> {
    error.value = null
    try {
      const { error: err } = await supabase.rpc('delete_workspace_password', {
        p_password_id: id,
      })
      if (err) throw err
      passwords.value = passwords.value.filter(p => p.id !== id)
      return true
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to delete password'
      return false
    }
  }

  return {
    passwords,
    loading,
    error,
    fetchPasswords,
    addPassword,
    revealPassword,
    updatePassword,
    deletePassword,
  }
}
