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

export interface WorkspaceInvitation {
  id: string
  workspace_id: string
  email: string
  role: 'admin' | 'member'
  token: string
  invited_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
}

const STORAGE_KEY = 'polymux_current_workspace_id'

export const WORKSPACE_NAME_MAX_LENGTH = 20
const WORKSPACE_NAME_PATTERN = /^[A-Za-z0-9 ]+$/

export function validateWorkspaceName(name: string): { ok: true } | { ok: false; error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Workspace name is required.' }
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return { ok: false, error: `Workspace name must be ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer.` }
  }
  if (!WORKSPACE_NAME_PATTERN.test(trimmed)) {
    return { ok: false, error: 'Only letters, numbers, and spaces are allowed.' }
  }
  return { ok: true }
}

export function useWorkspaces() {
  const workspaces = useState<Workspace[]>('workspaces', () => [])
  const currentWorkspaceId = useState<string | null>('current-workspace-id', () => {
    if (import.meta.server) return null
    return localStorage.getItem(STORAGE_KEY)
  })
  const members = useState<WorkspaceMember[]>('workspace-members', () => [])
  const invitations = useState<WorkspaceInvitation[]>('workspace-invitations', () => [])
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

  async function updateWorkspace(workspaceID: string, patch: { name?: string, avatar_url?: string | null }): Promise<Workspace | null> {
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name
    if (patch.avatar_url !== undefined) body.avatar_url = patch.avatar_url ?? ''
    try {
      const ws = await authFetch<Workspace>(`/workspaces/${workspaceID}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const idx = workspaces.value.findIndex(w => w.id === workspaceID)
      if (idx !== -1) workspaces.value[idx] = { ...ws, role: workspaces.value[idx]!.role }
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

  async function transferOwnership(workspaceID: string, newOwnerID: string, currentOwnerID: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const promoted = await authFetch<WorkspaceMember>(`/workspaces/${workspaceID}/members/${newOwnerID}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'owner' }),
      })
      const demoted = await authFetch<WorkspaceMember>(`/workspaces/${workspaceID}/members/${currentOwnerID}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      })
      const newIdx = members.value.findIndex(m => m.user_id === newOwnerID)
      if (newIdx !== -1) members.value[newIdx] = promoted
      const curIdx = members.value.findIndex(m => m.user_id === currentOwnerID)
      if (curIdx !== -1) members.value[curIdx] = demoted
      await fetchWorkspaces()
      return { ok: true }
    }
    catch (err) {
      console.error('[useWorkspaces] transferOwnership failed', err)
      return { ok: false, error: 'transfer_failed' }
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

  async function leaveWorkspace(workspaceID: string, userID: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await authFetch(`/workspaces/${workspaceID}/members/${userID}`, { method: 'DELETE' })
      workspaces.value = workspaces.value.filter(w => w.id !== workspaceID)
      members.value = members.value.filter(m => m.user_id !== userID)
      if (currentWorkspaceId.value === workspaceID && workspaces.value.length > 0) {
        persistWorkspaceId(workspaces.value[0]!.id)
      }
      await fetchWorkspaces()
      return { ok: true }
    }
    catch (err) {
      console.error('[useWorkspaces] leaveWorkspace failed', err)
      return { ok: false, error: 'leave_failed' }
    }
  }

  async function fetchInvitations(workspaceID: string) {
    try {
      const data = await authFetch<WorkspaceInvitation[]>(`/workspaces/${workspaceID}/invitations`)
      invitations.value = data ?? []
    }
    catch (err) {
      console.error('[useWorkspaces] fetchInvitations failed', err)
    }
  }

  async function inviteMember(workspaceID: string, email: string, role: 'admin' | 'member' = 'member'): Promise<WorkspaceInvitation | null> {
    try {
      const invitation = await authFetch<WorkspaceInvitation>(`/workspaces/${workspaceID}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      })
      const idx = invitations.value.findIndex(i => i.id === invitation.id)
      if (idx !== -1) invitations.value[idx] = invitation
      else invitations.value = [invitation, ...invitations.value]
      return invitation
    }
    catch (err) {
      console.error('[useWorkspaces] inviteMember failed', err)
      return null
    }
  }

  async function resendInvitation(workspaceID: string, invitationID: string): Promise<WorkspaceInvitation | null> {
    try {
      const invitation = await authFetch<WorkspaceInvitation>(`/workspaces/${workspaceID}/invitations/${invitationID}/resend`, {
        method: 'POST',
      })
      const idx = invitations.value.findIndex(i => i.id === invitationID)
      if (idx !== -1) invitations.value[idx] = invitation
      return invitation
    }
    catch (err) {
      console.error('[useWorkspaces] resendInvitation failed', err)
      return null
    }
  }

  async function revokeInvitation(workspaceID: string, invitationID: string): Promise<boolean> {
    try {
      await authFetch(`/workspaces/${workspaceID}/invitations/${invitationID}`, { method: 'DELETE' })
      invitations.value = invitations.value.filter(i => i.id !== invitationID)
      return true
    }
    catch (err) {
      console.error('[useWorkspaces] revokeInvitation failed', err)
      return false
    }
  }

  return {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    members,
    invitations,
    fetchWorkspaces,
    createWorkspace,
    switchWorkspace,
    updateWorkspace,
    deleteWorkspace,
    fetchMembers,
    addMember,
    updateMemberRole,
    transferOwnership,
    removeMember,
    leaveWorkspace,
    fetchInvitations,
    inviteMember,
    resendInvitation,
    revokeInvitation,
  }
}
