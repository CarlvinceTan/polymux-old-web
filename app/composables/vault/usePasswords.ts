export interface PasswordEntry {
  id: string
  name: string
  url: string
  username: string
  lastUsed: string
  usageCount: number
  weak: boolean
  // Provenance — surfaced on the card so workspace members can see at a
  // glance who added this credential and who used it most recently. UUIDs;
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
    lastUsed: row.last_used_at ?? row.created_at,
    usageCount: row.usage_count,
    weak: row.is_weak,
    createdBy: row.created_by,
    lastUsedBy: row.last_used_by,
    createdAt: row.created_at,
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
  const user = useSupabaseUser()
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
      const { data, error: err } = await supabase
        .from('workspace_passwords')
        .select('*')
        .eq('workspace_id', id)
        .order('created_at', { ascending: false })
      if (err) throw err
      return (data as WorkspacePasswordRow[]).map(toEntry)
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
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      queryClient.setQueryData(['workspace-passwords', id], (old: PasswordEntry[] | undefined) =>
        [entry, ...(old ?? [])],
      )
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to save password'
      return null
    }
  }

  async function revealPassword(pwdId: string): Promise<string | null> {
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('get_workspace_password_secret', {
        p_password_id: pwdId,
      })
      if (err) throw err
      let userId: string | undefined = user.value?.id
      if (!userId) {
        const { data: authData } = await supabase.auth.getUser()
        userId = authData?.user?.id
      }
      const id = wsId.value
      if (id) {
        queryClient.setQueryData(['workspace-passwords', id], (old: PasswordEntry[] | undefined) => {
          const arr = [...(old ?? [])]
          const idx = arr.findIndex(p => p.id === pwdId)
          if (idx !== -1) {
            arr[idx] = {
              ...arr[idx]!,
              usageCount: (arr[idx]!.usageCount ?? 0) + 1,
              lastUsed: new Date().toISOString(),
              lastUsedBy: userId ?? arr[idx]!.lastUsedBy,
            }
          }
          return arr
        })
      }
      return data as string
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to reveal password'
      return null
    }
  }

  async function updatePassword(
    pwdId: string,
    name: string,
    url: string,
    username: string,
    password?: string,
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
      })
      if (err) throw err
      const entry = toEntry(data as WorkspacePasswordRow)
      const id = wsId.value
      if (id) {
        queryClient.setQueryData(['workspace-passwords', id], (old: PasswordEntry[] | undefined) => {
          const arr = [...(old ?? [])]
          const idx = arr.findIndex(p => p.id === pwdId)
          if (idx !== -1) arr[idx] = entry
          return arr
        })
      }
      return entry
    }
    catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Failed to update password'
      return null
    }
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
        queryClient.setQueryData(['workspace-passwords', id], (old: PasswordEntry[] | undefined) =>
          (old ?? []).filter(p => p.id !== pwdId),
        )
      }
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
