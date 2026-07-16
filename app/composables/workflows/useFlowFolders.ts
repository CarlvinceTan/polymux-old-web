export interface FlowFolder {
  id: string
  workspace_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

interface FlowFolderPayload {
  folders: FlowFolder[]
  assignments: Record<string, string | null>
}

interface PendingDraftFolder {
  flowId: string
  folderId: string
  workspaceId: string
}

const PENDING_DRAFT_FOLDER_KEY = 'polymux_pending_draft_folder'

const folderFetches = new Map<string, Promise<void>>()

export function useFlowFolders() {
  const { currentWorkspaceId } = useWorkspaces()
  const folders = useState<FlowFolder[]>('flow-folders', () => [])
  const assignments = useState<Record<string, string | null>>('flow-folder-assignments', () => ({}))
  const loadedWorkspaceId = useState<string | null>('flow-folders-workspace', () => null)
  const pendingDraftFolder = useState<PendingDraftFolder | null>('pending-draft-flow-folder', () => null)

  function persistPendingDraftFolder() {
    if (!import.meta.client) return
    try {
      if (pendingDraftFolder.value) sessionStorage.setItem(PENDING_DRAFT_FOLDER_KEY, JSON.stringify(pendingDraftFolder.value))
      else sessionStorage.removeItem(PENDING_DRAFT_FOLDER_KEY)
    }
    catch {}
  }

  function restorePendingDraftFolder() {
    if (!import.meta.client || pendingDraftFolder.value) return
    try {
      const raw = sessionStorage.getItem(PENDING_DRAFT_FOLDER_KEY)
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<PendingDraftFolder>
      if (typeof stored.flowId !== 'string' || typeof stored.folderId !== 'string' || typeof stored.workspaceId !== 'string') return
      if (currentWorkspaceId.value && stored.workspaceId !== currentWorkspaceId.value) return
      pendingDraftFolder.value = stored as PendingDraftFolder
    }
    catch {}
  }

  function setPendingDraftFolder(flowId: string, folderId: string) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return
    pendingDraftFolder.value = { flowId, folderId, workspaceId }
    persistPendingDraftFolder()
  }

  function clearPendingDraftFolder(flowId?: string) {
    if (flowId && pendingDraftFolder.value?.flowId !== flowId) return
    pendingDraftFolder.value = null
    persistPendingDraftFolder()
  }

  async function fetchFolders() {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return
    const existing = folderFetches.get(workspaceId)
    if (existing) return existing
    const request = (async () => {
      try {
        const data = await $fetch<FlowFolderPayload>(`/api/workspaces/${workspaceId}/flow-folders`)
        if (currentWorkspaceId.value !== workspaceId) return
        folders.value = data.folders
        assignments.value = data.assignments
        loadedWorkspaceId.value = workspaceId
      }
      catch (error) {
        // Keep the existing flow list usable if folder metadata is temporarily
        // unavailable (for example, while a deployment migration is rolling out).
        console.warn('[useFlowFolders] failed to load folders', error)
        if (currentWorkspaceId.value !== workspaceId) return
        folders.value = []
        assignments.value = {}
        loadedWorkspaceId.value = workspaceId
      }
      finally {
        folderFetches.delete(workspaceId)
      }
    })()
    folderFetches.set(workspaceId, request)
    return request
  }

  async function ensureFolders() {
    if (currentWorkspaceId.value && loadedWorkspaceId.value !== currentWorkspaceId.value) await fetchFolders()
  }

  async function createFolder(name: string) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return null
    // Do not let an older in-flight GET overwrite a newly-created folder.
    // Creation waits for initial hydration, then appends the confirmed row.
    await ensureFolders()
    const folder = await $fetch<FlowFolder>(`/api/workspaces/${workspaceId}/flow-folders`, { method: 'POST', body: { name } })
    if (currentWorkspaceId.value !== workspaceId) return null
    folders.value = [folder, ...folders.value]
    loadedWorkspaceId.value = workspaceId
    return folder
  }

  async function renameFolder(id: string, name: string) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return
    const folder = await $fetch<FlowFolder>(`/api/workspaces/${workspaceId}/flow-folders/${id}`, { method: 'PATCH', body: { name } })
    folders.value = folders.value.map(item => item.id === id ? folder : item)
  }

  async function deleteFolder(id: string) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return
    await $fetch(`/api/workspaces/${workspaceId}/flow-folders/${id}`, { method: 'DELETE' })
    folders.value = folders.value.filter(item => item.id !== id)
    assignments.value = Object.fromEntries(Object.entries(assignments.value).map(([flowId, folderId]) => [flowId, folderId === id ? null : folderId]))
    if (pendingDraftFolder.value?.folderId === id) clearPendingDraftFolder()
  }

  async function reorderFolders(orderedIds: string[]) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId || orderedIds.length === 0) return
    const previous = [...folders.value]
    const byId = new Map(previous.map(folder => [folder.id, folder]))
    const total = orderedIds.length
    const reordered = orderedIds.flatMap((id, index) => {
      const folder = byId.get(id)
      if (!folder) return []
      byId.delete(id)
      return [{ ...folder, position: total - index }]
    })
    folders.value = [...reordered, ...byId.values()]
    try {
      await $fetch(`/api/workspaces/${workspaceId}/flow-folders/order`, {
        method: 'PATCH',
        body: { order: orderedIds },
      })
    }
    catch (error) {
      folders.value = previous
      throw error
    }
  }

  async function assignFlow(flowId: string, folderId: string | null) {
    const workspaceId = currentWorkspaceId.value
    if (!workspaceId) return
    const previous = assignments.value[flowId] ?? null
    assignments.value = { ...assignments.value, [flowId]: folderId }
    try {
      await $fetch(`/api/workspaces/${workspaceId}/flows/${flowId}/folder`, { method: 'PATCH', body: { folder_id: folderId } })
    }
    catch (error) {
      assignments.value = { ...assignments.value, [flowId]: previous }
      throw error
    }
  }

  // The workflow row is created by the first websocket user_message, shortly
  // after the new-workflow page promotes its local draft. Keep the folder
  // assignment optimistic while retrying that narrow creation race so the new
  // row lands directly inside its folder and never flashes in the root list.
  async function commitPendingDraftFolder(flowId: string) {
    const pending = pendingDraftFolder.value
    if (!pending || pending.flowId !== flowId || pending.workspaceId !== currentWorkspaceId.value) return
    const previous = assignments.value[flowId] ?? null
    assignments.value = { ...assignments.value, [flowId]: pending.folderId }

    // A layout remount may still be finishing its initial folder GET. Let that
    // request settle, then re-assert the optimistic assignment so stale
    // pre-commit metadata cannot move the promoted row into the root list.
    await ensureFolders()
    assignments.value = { ...assignments.value, [flowId]: pending.folderId }

    let lastError: unknown
    await new Promise(resolve => setTimeout(resolve, 150))
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await $fetch(`/api/workspaces/${pending.workspaceId}/flows/${flowId}/folder`, {
          method: 'PATCH',
          body: { folder_id: pending.folderId },
        })
        assignments.value = { ...assignments.value, [flowId]: pending.folderId }
        clearPendingDraftFolder(flowId)
        return
      }
      catch (error) {
        lastError = error
        if (attempt < 11) await new Promise(resolve => setTimeout(resolve, Math.min(100 + attempt * 50, 500)))
      }
    }

    assignments.value = { ...assignments.value, [flowId]: previous }
    console.error('[useFlowFolders] failed to assign committed draft to folder', lastError)
  }

  watch(currentWorkspaceId, () => {
    folders.value = []
    assignments.value = {}
    loadedWorkspaceId.value = null
    void ensureFolders()
  }, { immediate: true })

  return {
    folders,
    assignments,
    pendingDraftFolder,
    fetchFolders,
    ensureFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    assignFlow,
    restorePendingDraftFolder,
    setPendingDraftFolder,
    clearPendingDraftFolder,
    commitPendingDraftFolder,
  }
}
