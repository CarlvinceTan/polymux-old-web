import { computed } from 'vue'
import { useState } from '#imports'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useWorkspaces } from '../account/useWorkspaces'

// A "general chat" is a standalone conversation with the workspace's general
// assistant — distinct from a workflow's own
// orchestrator chat. Backed by the dedicated `chats` table (see the Go server's
// /workspaces/{id}/chats endpoints); archiving is a soft state via archived_at.
export interface GeneralChat {
  id: string
  workspace_id: string
  title: string
  created_by?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  last_message_at?: string | null
}

// Workspace-scoped, shared across the Sidebar + the Archive modal so both read
// the same list. Keyed only by composable name — the fetchers take the active
// workspace id so a switch just refetches.
export function useWorkspaceChatList() {
  const { authFetch } = useAuthFetch()
  const { currentWorkspaceId } = useWorkspaces()

  const chats = useState<GeneralChat[]>('general-chats', () => [])
  const archivedChats = useState<GeneralChat[]>('general-chats-archived', () => [])
  const chatsLoading = useState<boolean>('general-chats-loading', () => false)

  function wsId(): string | null {
    return currentWorkspaceId.value ?? null
  }

  async function fetchChats(): Promise<void> {
    const id = wsId()
    if (!id) return
    chatsLoading.value = true
    try {
      chats.value = await authFetch<GeneralChat[]>(`/workspaces/${id}/chats`)
    }
    catch {
      // Leave the last-known list in place on a transient failure.
    }
    finally {
      chatsLoading.value = false
    }
  }

  async function fetchArchivedChats(): Promise<void> {
    const id = wsId()
    if (!id) return
    archivedChats.value = await authFetch<GeneralChat[]>(`/workspaces/${id}/chats?archived=true`)
  }

  async function createChat(title?: string): Promise<GeneralChat | null> {
    const id = wsId()
    if (!id) return null
    const chat = await authFetch<GeneralChat>(`/workspaces/${id}/chats`, {
      method: 'POST',
      body: JSON.stringify({ title: title ?? '' }),
    })
    chats.value = [chat, ...chats.value]
    return chat
  }

  async function renameChat(chatId: string, title: string): Promise<void> {
    const id = wsId()
    if (!id) return
    const updated = await authFetch<GeneralChat>(`/workspaces/${id}/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
    chats.value = chats.value.map(c => (c.id === chatId ? updated : c))
  }

  // Soft-archive: removes the chat from the active list and drops it into the
  // archive (lazily refetched by the modal when opened).
  async function archiveChat(chatId: string): Promise<void> {
    const id = wsId()
    if (!id) return
    await authFetch(`/workspaces/${id}/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'archive' }),
    })
    chats.value = chats.value.filter(c => c.id !== chatId)
  }

  async function unarchiveChat(chatId: string): Promise<void> {
    const id = wsId()
    if (!id) return
    const updated = await authFetch<GeneralChat>(`/workspaces/${id}/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'unarchive' }),
    })
    archivedChats.value = archivedChats.value.filter(c => c.id !== chatId)
    chats.value = [updated, ...chats.value]
  }

  async function deleteChat(chatId: string): Promise<void> {
    const id = wsId()
    if (!id) return
    await authFetch(`/workspaces/${id}/chats/${chatId}`, { method: 'DELETE' })
    chats.value = chats.value.filter(c => c.id !== chatId)
    archivedChats.value = archivedChats.value.filter(c => c.id !== chatId)
  }

  // Permanently delete every archived chat.
  async function clearArchive(): Promise<void> {
    const id = wsId()
    if (!id) return
    await authFetch(`/workspaces/${id}/chats/clear-archive`, { method: 'POST' })
    archivedChats.value = []
  }

  return {
    chats: computed(() => chats.value),
    archivedChats: computed(() => archivedChats.value),
    chatsLoading: computed(() => chatsLoading.value),
    fetchChats,
    fetchArchivedChats,
    createChat,
    renameChat,
    archiveChat,
    unarchiveChat,
    deleteChat,
    clearArchive,
  }
}

export type WorkspaceChatListHandle = ReturnType<typeof useWorkspaceChatList>
