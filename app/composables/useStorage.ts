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

// Multi-source storage backend interface for future integration
export interface StorageBackend {
  listFiles(ctx: StorageContext, path: string): Promise<StorageDirectory>
  uploadFile(ctx: StorageContext, path: string, file: File): Promise<boolean>
  deleteFiles(ctx: StorageContext, paths: string[]): Promise<boolean>
  moveFile(ctx: StorageContext, from: string, to: string): Promise<boolean>
  renameFile(ctx: StorageContext, oldPath: string, newName: string): Promise<boolean>
  createFolder(ctx: StorageContext, path: string, name: string): Promise<boolean>
  downloadFile(ctx: StorageContext, path: string): Promise<boolean>
  getSignedUrl(ctx: StorageContext, path: string, expiresIn?: number): Promise<string | null>
}

export interface StorageContext {
  workspaceId: string
  userId: string
}

const BUCKET_NAME = 'workspace-files'

function pathSegmentsToString(segments: string[]): string {
  return segments.length ? segments.join('/') + '/' : ''
}

function parentPathString(segments: string[]): string {
  return pathSegmentsToString(segments)
}

/** Single path segment for a folder name (no slashes, trimmed). */
function sanitizeFolderSegment(name: string): string {
  const t = name.trim().replace(/\0/g, '')
  if (!t) return ''
  return t
    .replace(/[/\\]+/g, '-')
    .replace(/^\.+$/, '_')
    .slice(0, 240)
}

export function useStorage() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const { isInstalled } = useMarketplace()
  const { currentWorkspace } = useWorkspaces()

  const provider = computed<StorageProvider>(() => {
    if (isInstalled('google-drive')) return 'google-drive'
    return 'supabase'
  })

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** Folder create/rename failures — keep separate so listing UI isn't replaced by the global error panel */
  const folderOpMessage = ref<string | null>(null)

  // Multi-source storage backend registry
  const backends = ref<Map<string, StorageBackend>>(new Map())

  /** @nuxtjs/supabase exposes JWT claims — subject is `sub`, not `id` */
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

  function workspacePrefix(): string {
    const workspaceId = getWorkspaceId()
    return workspaceId ? `${workspaceId}/main/` : ''
  }

  function fullPath(relativePath: string): string {
    return `${workspacePrefix()}${relativePath}`
  }

  // Register a storage backend for future integration (GDrive, local folder, etc.)
  function registerStorageBackend(name: string, backend: StorageBackend): void {
    backends.value.set(name, backend)
  }

  async function listFiles(pathSegments: string[]): Promise<StorageDirectory> {
    isLoading.value = true
    error.value = null

    try {
      if (!authUserId() || !getWorkspaceId()) {
        return { files: [], folders: [] }
      }
      const prefix = fullPath(parentPathString(pathSegments))
      const { data, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(prefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        })

      if (listError) {
        error.value = listError.message
        return { files: [], folders: [] }
      }

      if (!data) {
        return { files: [], folders: [] }
      }

      const folders: StorageFolder[] = []
      const files: StorageFile[] = []

      for (const item of data) {
        if (item.id === null) {
          const folderName = item.name
          if (folderName === '.keep') continue
          folders.push({
            name: folderName,
            path: `${prefix}${folderName}`,
            provider: provider.value,
          })
        } else {
          files.push({
            id: item.id,
            name: item.name,
            path: `${prefix}${item.name}`,
            size: item.metadata?.size ?? 0,
            createdAt: item.created_at ?? new Date().toISOString(),
            provider: provider.value,
          })
        }
      }

      return { files, folders }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to list files'
      return { files: [], folders: [] }
    } finally {
      isLoading.value = false
    }
  }

  async function uploadFile(pathSegments: string[], file: File): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      if (!authUserId() || !getWorkspaceId()) {
        error.value = 'Sign in to upload files.'
        return false
      }
      const filePath = fullPath(`${parentPathString(pathSegments)}${file.name}`)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        error.value = uploadError.message
        return false
      }

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to upload file'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteFiles(paths: string[]): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const fullPaths = paths.map(p => fullPath(p))
      const { error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(fullPaths)

      if (removeError) {
        error.value = removeError.message
        return false
      }

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete files'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function moveFile(fromPath: string, toPath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const fullFrom = fullPath(fromPath)
      const fullTo = fullPath(toPath)
      const { error: moveError } = await supabase.storage
        .from(BUCKET_NAME)
        .move(fullFrom, fullTo)

      if (moveError) {
        error.value = moveError.message
        return false
      }

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to move file'
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

  async function moveFolderContents(fromFullPrefix: string, toFullPrefix: string): Promise<boolean> {
    const { data, error: listError } = await supabase.storage.from(BUCKET_NAME).list(fromFullPrefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listError) {
      error.value = listError.message
      return false
    }
    if (!data) return true

    for (const item of data) {
      if (item.id === null) {
        const ok = await moveFolderContents(`${fromFullPrefix}${item.name}/`, `${toFullPrefix}${item.name}/`)
        if (!ok) return false
      } else {
        const { error: mErr } = await supabase.storage
          .from(BUCKET_NAME)
          .move(`${fromFullPrefix}${item.name}`, `${toFullPrefix}${item.name}`)
        if (mErr) {
          error.value = mErr.message
          return false
        }
      }
    }
    return true
  }

  async function renameFolder(folderPath: string, newName: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const safeName = sanitizeFolderSegment(newName)
      if (!safeName) {
        error.value = 'Enter a valid folder name.'
        return false
      }
      const trimmed = folderPath.replace(/\/+$/, '')
      const lastSlash = trimmed.lastIndexOf('/')
      const parent = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : ''
      const fromFullPrefix = fullPath(`${trimmed}/`)
      const toFullPrefix = fullPath(`${parent}${safeName}/`)
      if (fromFullPrefix === toFullPrefix) return true
      return await moveFolderContents(fromFullPrefix, toFullPrefix)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to rename folder'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function createFolder(pathSegments: string[], name: string): Promise<boolean> {
    isLoading.value = true
    folderOpMessage.value = null

    try {
      if (!authUserId() || !getWorkspaceId()) {
        folderOpMessage.value = 'Sign in to create folders.'
        return false
      }
      const safeName = sanitizeFolderSegment(name)
      if (!safeName) {
        folderOpMessage.value = 'Enter a valid folder name.'
        return false
      }
      const keepPath = fullPath(`${parentPathString(pathSegments)}${safeName}/.keep`)
      // Zero-byte uploads often return 400 from the storage API; use a minimal body.
      const keepBody = new Blob(['\n'], { type: 'text/plain' })
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(keepPath, keepBody, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'text/plain',
        })

      if (uploadError) {
        folderOpMessage.value = uploadError.message
        return false
      }

      return true
    } catch (err) {
      folderOpMessage.value = err instanceof Error ? err.message : 'Failed to create folder'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function getSignedUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
    try {
      const fullPathVal = fullPath(filePath)
      const { data, error: signError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(fullPathVal, expiresIn)
      if (signError || !data) return null
      return data.signedUrl
    } catch {
      return null
    }
  }

  async function copyStorageFile(fromRelativePath: string, toRelativePath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const fullFrom = fullPath(fromRelativePath)
      const fullTo = fullPath(toRelativePath)
      const { error: copyError } = await supabase.storage
        .from(BUCKET_NAME)
        .copy(fullFrom, fullTo)

      if (copyError) {
        error.value = copyError.message
        return false
      }

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to copy file'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function copyFolderContents(sourceSegments: string[], destSegments: string[]): Promise<void> {
    const sourcePrefix = fullPath(pathSegmentsToString(sourceSegments))
    const { data } = await supabase.storage.from(BUCKET_NAME).list(sourcePrefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (!data) return

    for (const item of data) {
      if (item.id === null) {
        if (item.name === '.keep') continue
        const subDestSegments = [...destSegments, item.name]
        const keepPath = fullPath(`${pathSegmentsToString(subDestSegments)}/.keep`)
        const keepBody = new Blob(['\n'], { type: 'text/plain' })
        await supabase.storage.from(BUCKET_NAME).upload(keepPath, keepBody, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'text/plain',
        })
        await copyFolderContents([...sourceSegments, item.name], subDestSegments)
      } else {
        const fullFrom = `${sourcePrefix}${item.name}`
        const fullTo = `${fullPath(pathSegmentsToString(destSegments))}${item.name}`
        await supabase.storage.from(BUCKET_NAME).copy(fullFrom, fullTo)
      }
    }
  }

  async function copyStorageFolder(sourceSegments: string[], destName: string): Promise<boolean> {
    isLoading.value = true
    folderOpMessage.value = null

    try {
      if (!authUserId() || !getWorkspaceId()) {
        folderOpMessage.value = 'Sign in to copy folders.'
        return false
      }

      const safeName = sanitizeFolderSegment(destName)
      if (!safeName) {
        folderOpMessage.value = 'Enter a valid folder name.'
        return false
      }

      const destSegments = [...sourceSegments.slice(0, -1), safeName]
      const keepPath = fullPath(`${pathSegmentsToString(destSegments)}/.keep`)
      const keepBody = new Blob(['\n'], { type: 'text/plain' })
      const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(keepPath, keepBody, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'text/plain',
      })

      if (uploadError) {
        folderOpMessage.value = uploadError.message
        return false
      }

      await copyFolderContents(sourceSegments, destSegments)

      return true
    } catch (err) {
      folderOpMessage.value = err instanceof Error ? err.message : 'Failed to copy folder'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function downloadFile(filePath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const fullPathVal = fullPath(filePath)
      const { data, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(fullPathVal)

      if (downloadError) {
        error.value = downloadError.message
        return false
      }

      if (data) {
        const url = URL.createObjectURL(data)
        const link = document.createElement('a')
        link.href = url
        link.download = filePath.split('/').pop() ?? 'download'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to download file'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // File sharing operations
  async function shareDirectory(targetWorkspaceId: string, filePath: string, permission: 'viewer' | 'editor'): Promise<FileShare | null> {
    try {
      const response = await $fetch(`/api/workspaces/${getWorkspaceId()}/shares`, {
        method: 'POST',
        body: {
          targetWorkspaceId,
          filePath,
          permissionLevel: permission,
        },
      })
      return response as FileShare
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to share directory'
      return null
    }
  }

  async function unshareDirectory(shareId: string): Promise<boolean> {
    try {
      await $fetch(`/api/workspaces/${getWorkspaceId()}/shares/${shareId}`, {
        method: 'DELETE',
      })
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to unshare directory'
      return false
    }
  }

  async function listSharedWithMe(): Promise<SharedFileReference[]> {
    try {
      const shares = await $fetch(`/api/workspaces/${getWorkspaceId()}/shared-with-me`, {
        method: 'GET',
      })
      return shares as SharedFileReference[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to list shared files'
      return []
    }
  }

  async function validateSubdirectoryShare(filePath: string): Promise<{ canShare: boolean; message?: string; parentSharePath?: string; parentPermission?: string }> {
    try {
      const result = await $fetch(`/api/workspaces/${getWorkspaceId()}/files/validate-subdirectory-share`, {
        method: 'POST',
        body: { filePath },
      })
      return result as any
    } catch (err) {
      // Default to allowing the share if validation fails
      return { canShare: true }
    }
  }

  function stripUserPrefix(path: string): string {
    const prefix = workspacePrefix()
    if (prefix && path.startsWith(prefix)) {
      return path.slice(prefix.length)
    }
    return path
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
    // File sharing
    shareDirectory,
    unshareDirectory,
    listSharedWithMe,
    validateSubdirectoryShare,
    // Multi-source backend
    registerStorageBackend,
    backends,
  }
}
