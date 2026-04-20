export interface Workspace {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  plan: string
  role: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  invited_by: string | null
  joined_at: string
  display_name?: string
  email?: string
}

const STORAGE_KEY = 'polymux_current_workspace_id'

export function useWorkspaces() {
  const workspaces = useState<Workspace[]>('workspaces', () => [])
  const currentWorkspaceId = useState<string | null>('current-workspace-id', () => {
    if (import.meta.server) return null
    return localStorage.getItem(STORAGE_KEY)
  })
  const members = useState<WorkspaceMember[]>('workspace-members', () => [])
  const { authFetch } = useAuthFetch()

  const currentWorkspace = computed(() =>
    workspaces.value.find(w => w.id === currentWorkspaceId.value) ?? workspaces.value[0] ?? null,
  )

  function persistWorkspaceId(id: string) {
    currentWorkspaceId.value = id
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, id)
    }
  }

  async function fetchWorkspaces() {
    try {
      const data = await authFetch<Workspace[]>('/workspaces')
      workspaces.value = data ?? []

      if (workspaces.value.length > 0 && !workspaces.value.find(w => w.id === currentWorkspaceId.value)) {
        persistWorkspaceId(workspaces.value[0]!.id)
      }
    }
    catch (err) {
      console.error('[useWorkspaces] fetchWorkspaces failed', err)
    }
  }

  async function createWorkspace(name: string, slug: string): Promise<Workspace | null> {
    try {
      const ws = await authFetch<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name, slug }),
      })
      // Re-fetch to get the full list including the new workspace (with membership)
      await fetchWorkspaces()
      persistWorkspaceId(ws.id)
      return ws
    }
    catch (err) {
      console.error('[useWorkspaces] createWorkspace failed', err)
      return null
    }
  }

  function switchWorkspace(id: string) {
    persistWorkspaceId(id)
  }

  async function updateWorkspace(workspaceID: string, name: string): Promise<Workspace | null> {
    try {
      const ws = await authFetch<Workspace>(`/workspaces/${workspaceID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      const idx = workspaces.value.findIndex(w => w.id === workspaceID)
      if (idx !== -1) workspaces.value[idx] = ws
      return ws
    }
    catch (err) {
      console.error('[useWorkspaces] updateWorkspace failed', err)
      return null
    }
  }

  async function deleteWorkspace(workspaceID: string): Promise<{ ok: boolean; error?: string }> {
    if (workspaces.value.length <= 1) {
      console.warn('[useWorkspaces] prevented deletion of last workspace')
      return { ok: false, error: 'cannot_delete_last_workspace' }
    }
    try {
      await authFetch(`/workspaces/${workspaceID}`, { method: 'DELETE' })
      workspaces.value = workspaces.value.filter(w => w.id !== workspaceID)
      if (currentWorkspaceId.value === workspaceID && workspaces.value.length > 0) {
        persistWorkspaceId(workspaces.value[0]!.id)
      }
      return { ok: true }
    }
    catch (err) {
      console.error('[useWorkspaces] deleteWorkspace failed', err)
      return { ok: false, error: 'delete_failed' }
    }
  }

  async function fetchMembers(workspaceID: string) {
    try {
      const data = await authFetch<WorkspaceMember[]>(`/workspaces/${workspaceID}/members`)
      members.value = data ?? []
    }
    catch (err) {
      console.error('[useWorkspaces] fetchMembers failed', err)
    }
  }

  async function addMember(workspaceID: string, userID: string, role: string = 'member'): Promise<WorkspaceMember | null> {
    try {
      const member = await authFetch<WorkspaceMember>(`/workspaces/${workspaceID}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userID, role }),
      })
      members.value = [...members.value, member]
      return member
    }
    catch (err) {
      console.error('[useWorkspaces] addMember failed', err)
      return null
    }
  }

  async function updateMemberRole(workspaceID: string, userID: string, role: string): Promise<WorkspaceMember | null> {
    try {
      const member = await authFetch<WorkspaceMember>(`/workspaces/${workspaceID}/members/${userID}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      const idx = members.value.findIndex(m => m.user_id === userID)
      if (idx !== -1) members.value[idx] = member
      return member
    }
    catch (err) {
      console.error('[useWorkspaces] updateMemberRole failed', err)
      return null
    }
  }

  async function removeMember(workspaceID: string, userID: string) {
    try {
      await authFetch(`/workspaces/${workspaceID}/members/${userID}`, { method: 'DELETE' })
      members.value = members.value.filter(m => m.user_id !== userID)
    }
    catch (err) {
      console.error('[useWorkspaces] removeMember failed', err)
    }
  }

  return {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    members,
    fetchWorkspaces,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    deleteWorkspace,
    fetchMembers,
    addMember,
    updateMemberRole,
    removeMember,
  }
}
