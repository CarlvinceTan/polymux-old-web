import { CancelledError } from '@tanstack/vue-query'
import type { StorageProvider } from '~/types/storage'
import { promptUpgrade } from '~/composables/account/useUpgradePlanModal'

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

interface UploadUrlDriveResponse {
  url: string
  token: ''
  path: string
  backend: 'google-drive'
  method: 'PUT'
  expires_at: string
}

interface UploadUrlB2Response {
  url: string
  token: string // B2 upload authorization token, sent as the Authorization header on the POST
  path: string
  key: string // X-Bz-File-Name value (path under the bucket)
  backend: 'b2'
  method: 'POST'
  content_type: string
  expires_at: string
}

type UploadUrlResponse = UploadUrlDriveResponse | UploadUrlB2Response

interface FinalizeUploadResponse {
  ok: true
  path: string
  size: number
  backend: 'google-drive' | 'local' | 'b2'
  file_id?: string
}

interface RemoteDownloadUrlResponse {
  url: string
  backend: 'google-drive' | 'b2'
  backend_ref?: string | null
  content_type?: string | null
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

// B2's b2_upload_file response shape; only fields we record are listed.
interface B2UploadResponse {
  fileId: string
  contentSha1: string
  contentLength: number
}

// Hex-encoded SHA1 of an ArrayBuffer. B2 requires this in X-Bz-Content-Sha1
// so the bucket can verify end-to-end integrity of the upload.
async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// X-Bz-File-Name encoding: every segment is percent-encoded except for the
// path separator. Mirrors the server-side helper in
// polymux/internal/filesystem/b2_backend.go (b2EscapeFileName) so server +
// client keys round-trip exactly.
function encodeB2FileName(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/')
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

function isFetchCancellation(err: unknown): boolean {
  if (err instanceof CancelledError) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true
  return false
}

function maybePromptCloudUpgrade(err: unknown, fallbackMessage?: string): boolean {
  const e = err as { statusCode?: number, data?: { statusMessage?: string } } | null
  const message = e?.data?.statusMessage ?? ''
  const isCloudPlanGate =
    e?.statusCode === 412
    || (e?.statusCode === 413 && message.toLowerCase().includes('cloud storage'))
  if (!isCloudPlanGate) return false

  const { t } = useI18n()
  promptUpgrade(
    { reason: 'cloud_storage', message: message || undefined },
    { message: message || fallbackMessage || t('storage.errors.upgradeCloud') },
  )
  return true
}

export function useStorageFiles() {
  const { t } = useI18n()
  const user = useSupabaseUser()
  const { currentWorkspace } = useWorkspaces()
  const { resolvedOrder } = useStoragePreferences()
  const queryClient = useQueryClient()

  const provider = computed<StorageProvider>(() => resolvedOrder.value[0] ?? 'local')

  const isLoading = ref(false)
  /** Directory listing fetches only — does not toggle during upload/delete. */
  const listingLoading = ref(false)
  const error = ref<string | null>(null)
  const folderOpMessage = ref<string | null>(null)
  // Bumped by useWorkspaceEvents on realtime `files` changes for the current
  // workspace. A mounted FileBrowser watches it to revalidate the directory it
  // is currently showing — the listing uses imperative fetchQuery (no observer),
  // so queryClient.invalidateQueries alone can't trigger a live refetch.
  const storageDirRev = useState<number>('storage-dir-rev', () => 0)

  function clearStorageListCache() {
    queryClient.removeQueries({ queryKey: ['storage-directory'] })
  }

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

  // Shared wrapper for the storage mutation methods: flips isLoading on, clears
  // the message sink, runs fn, maps a thrown error to the sink via errorMessage,
  // and always resets isLoading in finally. Inner early `return false`/`return
  // true` (and any message fn sets on the sink itself) flow through unchanged.
  async function withLoading(
    fn: () => Promise<boolean>,
    opts: { fallbackKey: string, sink?: Ref<string | null> },
  ): Promise<boolean> {
    const sink = opts.sink ?? error
    isLoading.value = true
    sink.value = null
    try {
      return await fn()
    }
    catch (err) {
      sink.value = errorMessage(err, t(opts.fallbackKey))
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  async function listFiles(pathSegments: string[], opts?: { force?: boolean }): Promise<StorageDirectory> {
    error.value = null
    const wsId = getWorkspaceId()
    if (!authUserId() || !wsId) return { files: [], folders: [] }
    const base = baseUrl()
    if (!base) return { files: [], folders: [] }

    const path = joinSegments(pathSegments)
    const key = ['storage-directory', wsId, path]

    listingLoading.value = true
    try {
      const data = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => $fetch<StorageDirectory>(base, { query: { path } }),
        staleTime: opts?.force ? 0 : undefined,
      })
      return data
    }
    catch (err) {
      if (isFetchCancellation(err)) {
        return queryClient.getQueryData<StorageDirectory>(key) ?? { files: [], folders: [] }
      }
      error.value = errorMessage(err, t('storage.errors.listFailed'))
      return queryClient.getQueryData<StorageDirectory>(key) ?? { files: [], folders: [] }
    }
    finally {
      listingLoading.value = false
    }
  }

  /** Synchronously read the cached listing for a directory (from a prior fetch
   *  or the warm-cache prefetch) so the grid can paint instantly on cold mount.
   *  Returns null on a true cache miss. Same query key as listFiles. */
  function getCachedDirectory(pathSegments: string[]): StorageDirectory | null {
    const wsId = getWorkspaceId()
    if (!wsId) return null
    const path = joinSegments(pathSegments)
    return queryClient.getQueryData<StorageDirectory>(['storage-directory', wsId, path]) ?? null
  }

  /** Warm the cache for a directory without rendering (used by the
   *  workspace-entry prefetch hook). Reuses listFiles' exact key + fetcher. */
  async function prefetchDirectory(pathSegments: string[]): Promise<void> {
    const wsId = getWorkspaceId()
    const base = baseUrl()
    if (!authUserId() || !wsId || !base) return
    const path = joinSegments(pathSegments)
    await queryClient.prefetchQuery({
      queryKey: ['storage-directory', wsId, path],
      queryFn: () => $fetch<StorageDirectory>(base, { query: { path } }),
    })
  }

  async function uploadFile(pathSegments: string[], file: File): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const base = baseUrl()
      const workspaceId = getWorkspaceId()
      if (!authUserId() || !base || !workspaceId) {
        error.value = t('storage.errors.signInToUpload')
        return false
      }
      const path = joinPath(joinSegments(pathSegments), file.name)
      const preferred = provider.value

      if (preferred === 'local') {
        const deviceId = useDeviceId()
        if (!deviceId) {
          error.value = t('storage.errors.localDeviceId')
          return false
        }
        const opfs = useLocalFiles()
        if (!opfs.supported()) {
          error.value = t('storage.errors.localUnsupported')
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
          error.value = t('storage.errors.localUploadMissingId')
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

      if (signed.backend === 'b2') {
        // B2 upload protocol (Cloud storage): POST the file bytes directly to
        // the bucket's upload URL. Required headers are the auth token, the
        // URL-encoded file name, the content type, and the SHA1 — B2 rejects
        // uploads whose Content-Sha1 doesn't match the body.
        const buf = await file.arrayBuffer()
        const sha1 = await sha1Hex(buf)
        const b2Res = await fetch(signed.url, {
          method: 'POST',
          headers: {
            'Authorization': signed.token,
            'X-Bz-File-Name': encodeB2FileName(signed.key),
            'Content-Type': signed.content_type || file.type || 'application/octet-stream',
            'X-Bz-Content-Sha1': sha1,
            'X-Bz-Server-Side-Encryption': 'AES256',
          },
          body: buf,
        })
        if (!b2Res.ok) {
          const detail = await b2Res.text().catch(() => '')
          error.value = `Upload failed (${b2Res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`
          return false
        }
        const b2Json = await b2Res.json().catch(() => null) as B2UploadResponse | null
        if (!b2Json?.fileId) {
          error.value = t('storage.errors.b2MissingFileId')
          return false
        }

        await $fetch(`${base}/finalize-upload`, {
          method: 'POST',
          body: {
            path,
            size: file.size,
            content_type: file.type,
            backend: 'b2',
            backend_ref: b2Json.fileId,
            etag: b2Json.contentSha1,
          },
        })
        return true
      }

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
        error.value = t('storage.errors.driveMissingFileId')
        return false
      }
      const backendRef = driveJson.id

      await $fetch(`${base}/finalize-upload`, {
        method: 'POST',
        body: {
          path,
          size: file.size,
          content_type: file.type,
          backend: signed.backend,
          backend_ref: backendRef,
        },
      })

      return true
    } catch (err) {
      if (maybePromptCloudUpgrade(err, t('storage.errors.upgradeCloud'))) {
        error.value = null
        return false
      }
      error.value = errorMessage(err, t('storage.errors.uploadFailed'))
      return false
    } finally {
      isLoading.value = false
    }
  }

  function deleteFiles(paths: string[], kind: 'file' | 'folder' = 'file'): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/delete`, {
        method: 'POST',
        body: { paths, kind },
      })
      return true
    }, { fallbackKey: 'storage.errors.deleteFailed' })
  }

  function moveFile(fromPath: string, toPath: string, kind: 'file' | 'folder' = 'file'): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/move`, {
        method: 'POST',
        body: { from: fromPath, to: toPath, kind },
      })
      return true
    }, { fallbackKey: 'storage.errors.moveFailed' })
  }

  // Cross-provider migration: moves items to `targetParent` AND switches their
  // backend to `targetProvider`. Returns a per-item breakdown so the caller can
  // toast successes + failures without losing progress on partial completion.
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
      const reason = errorMessage(err, t('storage.errors.migrationFailed'))
      error.value = reason
      return { migrated: [], errors: items.map(i => ({ path: i.path, reason })) }
    }
  }

  // Client-driven cross-provider FILE move for any case that touches 'local'
  // (local→b2, local→drive, b2→local, drive→local). OPFS bytes are visible
  // only to the browser, so these can't run server-side like migrate-items
  // does for drive↔b2↔drive. Flow: acquire source bytes → write destination
  // backend → reconcile metadata + drop the source via /commit-file-migration.
  // The source is only removed AFTER the destination exists, so a mid-way
  // failure never loses bytes. Returns a per-item result for the caller to
  // aggregate; never throws.
  async function transferLocalFile(
    fromPath: string,
    toPath: string,
    sourceBackend: StorageProvider,
    targetProvider: StorageProvider,
  ): Promise<{ ok: boolean; reason?: string }> {
    const base = baseUrl()
    const workspaceId = getWorkspaceId()
    if (!base || !workspaceId) return { ok: false, reason: 'no_workspace' }

    try {
      // 1. Acquire source bytes (+ the source ref / content type used for the
      //    destination MIME and the source cleanup).
      let blob: Blob
      let sourceRef: string | null = null
      let contentType: string | null = null

      if (sourceBackend === 'local') {
        const opfs = useLocalFiles()
        if (!opfs.supported()) return { ok: false, reason: 'local_unsupported' }
        const resolved = await resolveDownload(fromPath, 60)
        if (!resolved || resolved.backend !== 'local') return { ok: false, reason: 'source_not_found' }
        if (!resolved.device_id || resolved.device_id !== useDeviceId()) {
          return { ok: false, reason: 'bytes_on_another_device' }
        }
        const entry = await opfs.read(workspaceId, resolved.file_id)
        if (!entry) return { ok: false, reason: 'bytes_on_another_device' }
        blob = entry.blob
        contentType = entry.meta.contentType ?? blob.type ?? null
        sourceRef = resolved.file_id // local source ref == OPFS key == row id
      }
      else {
        const resolved = await resolveDownload(fromPath, 600)
        if (!resolved || resolved.backend === 'local') return { ok: false, reason: 'source_not_found' }
        const res = await fetch(resolved.url)
        if (!res.ok) return { ok: false, reason: `download_failed_${res.status}` }
        blob = await res.blob()
        sourceRef = resolved.backend_ref ?? null
        contentType = resolved.content_type ?? blob.type ?? null
      }

      const size = blob.size
      const ct = contentType || blob.type || 'application/octet-stream'

      // 2. Write the destination backend, then reconcile metadata + cleanup.
      if (targetProvider === 'local') {
        const deviceId = useDeviceId()
        if (!deviceId) return { ok: false, reason: 'no_device' }
        const opfs = useLocalFiles()
        if (!opfs.supported()) return { ok: false, reason: 'local_unsupported' }
        // finalize first so the server hands back the row id we key OPFS by
        // (mirrors uploadFile's local path).
        const fin = await $fetch<FinalizeUploadResponse>(`${base}/finalize-upload`, {
          method: 'POST',
          body: { path: toPath, size, content_type: ct, backend: 'local', backend_ref: deviceId },
        })
        if (!fin?.file_id) return { ok: false, reason: 'finalize_failed' }
        await opfs.write(workspaceId, fin.file_id, blob, { path: toPath, contentType: ct, size })
        await $fetch(`${base}/commit-file-migration`, {
          method: 'POST',
          body: { oldPath: fromPath, oldBackend: sourceBackend, oldRef: sourceRef, newPath: toPath },
        })
      }
      else if (targetProvider === 'b2') {
        const signed = await $fetch<UploadUrlResponse>(`${base}/upload-url`, {
          method: 'POST',
          body: { path: toPath, size, content_type: ct, preferred_backend: 'b2' },
        })
        if (signed.backend !== 'b2') return { ok: false, reason: 'upload_url_mismatch' }
        const buf = await blob.arrayBuffer()
        const sha1 = await sha1Hex(buf)
        const b2Res = await fetch(signed.url, {
          method: 'POST',
          headers: {
            'Authorization': signed.token,
            'X-Bz-File-Name': encodeB2FileName(signed.key),
            'Content-Type': signed.content_type || ct,
            'X-Bz-Content-Sha1': sha1,
            'X-Bz-Server-Side-Encryption': 'AES256',
          },
          body: buf,
        })
        if (!b2Res.ok) return { ok: false, reason: `b2_upload_${b2Res.status}` }
        const b2Json = await b2Res.json().catch(() => null) as B2UploadResponse | null
        if (!b2Json?.fileId) return { ok: false, reason: 'b2_fileid_missing' }
        await $fetch(`${base}/commit-file-migration`, {
          method: 'POST',
          body: {
            oldPath: fromPath, oldBackend: sourceBackend, oldRef: sourceRef, newPath: toPath,
            newRow: { backend: 'b2', backend_ref: b2Json.fileId, size, content_type: ct, etag: b2Json.contentSha1 },
          },
        })
      }
      else {
        // google-drive target
        const signed = await $fetch<UploadUrlResponse>(`${base}/upload-url`, {
          method: 'POST',
          body: { path: toPath, size, content_type: ct, preferred_backend: 'google-drive' },
        })
        if (signed.backend !== 'google-drive') return { ok: false, reason: 'upload_url_mismatch' }
        const proxyUrl = `${base}/upload-drive-proxy?session_url=${encodeURIComponent(signed.url)}`
        const driveRes = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': ct },
          body: blob,
        })
        if (!driveRes.ok) return { ok: false, reason: `drive_upload_${driveRes.status}` }
        const driveJson = await driveRes.json().catch(() => null) as { id?: string } | null
        if (!driveJson?.id) return { ok: false, reason: 'drive_fileid_missing' }
        await $fetch(`${base}/commit-file-migration`, {
          method: 'POST',
          body: {
            oldPath: fromPath, oldBackend: sourceBackend, oldRef: sourceRef, newPath: toPath,
            newRow: { backend: 'google-drive', backend_ref: driveJson.id, size, content_type: ct },
          },
        })
      }

      // Remove the OPFS source copy last (commit only handles remote objects).
      if (sourceBackend === 'local' && sourceRef) {
        try { await useLocalFiles().remove(workspaceId, sourceRef) }
        catch { /* orphaned OPFS bytes only waste local quota */ }
      }

      return { ok: true }
    }
    catch (err) {
      if (maybePromptCloudUpgrade(err, t('storage.errors.upgradeCloud'))) return { ok: false, reason: 'cloud_cap' }
      return { ok: false, reason: errorMessage(err, 'transfer_failed') }
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
      error.value = errorMessage(err, t('storage.errors.saveOrderFailed'))
      return false
    }
  }

  async function renameFile(filePath: string, newName: string): Promise<boolean> {
    const lastSlash = filePath.lastIndexOf('/')
    const dir = lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : ''
    const newPath = `${dir}${newName}`
    return moveFile(filePath, newPath)
  }

  function renameFolder(folderPath: string, newName: string): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!base) return false
      const safeName = sanitizeFolderSegment(newName)
      if (!safeName) {
        error.value = t('storage.errors.invalidFolderName')
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
    }, { fallbackKey: 'storage.errors.renameFolderFailed' })
  }

  function createFolder(pathSegments: string[], name: string): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!authUserId() || !base) {
        folderOpMessage.value = t('storage.errors.signInToCreateFolders')
        return false
      }
      const safeName = sanitizeFolderSegment(name)
      if (!safeName) {
        folderOpMessage.value = t('storage.errors.invalidFolderName')
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
    }, { fallbackKey: 'storage.errors.createFolderFailed', sink: folderOpMessage })
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

  function copyStorageFile(fromRelativePath: string, toRelativePath: string): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!base) return false
      await $fetch(`${base}/copy`, {
        method: 'POST',
        body: { from: fromRelativePath, to: toRelativePath, kind: 'file' },
      })
      return true
    }, { fallbackKey: 'storage.errors.copyFileFailed' })
  }

  function copyStorageFolder(sourceSegments: string[], destName: string): Promise<boolean> {
    return withLoading(async () => {
      const base = baseUrl()
      if (!authUserId() || !base) {
        folderOpMessage.value = t('storage.errors.signInToCopyFolders')
        return false
      }
      const safeName = sanitizeFolderSegment(destName)
      if (!safeName) {
        folderOpMessage.value = t('storage.errors.invalidFolderName')
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
    }, { fallbackKey: 'storage.errors.copyFolderFailed', sink: folderOpMessage })
  }

  async function downloadFile(filePath: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      const resolved = await resolveDownload(filePath, 60)
      if (!resolved) {
        error.value = t('storage.errors.mintDownloadFailed')
        return false
      }

      let blob: Blob
      if (resolved.backend === 'local') {
        const myDeviceId = useDeviceId()
        if (!resolved.device_id || resolved.device_id !== myDeviceId) {
          error.value = t('storage.errors.localDeviceOnly')
          return false
        }
        const workspaceId = getWorkspaceId()
        const entry = await useLocalFiles().read(workspaceId, resolved.file_id)
        if (!entry) {
          error.value = t('storage.errors.localCopyMissing')
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
      error.value = errorMessage(err, t('storage.errors.downloadFailed'))
      return false
    } finally {
      isLoading.value = false
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
    listingLoading,
    error,
    folderOpMessage,
    clearStorageListCache,
    storageDirRev,
    listFiles,
    getCachedDirectory,
    prefetchDirectory,
    uploadFile,
    deleteFiles,
    moveFile,
    migrateItems,
    transferLocalFile,
    reorderFiles,
    renameFile,
    renameFolder,
    createFolder,
    copyStorageFile,
    copyStorageFolder,
    downloadFile,
    getSignedUrl,
    stripUserPrefix,
    validateSubdirectoryShare,
  }
}
