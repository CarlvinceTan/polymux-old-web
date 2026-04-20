import type { ChatMessage } from './types'

export interface ChatSession {
  id: string
  title: string
  user_id: string
  workspace_id: string
  created_at: string
  updated_at: string
}

interface StoredMessage {
  id: string
  session_id: string
  role: string
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export function useChatSessions() {
  const sessions = useState<ChatSession[]>('chat-sessions', () => [])
  const { authFetch } = useAuthFetch()

  const { currentWorkspaceId } = useWorkspaces()
  const { ensureAuth } = useGuestAuth()

  async function fetchSessions() {
    try {
      const wsId = currentWorkspaceId.value
      const path = wsId ? `/sessions?workspace_id=${wsId}` : '/sessions'
      const data = await authFetch<ChatSession[]>(path)
      const all = data ?? []
      let seenNewChat = false
      const deduped = all.filter(s => {
        if (s.title === 'New Chat') {
          if (seenNewChat) return false
          seenNewChat = true
        }
        return true
      })
      sessions.value = deduped
    } catch (err) {
      console.error('[useChatSessions] fetchSessions failed', err)
    }
  }

  async function createSession(title?: string): Promise<ChatSession | null> {
    await ensureAuth()
    const resolved = title?.trim() || 'New Chat'
    if (resolved === 'New Chat' && sessions.value.some(s => s.title === 'New Chat')) {
      return sessions.value.find(s => s.title === 'New Chat')!
    }
    const wsId = currentWorkspaceId.value
    if (!wsId) {
      console.error('[useChatSessions] no current workspace')
      return null
    }
    try {
      const s = await authFetch<ChatSession>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: resolved, workspace_id: wsId }),
      })
      sessions.value = [s, ...sessions.value]
      return s
    } catch (err) {
      console.error('[useChatSessions] createSession failed', err)
      return null
    }
  }

  async function renameSession(id: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await authFetch(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      })
      const s = sessions.value.find(s => s.id === id)
      if (s) s.title = trimmed
    } catch (err) {
      console.error('[useChatSessions] renameSession failed', err)
    }
  }

  async function deleteSession(id: string) {
    try {
      await authFetch(`/sessions/${id}`, { method: 'DELETE' })
      sessions.value = sessions.value.filter(s => s.id !== id)
    } catch (err) {
      console.error('[useChatSessions] deleteSession failed', err)
    }
  }

  async function replaceSession(oldId: string, title: string): Promise<ChatSession | null> {
    const wsId = currentWorkspaceId.value
    if (!wsId) {
      console.error('[useChatSessions] no current workspace')
      return null
    }
    try {
      const s = await authFetch<ChatSession>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() || 'New Chat', workspace_id: wsId }),
      })
      sessions.value = sessions.value.map(sess => sess.id === oldId ? s : sess)
      return s
    } catch (err) {
      console.error('[useChatSessions] replaceSession failed', err)
      return null
    }
  }

  async function fetchMessages(sessionId: string, agentId?: string): Promise<ChatMessage[]> {
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

  return { sessions, fetchSessions, createSession, renameSession, deleteSession, replaceSession, fetchMessages }
}
