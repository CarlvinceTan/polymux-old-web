import type { StorageProvider } from '~/components/StorageProviderIcon.vue'

export interface StorageFile {
  id: string
  name: string
  path: string
  size: number
  createdAt: string
  provider: StorageProvider
}

export interface StorageFolder {
  name: string
  path: string
  provider: StorageProvider
}

export interface StorageDirectory {
  files: StorageFile[]
  folders: StorageFolder[]
}

export interface FileShare {
  id: string
  workspace_id: string
  shared_with_workspace_id: string
  file_path: string
  permission_level: 'viewer' | 'editor'
  created_by: string
  created_at: string
}

export interface SharedFileReference {
  workspace_id: string
  file_path: string
  permission_level: 'viewer' | 'editor'
  created_by: string
  created_at: string
}

interface UploadUrlResponse {
  url: string
  token: string
  path: string
  backend: 'supabase'
  expires_at: string
}

interface DownloadUrlResponse {
  url: string
  backend: 'supabase'
  expires_at: string
}

function joinSegments(segments: string[]): string {
  return segments.filter(Boolean).join('/')
}

function joinPath(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return `${a}/${b}`
}

function sanitizeFolderSegment(name: string): string {
  const t = name.trim().replace(/\0/g, '')
  if (!t) return ''
  return t
    .replace(/[/\\]+/g, '-')
    .replace(/^\.+$/, '_')
    .slice(0, 240)
}

export function useStorage() {
  const user = useSupabaseUser()
  const { isInstalled } = useMarketplace()
  const { currentWorkspace } = useWorkspaces()

  const provider = computed<StorageProvider>(() => {
    if (isInstalled('google-drive')) return 'google-drive'
    return 'supabase'
  })

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const folderOpMessage = ref<string | null>(null)

  function authUserId(): string | null {
    const u = user.value
    if (!u) return null
    if (typeof u.sub === 'string' && u.sub.length > 0) return u.sub
    const id = (u as { id?: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
    return null
  }

  function getWorkspaceId(): string {
    return currentWorkspace.value?.id || ''
  }

  function baseUrl(): string | null {
    const workspaceId = getWorkspaceId()
    return workspaceId ? `/api/workspaces/${workspaceId}/files` : null
  }

  function errorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object') {
      const maybeData = (err as { data?: { statusMessage?: string } }).data
      if (maybeData?.statusMessage) return maybeData.statusMessage
      if (err instanceof Error) return err.message
    }
    return fallback
  }

  async function listFiles(pathSegments: string[]): Promise<StorageDirectory> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!authUserId() || !base) return { files: [], folders: [] }
      const path = joinSegments(pathSegments)
      const data = await $fetch<StorageDirectory>(base, { query: { path } })
      return data
    } catch (err) {
      error.value = errorMessage(err, 'Failed to list files')
      return { files: [], folders: [] }
    } finally {
      isLoading.value = false
    }
  }

  async function uploadFile(pathSegments: string[], file: File): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!authUserId() || !base) {
        error.value = 'Sign in to upload files.'
        return false
      }
      const path = joinPath(joinSegments(pathSegments), file.name)
      const signed = await $fetch<UploadUrlResponse>(`${base}/upload-url`, {
        method: 'POST',
        body: { path, size: file.size, content_type: file.type },
      })

      const formData = new FormData()
      formData.append('cacheControl', '3600')
      formData.append('', file)

      const putResponse = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'x-upsert': 'true' },
        body: formData,
      })
      if (!putResponse.ok) {
        error.value = `Upload failed (${putResponse.status})`
        return false
      }

      await $fetch(`${base}/finalize-upload`, {
        method: 'POST',
        body: { path, size: file.size, content_type: file.type },
      })

      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to upload file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteFiles(paths: string[]): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/delete`, {
        method: 'POST',
        body: { paths, kind: 'file' },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to delete files')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function moveFile(fromPath: string, toPath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/move`, {
        method: 'POST',
        body: { from: fromPath, to: toPath, kind: 'file' },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to move file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function renameFile(filePath: string, newName: string): Promise<boolean> {
    const lastSlash = filePath.lastIndexOf('/')
    const dir = lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : ''
    const newPath = `${dir}${newName}`
    return moveFile(filePath, newPath)
  }

  async function renameFolder(folderPath: string, newName: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      const safeName = sanitizeFolderSegment(newName)
      if (!safeName) {
        error.value = 'Enter a valid folder name.'
        return false
      }
      const trimmed = folderPath.replace(/\/+$/, '')
      const lastSlash = trimmed.lastIndexOf('/')
      const parent = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : ''
      const newPath = parent ? `${parent}/${safeName}` : safeName
      if (trimmed === newPath) return true
      await $fetch(`${base}/move`, {
        method: 'POST',
        body: { from: trimmed, to: newPath, kind: 'folder' },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to rename folder')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function createFolder(pathSegments: string[], name: string): Promise<boolean> {
    isLoading.value = true
    folderOpMessage.value = null
    try {
      const base = baseUrl()
      if (!authUserId() || !base) {
        folderOpMessage.value = 'Sign in to create folders.'
        return false
      }
      const safeName = sanitizeFolderSegment(name)
      if (!safeName) {
        folderOpMessage.value = 'Enter a valid folder name.'
        return false
      }
      await $fetch(`${base}/folder`, {
        method: 'POST',
        body: { parent: joinSegments(pathSegments), name: safeName },
      })
      return true
    } catch (err) {
      folderOpMessage.value = errorMessage(err, 'Failed to create folder')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function getSignedUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
    try {
      const base = baseUrl()
      if (!base) return null
      const data = await $fetch<DownloadUrlResponse>(`${base}/download-url`, {
        method: 'POST',
        body: { path: filePath, expires_in: expiresIn },
      })
      return data.url
    } catch {
      return null
    }
  }

  async function copyStorageFile(fromRelativePath: string, toRelativePath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/copy`, {
        method: 'POST',
        body: { from: fromRelativePath, to: toRelativePath, kind: 'file' },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to copy file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function copyStorageFolder(sourceSegments: string[], destName: string): Promise<boolean> {
    isLoading.value = true
    folderOpMessage.value = null
    try {
      const base = baseUrl()
      if (!authUserId() || !base) {
        folderOpMessage.value = 'Sign in to copy folders.'
        return false
      }
      const safeName = sanitizeFolderSegment(destName)
      if (!safeName) {
        folderOpMessage.value = 'Enter a valid folder name.'
        return false
      }
      const from = joinSegments(sourceSegments)
      const parentSegments = sourceSegments.slice(0, -1)
      const to = joinPath(joinSegments(parentSegments), safeName)
      await $fetch(`${base}/copy`, {
        method: 'POST',
        body: { from, to, kind: 'folder' },
      })
      return true
    } catch (err) {
      folderOpMessage.value = errorMessage(err, 'Failed to copy folder')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function downloadFile(filePath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const url = await getSignedUrl(filePath, 60)
      if (!url) {
        error.value = 'Failed to mint download URL.'
        return false
      }
      const response = await fetch(url)
      if (!response.ok) {
        error.value = `Download failed (${response.status})`
        return false
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filePath.split('/').pop() ?? 'download'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to download file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function shareDirectory(targetWorkspaceId: string, filePath: string, permission: 'viewer' | 'editor'): Promise<FileShare | null> {
    try {
      const response = await $fetch(`/api/workspaces/${getWorkspaceId()}/shares`, {
        method: 'POST',
        body: { targetWorkspaceId, filePath, permissionLevel: permission },
      })
      return response as FileShare
    } catch (err) {
      error.value = errorMessage(err, 'Failed to share directory')
      return null
    }
  }

  async function unshareDirectory(shareId: string): Promise<boolean> {
    try {
      await $fetch(`/api/workspaces/${getWorkspaceId()}/shares/${shareId}`, { method: 'DELETE' })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to unshare directory')
      return false
    }
  }

  async function listSharedWithMe(): Promise<SharedFileReference[]> {
    try {
      const shares = await $fetch(`/api/workspaces/${getWorkspaceId()}/shared-with-me`)
      return shares as SharedFileReference[]
    } catch (err) {
      error.value = errorMessage(err, 'Failed to list shared files')
      return []
    }
  }

  async function validateSubdirectoryShare(filePath: string): Promise<{ canShare: boolean; message?: string; parentSharePath?: string; parentPermission?: string }> {
    try {
      const result = await $fetch(`/api/workspaces/${getWorkspaceId()}/files/validate-subdirectory-share`, {
        method: 'POST',
        body: { filePath },
      })
      return result as { canShare: boolean; message?: string; parentSharePath?: string; parentPermission?: string }
    } catch {
      return { canShare: true }
    }
  }

  // Historically callers stripped the `${workspaceId}/main/` storage prefix
  // from returned paths. The new API returns logical paths already, so this
  // is an identity function unless a legacy prefix sneaks in.
  function stripUserPrefix(path: string): string {
    const workspaceId = getWorkspaceId()
    if (!workspaceId) return path
    const legacy = `${workspaceId}/main/`
    return path.startsWith(legacy) ? path.slice(legacy.length) : path
  }

  return {
    provider,
    isLoading,
    error,
    folderOpMessage,
    listFiles,
    uploadFile,
    deleteFiles,
    moveFile,
    renameFile,
    renameFolder,
    createFolder,
    copyStorageFile,
    copyStorageFolder,
    downloadFile,
    getSignedUrl,
    stripUserPrefix,
    shareDirectory,
    unshareDirectory,
    listSharedWithMe,
    validateSubdirectoryShare,
  }
}
