import { watch } from 'vue'
import { readCachedMemberCount, readCachedWorkspaceName, writeCachedMemberCount, writeCachedWorkspacePlans } from '~/utils/uiPolicyCache'

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

/** Display name for a member: explicit name, else email local-part, else a short user-id stub. */
export function memberDisplayName(m: WorkspaceMember): string {
  return m.display_name || m.email?.split('@')[0] || `${m.user_id.substring(0, 8)}…`
}

/** Member email, or an em-dash placeholder when absent. */
export function memberEmail(m: WorkspaceMember): string {
  return m.email || '—'
}

/** Up-to-two-letter uppercase initials for a member avatar. */
export function memberInitials(m: WorkspaceMember): string {
  const name = m.display_name || m.email || m.user_id
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
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

// InviteError carries the structured failure shape from the Go API so the UI
// can branch on `code === 'MEMBER_LIMIT_REACHED'` instead of parsing prose.
// `error` always populated, other fields present only when the server
// returned them (currently only on MEMBER_LIMIT_REACHED).
export interface InviteError {
  ok: false
  error: string
  code?: string
  plan?: string
  used?: number
  cap?: number
  members?: number
  pending?: number
}

function parseInviteError(err: unknown): InviteError {
  const { t } = useI18n()
  // ofetch surfaces server response bodies under `data` on the thrown
  // FetchError. We accept anything that looks like the Go API's JSON error
  // envelope; fall back to a generic message for transport-level failures.
  const e = err as { data?: Partial<InviteError>; message?: string } | null
  const data = e?.data
  if (data && typeof data === 'object' && typeof data.error === 'string') {
    return {
      ok: false,
      error: data.error,
      code: data.code,
      plan: data.plan,
      used: data.used,
      cap: data.cap,
      members: data.members,
      pending: data.pending,
    }
  }
  return { ok: false, error: e?.message || t('workspaceCreate.inviteFailed') }
}

export function isInviteError(value: WorkspaceInvitation | InviteError | null): value is InviteError {
  return value !== null && 'ok' in value && value.ok === false
}

const STORAGE_KEY = 'polymux_current_workspace_id'

export const WORKSPACE_NAME_MAX_LENGTH = 20
const WORKSPACE_NAME_PATTERN = /^[A-Za-z0-9 ]+$/

export function validateWorkspaceName(name: string): { ok: true } | { ok: false; error: string } {
  const { t } = useI18n()
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: t('workspaceCreate.nameRequired') }
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return { ok: false, error: t('workspaceCreate.nameTooLong', { max: WORKSPACE_NAME_MAX_LENGTH }) }
  }
  if (!WORKSPACE_NAME_PATTERN.test(trimmed)) {
    return { ok: false, error: t('workspaceCreate.nameInvalidChars') }
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
  const membersByWorkspace = useState<Record<string, WorkspaceMember[]>>('workspace-members-by-id', () => ({}))
  /** Reactive member counts for UI; seeded from localStorage, updated only when server count differs. */
  const displayMemberCounts = useState<Record<string, number>>('workspace-display-member-counts', () => ({}))
  const memberCountWatchInstalled = useState<boolean>('workspace-member-count-watch-installed', () => false)
  const invitations = useState<WorkspaceInvitation[]>('workspace-invitations', () => [])
  const { authFetch } = useAuthFetch()

  // useState is seeded on the server (null). After hydration the client payload
  // wins over the localStorage initializer, so re-read the stored id here.
  if (import.meta.client && !currentWorkspaceId.value) {
    const storedId = localStorage.getItem(STORAGE_KEY)
    if (storedId) currentWorkspaceId.value = storedId
  }

  const currentWorkspace = computed(() =>
    workspaces.value.find(w => w.id === currentWorkspaceId.value) ?? workspaces.value[0] ?? null,
  )

  const currentWorkspaceDisplayName = computed(() => {
    const wsId = currentWorkspaceId.value ?? currentWorkspace.value?.id
    if (wsId) {
      const liveName = workspaces.value.find(w => w.id === wsId)?.name?.trim()
      if (liveName) return liveName
      const cached = readCachedWorkspaceName(wsId)
      if (cached) return cached
    }
    const fallbackName = currentWorkspace.value?.name?.trim()
    if (fallbackName) return fallbackName
    return readCachedWorkspaceName(currentWorkspace.value?.id)
  })

  function activeWorkspaceId(): string | null {
    return currentWorkspaceId.value ?? currentWorkspace.value?.id ?? null
  }

  function seedDisplayMemberCount(workspaceID: string) {
    if (!import.meta.client || !workspaceID) return
    if (Object.prototype.hasOwnProperty.call(displayMemberCounts.value, workspaceID)) return
    const cached = readCachedMemberCount(workspaceID)
    if (cached !== null) {
      displayMemberCounts.value = { ...displayMemberCounts.value, [workspaceID]: cached }
    }
  }

  function resolvedDisplayMemberCount(workspaceID: string): number | null {
    if (Object.prototype.hasOwnProperty.call(displayMemberCounts.value, workspaceID)) {
      return displayMemberCounts.value[workspaceID]!
    }
    return readCachedMemberCount(workspaceID)
  }

  const currentMemberCount = computed(() => {
    const wsId = activeWorkspaceId()
    if (!wsId) return 0
    return resolvedDisplayMemberCount(wsId) ?? 0
  })

  if (import.meta.client && !memberCountWatchInstalled.value) {
    memberCountWatchInstalled.value = true
    watch(currentWorkspaceId, (id) => {
      if (id) seedDisplayMemberCount(id)
    }, { immediate: true })
    const initialId = activeWorkspaceId()
    if (initialId) seedDisplayMemberCount(initialId)
  }

  function membersForWorkspace(workspaceID: string): WorkspaceMember[] {
    return membersByWorkspace.value[workspaceID] ?? []
  }

  function hasMembersCache(workspaceID: string): boolean {
    return Object.prototype.hasOwnProperty.call(membersByWorkspace.value, workspaceID)
  }

  function syncMembersCache(workspaceID: string, list: WorkspaceMember[]) {
    const count = list.length
    membersByWorkspace.value = { ...membersByWorkspace.value, [workspaceID]: list }
    displayMemberCounts.value = { ...displayMemberCounts.value, [workspaceID]: count }
    writeCachedMemberCount(workspaceID, count)
    if (currentWorkspaceId.value === workspaceID) {
      members.value = list
    }
  }

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
      writeCachedWorkspacePlans(workspaces.value.map(w => ({ id: w.id, plan: w.plan, name: w.name })))
      for (const ws of workspaces.value) seedDisplayMemberCount(ws.id)

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
    seedDisplayMemberCount(id)
    members.value = membersForWorkspace(id)
  }

  // Resolves with the current workspace id once it becomes available. Used by
  // pages that mount before Sidebar finishes bootstrapping workspaces (e.g. a
  // deep-linked page loaded directly after an OAuth confirm, when localStorage
  // has no cached workspace id yet). Resolves null if the wait times out.
  function waitForWorkspace(timeoutMs = 10000): Promise<string | null> {
    if (currentWorkspaceId.value) return Promise.resolve(currentWorkspaceId.value)
    if (!import.meta.client) return Promise.resolve(null)
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const stop = watch(currentWorkspaceId, (id) => {
        if (!id) return
        stop()
        if (timer) clearTimeout(timer)
        resolve(id)
      })
      timer = setTimeout(() => {
        stop()
        resolve(null)
      }, timeoutMs)
    })
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
      writeCachedWorkspacePlans([{ id: workspaceID, plan: ws.plan, name: ws.name }])
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

  async function fetchMembers(workspaceID: string, opts?: { force?: boolean }) {
    seedDisplayMemberCount(workspaceID)

    try {
      const data = await authFetch<WorkspaceMember[]>(`/workspaces/${workspaceID}/members`)
      const list = data ?? []
      const newCount = list.length
      const previousCount = resolvedDisplayMemberCount(workspaceID)
      const countChanged = previousCount === null || previousCount !== newCount

      if (opts?.force || !hasMembersCache(workspaceID) || countChanged) {
        syncMembersCache(workspaceID, list)
      }
      else {
        writeCachedMemberCount(workspaceID, newCount)
        if (!Object.prototype.hasOwnProperty.call(displayMemberCounts.value, workspaceID)) {
          displayMemberCounts.value = { ...displayMemberCounts.value, [workspaceID]: newCount }
        }
      }
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
      syncMembersCache(workspaceID, [...membersForWorkspace(workspaceID), member])
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
      const list = membersForWorkspace(workspaceID)
      const idx = list.findIndex(m => m.user_id === userID)
      if (idx !== -1) {
        const next = [...list]
        next[idx] = member
        syncMembersCache(workspaceID, next)
      }
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
      let list = [...membersForWorkspace(workspaceID)]
      const newIdx = list.findIndex(m => m.user_id === newOwnerID)
      if (newIdx !== -1) list[newIdx] = promoted
      const curIdx = list.findIndex(m => m.user_id === currentOwnerID)
      if (curIdx !== -1) list[curIdx] = demoted
      syncMembersCache(workspaceID, list)
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
      syncMembersCache(
        workspaceID,
        membersForWorkspace(workspaceID).filter(m => m.user_id !== userID),
      )
    }
    catch (err) {
      console.error('[useWorkspaces] removeMember failed', err)
    }
  }

  async function leaveWorkspace(workspaceID: string, userID: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await authFetch(`/workspaces/${workspaceID}/members/${userID}`, { method: 'DELETE' })
      workspaces.value = workspaces.value.filter(w => w.id !== workspaceID)
      const nextCache = { ...membersByWorkspace.value }
      delete nextCache[workspaceID]
      membersByWorkspace.value = nextCache
      const nextDisplay = { ...displayMemberCounts.value }
      delete nextDisplay[workspaceID]
      displayMemberCounts.value = nextDisplay
      if (currentWorkspaceId.value === workspaceID) {
        members.value = []
      }
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

  async function inviteMember(workspaceID: string, email: string, role: 'admin' | 'member' = 'member'): Promise<WorkspaceInvitation | InviteError> {
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
      return parseInviteError(err)
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
    currentWorkspaceDisplayName,
    currentWorkspaceId,
    currentMemberCount,
    members,
    invitations,
    fetchWorkspaces,
    createWorkspace,
    switchWorkspace,
    waitForWorkspace,
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
