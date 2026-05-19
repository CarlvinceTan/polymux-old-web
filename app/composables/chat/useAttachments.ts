import { ref } from 'vue'
import { useAppToast } from '../ui/useAppToast'

export interface FileAttachmentState {
  id: string
  /** Stable identifier minted at creation and preserved across the `id` swap
   *  when an upload finishes (localId → server-assigned id). Inline editors
   *  use this to keep the chip's DOM node in place. */
  localId: string
  name: string
  size: number
  progress: number
  status: 'uploading' | 'done' | 'error'
  /** Optional initial character offset in the editor text. Only meaningful at
   *  seed time (edit-mode rehydration); after the chip is in the DOM, its
   *  live offset is the source of truth. */
  position?: number
}

const maxUploadSize = ref<number | null>(null)
const configFetchCache = new Map<string, Promise<void>>()

export function useAttachments() {
  const attachments = ref<FileAttachmentState[]>([])
  const xhrMap = new Map<string, XMLHttpRequest>()

  const config = useRuntimeConfig()
  const supabase = useSupabaseClient()
  const { show: showToast } = useAppToast()

  async function getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    return session.access_token
  }

  function fetchUploadConfig(workspaceId?: string): Promise<void> {
    const key = workspaceId ?? '_default'
    const existing = configFetchCache.get(key)
    if (existing) return existing
    const p = (async () => {
      try {
        const token = await getAuthToken()
        const baseURL = (config.public.serverUrl as string).replace(/\/$/, '')
        const params = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
        const res = await fetch(`${baseURL}/upload-config${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (typeof data.max_upload_size === 'number') {
            maxUploadSize.value = data.max_upload_size
          }
        }
      } catch {
        // Silently fall back to no client-side check
      }
    })()
    configFetchCache.set(key, p)
    return p
  }

  async function addFiles(sessionId: string, files: FileList, workspaceId?: string) {
    await fetchUploadConfig(workspaceId)

    for (const file of Array.from(files)) {
      if (maxUploadSize.value && file.size > maxUploadSize.value) {
        showToast(
          `"${file.name}" exceeds the ${formatSize(maxUploadSize.value)} upload limit`,
          'warning',
        )
        continue
      }

      const localId = crypto.randomUUID()
      const entry: FileAttachmentState = {
        id: localId,
        localId,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      }
      attachments.value = [...attachments.value, entry]
      uploadFile(sessionId, localId, file)
    }
  }

  async function uploadFile(sessionId: string, localId: string, file: File) {
    let token: string
    try {
      token = await getAuthToken()
    } catch {
      updateEntry(localId, { status: 'error', progress: 0 })
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    xhrMap.set(localId, xhr)

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100)
        updateEntry(localId, { progress })
      }
    })

    xhr.addEventListener('load', () => {
      xhrMap.delete(localId)
      if (xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText)
          attachments.value = attachments.value.map(a =>
            a.id === localId
              ? { ...a, id: data.id, status: 'done', progress: 100 }
              : a,
          )
        } catch {
          updateEntry(localId, { status: 'done', progress: 100 })
        }
      } else if (xhr.status === 413) {
        // Server rejected as too large — parse limit from response
        attachments.value = attachments.value.filter(a => a.id !== localId)
        try {
          const data = JSON.parse(xhr.responseText)
          if (data.max_upload_size) {
            maxUploadSize.value = data.max_upload_size
            showToast(
              `"${file.name}" exceeds the ${formatSize(data.max_upload_size)} upload limit`,
              'warning',
            )
          }
        } catch {
          showToast(`"${file.name}" is too large to upload`, 'warning')
        }
      } else {
        updateEntry(localId, { status: 'error', progress: 0 })
      }
    })

    xhr.addEventListener('error', () => {
      xhrMap.delete(localId)
      updateEntry(localId, { status: 'error', progress: 0 })
    })

    xhr.addEventListener('abort', () => {
      xhrMap.delete(localId)
    })

    const baseURL = (config.public.serverUrl as string).replace(/\/$/, '')
    xhr.open('POST', `${baseURL}/sessions/${sessionId}/files`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }

  function removeFile(id: string, sessionId?: string) {
    const xhr = xhrMap.get(id)
    if (xhr) {
      xhr.abort()
      xhrMap.delete(id)
    }

    const entry = attachments.value.find(a => a.id === id)
    attachments.value = attachments.value.filter(a => a.id !== id)

    if (entry && entry.status === 'done' && sessionId) {
      getAuthToken().then((token) => {
        const baseURL = (config.public.serverUrl as string).replace(/\/$/, '')
        fetch(`${baseURL}/sessions/${sessionId}/files/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
      }).catch(() => {})
    }
  }

  function clearAll() {
    for (const xhr of xhrMap.values()) {
      xhr.abort()
    }
    xhrMap.clear()
    attachments.value = []
  }

  function seed(existing: { id: string; name: string; position?: number }[]) {
    attachments.value = existing.map(a => ({
      id: a.id,
      localId: crypto.randomUUID(),
      name: a.name,
      size: 0,
      progress: 100,
      status: 'done' as const,
      position: a.position,
    }))
  }

  function updateEntry(id: string, patch: Partial<FileAttachmentState>) {
    attachments.value = attachments.value.map(a => a.id === id ? { ...a, ...patch } : a)
  }

  return {
    attachments,
    addFiles,
    removeFile,
    clearAll,
    seed,
  }
}
