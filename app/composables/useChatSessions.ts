import type { ChatMessage, ChatMessageAttachment } from './types'

export const DRAFT_SESSION_ID = 'new'

export interface ChatSession {
  id: string
  title: string
  user_id: string
  workspace_id: string
  created_at: string
  updated_at: string
  is_draft?: boolean
}

interface StoredMessage {
  id: string
  session_id: string
  role: string
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface PendingDraftPrompt {
  text: string
  attachments?: ChatMessageAttachment[]
}

function draftStorageKey(workspaceID: string): string {
  return `polymux_draft_workflow:${workspaceID}`
}

function pendingPromptKey(sessionID: string): string {
  return `polymux_pending_prompt:${sessionID}`
}

export function useChatSessions() {
  const realSessions = useState<ChatSession[]>('chat-sessions', () => [])
  const draft = useState<ChatSession | null>('chat-draft-session', () => null)
  const { authFetch } = useAuthFetch()

  const { currentWorkspaceId } = useWorkspaces()
  const currentUser = useSupabaseUser()

  // Hide other members' in-progress "New Workflow" rows (briefly present during
  // another user's first-prompt promotion). The caller's own drafts live purely
  // on the client and never appear here.
  function visibleReal(all: ChatSession[]): ChatSession[] {
    const me = currentUser.value?.id
    return all.filter(s => s.title !== 'New Workflow' || s.user_id === me)
  }

  const sessions = computed<ChatSession[]>(() => {
    const real = realSessions.value
    return draft.value ? [draft.value, ...real] : real
  })

  async function fetchSessions() {
    try {
      const wsId = currentWorkspaceId.value
      const path = wsId ? `/sessions?workspace_id=${wsId}` : '/sessions'
      const data = await authFetch<ChatSession[]>(path)
      realSessions.value = visibleReal(data ?? [])
    } catch (err) {
      console.error('[useChatSessions] fetchSessions failed', err)
    }
  }

  function persistDraft(d: ChatSession | null) {
    if (!import.meta.client) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    const key = draftStorageKey(wsId)
    if (d) {
      try { sessionStorage.setItem(key, JSON.stringify(d)) } catch {}
    } else {
      try { sessionStorage.removeItem(key) } catch {}
    }
  }

  function restoreDraft() {
    if (!import.meta.client) return
    const wsId = currentWorkspaceId.value
    if (!wsId) return  // workspace not loaded yet — leave draft untouched
    // If a draft already exists for this workspace in memory, keep it (avoid
    // clobbering a freshly-created draft whose persist hasn't been read back).
    if (draft.value && draft.value.workspace_id === wsId) return
    try {
      const raw = sessionStorage.getItem(draftStorageKey(wsId))
      draft.value = raw ? (JSON.parse(raw) as ChatSession) : null
    } catch {
      draft.value = null
    }
  }

  function createDraft(): ChatSession | null {
    if (draft.value) return draft.value
    const wsId = currentWorkspaceId.value ?? ''
    const me = currentUser.value?.id ?? ''
    const now = new Date().toISOString()
    const d: ChatSession = {
      id: DRAFT_SESSION_ID,
      title: 'New Workflow',
      user_id: me,
      workspace_id: wsId,
      created_at: now,
      updated_at: now,
      is_draft: true,
    }
    draft.value = d
    persistDraft(d)
    return d
  }

  function dropDraft() {
    draft.value = null
    persistDraft(null)
  }

  // Create the backing session row for the current draft and drop the draft.
  // Called on the user's first prompt send in the draft UI.
  async function promoteDraft(): Promise<ChatSession | null> {
    const wsId = currentWorkspaceId.value
    if (!wsId) {
      console.error('[useChatSessions] promoteDraft: no workspace')
      return null
    }
    try {
      const s = await authFetch<ChatSession>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Workflow', workspace_id: wsId }),
      })
      realSessions.value = [s, ...realSessions.value.filter(x => x.id !== s.id)]
      dropDraft()
      return s
    } catch (err) {
      console.error('[useChatSessions] promoteDraft failed', err)
      return null
    }
  }

  async function renameSession(id: string, title: string) {
    if (id === DRAFT_SESSION_ID) return
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await authFetch(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      })
      const s = realSessions.value.find(s => s.id === id)
      if (s) s.title = trimmed
    } catch (err) {
      console.error('[useChatSessions] renameSession failed', err)
    }
  }

  async function deleteSession(id: string) {
    if (id === DRAFT_SESSION_ID) {
      dropDraft()
      return
    }
    try {
      await authFetch(`/sessions/${id}`, { method: 'DELETE' })
      realSessions.value = realSessions.value.filter(s => s.id !== id)
    } catch (err) {
      console.error('[useChatSessions] deleteSession failed', err)
    }
  }

  // Fire-and-forget backend delete for a real session that was never committed
  // to (no messages persisted). Called on route leave from an unused workflow.
  async function deleteSessionIfEmpty(id: string) {
    if (id === DRAFT_SESSION_ID) {
      dropDraft()
      return
    }
    const supabase = useSupabaseClient()
    const config = useRuntimeConfig()
    const baseURL = config.public.serverUrl as string
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch(`${baseURL}/sessions/${id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      realSessions.value = realSessions.value.filter(s => s.id !== id)
    }
    catch (err) {
      console.error('[useChatSessions] deleteSessionIfEmpty failed', err)
    }
  }

  async function fetchMessages(sessionId: string, agentId?: string): Promise<ChatMessage[]> {
    if (sessionId === DRAFT_SESSION_ID) return []
    try {
      let path = `/sessions/${sessionId}/messages`
      if (agentId) path += `?agent_id=eq.${agentId}`
      const data = await authFetch<StoredMessage[]>(path)
      if (!data || data.length === 0) return []
      return data
        .filter(m => m.role === 'user' || m.role === 'agent')
        .map(m => ({
          role: m.role as ChatMessage['role'],
          text: m.content,
          attachments: (m.metadata as any)?.attachments,
        }))
    } catch (err) {
      console.error('[useChatSessions] fetchMessages failed', err)
      return []
    }
  }

  function setPendingPrompt(sessionID: string, prompt: PendingDraftPrompt) {
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(pendingPromptKey(sessionID), JSON.stringify(prompt))
    } catch {}
  }

  function consumePendingPrompt(sessionID: string): PendingDraftPrompt | null {
    if (!import.meta.client) return null
    try {
      const raw = sessionStorage.getItem(pendingPromptKey(sessionID))
      if (!raw) return null
      sessionStorage.removeItem(pendingPromptKey(sessionID))
      return JSON.parse(raw) as PendingDraftPrompt
    } catch {
      return null
    }
  }

  return {
    sessions,
    realSessions,
    draft,
    fetchSessions,
    createDraft,
    dropDraft,
    promoteDraft,
    restoreDraft,
    renameSession,
    deleteSession,
    deleteSessionIfEmpty,
    fetchMessages,
    setPendingPrompt,
    consumePendingPrompt,
  }
}
