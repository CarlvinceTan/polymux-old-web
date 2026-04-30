import type { StorageProvider } from '~/types/storage'

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
  order?: string[]
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

interface UploadUrlResponse {
  url: string
  token: string
  path: string
  backend: 'supabase' | 'google-drive'
  method?: 'PUT' | 'POST'
  expires_at: string
}

interface FinalizeUploadResponse {
  ok: true
  path: string
  size: number
  backend: 'supabase' | 'google-drive' | 'local'
  file_id?: string
}

interface RemoteDownloadUrlResponse {
  url: string
  backend: 'supabase' | 'google-drive'
  expires_at: string
}

interface LocalDownloadUrlResponse {
  url: ''
  backend: 'local'
  device_id: string
  file_id: string
  expires_at: string
}

type DownloadUrlResponse = RemoteDownloadUrlResponse | LocalDownloadUrlResponse

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
  const { currentWorkspace } = useWorkspaces()
  const { resolvedOrder } = useStoragePreferences()

  // Top-available provider from the user's persisted save order. Falls back
  // to 'supabase' only if nothing is currently writable (e.g. signed out).
  const provider = computed<StorageProvider>(() => resolvedOrder.value[0] ?? 'supabase')

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
      const workspaceId = getWorkspaceId()
      if (!authUserId() || !base || !workspaceId) {
        error.value = 'Sign in to upload files.'
        return false
      }
      const path = joinPath(joinSegments(pathSegments), file.name)
      const preferred = provider.value

      if (preferred === 'local') {
        const deviceId = useDeviceId()
        if (!deviceId) {
          error.value = 'This browser can\'t provide a device id for local storage.'
          return false
        }
        const opfs = useWorkspaceLocalFiles()
        if (!opfs.supported()) {
          error.value = 'Local storage is not supported in this browser.'
          return false
        }
        // Finalize first so the server assigns the row id we use as the OPFS
        // key — that way /download-url's `file_id` lines up with the on-disk
        // entry. If the OPFS write fails afterwards the row is orphaned, but
        // the next upload overwrites it (path-unique upsert).
        const fin = await $fetch<FinalizeUploadResponse>(`${base}/finalize-upload`, {
          method: 'POST',
          body: {
            path,
            size: file.size,
            content_type: file.type,
            backend: 'local',
            backend_ref: deviceId,
          },
        })
        if (!fin?.file_id) {
          error.value = 'Local upload failed: missing file id.'
          return false
        }
        await opfs.write(workspaceId, fin.file_id, file, {
          path,
          contentType: file.type || null,
          size: file.size,
        })
        return true
      }

      const signed = await $fetch<UploadUrlResponse>(`${base}/upload-url`, {
        method: 'POST',
        body: {
          path,
          size: file.size,
          content_type: file.type,
          preferred_backend: preferred,
        },
      })

      let backendRef: string | undefined

      if (signed.backend === 'google-drive') {
        // Google Drive's resumable-upload session URL doesn't send CORS headers
        // for browser origins, so we stream the bytes through the same-origin
        // Nuxt proxy instead of PUTting Drive directly.
        const proxyUrl = `${base}/upload-drive-proxy?session_url=${encodeURIComponent(signed.url)}`
        const driveRes = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!driveRes.ok) {
          error.value = `Upload failed (${driveRes.status})`
          return false
        }
        const driveJson = await driveRes.json().catch(() => null) as { id?: string } | null
        if (!driveJson?.id) {
          error.value = 'Upload succeeded but Drive file id was missing.'
          return false
        }
        backendRef = driveJson.id
      } else {
        // supabase-js uploadToSignedUrl() shape: PUT with FormData wrapping the
        // file under an empty key plus `cacheControl`, and `x-upsert` header.
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
      }

      await $fetch(`${base}/finalize-upload`, {
        method: 'POST',
        body: {
          path,
          size: file.size,
          content_type: file.type,
          backend: signed.backend,
          ...(backendRef ? { backend_ref: backendRef } : {}),
        },
      })

      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to upload file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteFiles(paths: string[], kind: 'file' | 'folder' = 'file'): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/delete`, {
        method: 'POST',
        body: { paths, kind },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to delete files')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function moveFile(fromPath: string, toPath: string, kind: 'file' | 'folder' = 'file'): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/move`, {
        method: 'POST',
        body: { from: fromPath, to: toPath, kind },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to move file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Cross-provider migration: moves items to `targetParent` AND switches their
  // backend to `targetProvider`. Server-side for supabase ↔ google-drive;
  // local-involving pairs currently error out (flagged phase-2). Returns a
  // per-item breakdown so the caller can toast successes + failures without
  // losing progress on partial completion.
  interface MigrateItemsInput { path: string; kind: 'file' | 'folder' }
  interface MigrateItemsResult {
    migrated: Array<{ fromPath: string; toPath: string }>
    errors: Array<{ path: string; reason: string }>
  }
  async function migrateItems(
    items: MigrateItemsInput[],
    targetProvider: StorageProvider,
    targetParent: string,
  ): Promise<MigrateItemsResult> {
    const base = baseUrl()
    if (!base) return { migrated: [], errors: items.map(i => ({ path: i.path, reason: 'no_workspace' })) }
    try {
      const res = await $fetch<MigrateItemsResult>(`${base}/migrate-items`, {
        method: 'POST',
        body: { items, targetProvider, targetParent },
      })
      return res
    } catch (err) {
      const reason = errorMessage(err, 'Migration failed')
      error.value = reason
      return { migrated: [], errors: items.map(i => ({ path: i.path, reason })) }
    }
  }

  async function reorderFiles(parentPath: string, orderedNames: string[]): Promise<boolean> {
    const base = baseUrl()
    if (!base) return false
    try {
      await $fetch(`${base}/reorder`, {
        method: 'POST',
        body: { parent: parentPath, orderedNames },
      })
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Failed to save order')
      return false
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
      const backend = provider.value
      const backendRef = backend === 'local' ? useDeviceId() : undefined
      await $fetch(`${base}/folder`, {
        method: 'POST',
        body: {
          parent: joinSegments(pathSegments),
          name: safeName,
          backend,
          ...(backendRef ? { backend_ref: backendRef } : {}),
        },
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
      if (data.backend === 'local') return null
      return data.url
    } catch {
      return null
    }
  }

  async function resolveDownload(filePath: string, expiresIn = 3600): Promise<DownloadUrlResponse | null> {
    try {
      const base = baseUrl()
      if (!base) return null
      return await $fetch<DownloadUrlResponse>(`${base}/download-url`, {
        method: 'POST',
        body: { path: filePath, expires_in: expiresIn },
      })
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
      const resolved = await resolveDownload(filePath, 60)
      if (!resolved) {
        error.value = 'Failed to mint download URL.'
        return false
      }

      let blob: Blob
      if (resolved.backend === 'local') {
        const myDeviceId = useDeviceId()
        if (!resolved.device_id || resolved.device_id !== myDeviceId) {
          error.value = 'This file is only available on the device that created it.'
          return false
        }
        const workspaceId = getWorkspaceId()
        const entry = await useWorkspaceLocalFiles().read(workspaceId, resolved.file_id)
        if (!entry) {
          error.value = 'Local copy not found on this device.'
          return false
        }
        blob = entry.blob
      }
      else {
        const response = await fetch(resolved.url)
        if (!response.ok) {
          error.value = `Download failed (${response.status})`
          return false
        }
        blob = await response.blob()
      }

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
    migrateItems,
    reorderFiles,
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
    validateSubdirectoryShare,
  }
}
