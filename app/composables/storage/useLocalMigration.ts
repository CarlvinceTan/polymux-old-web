import { useAppToast } from '~/composables/useAppToast'

export type LocalMigrationDirection =
  | 'drive-to-local'
  | 'local-to-drive'

interface PrepareItem {
  file_id: string
  path: string
  size_bytes: number
  content_type: string | null
}

interface PrepareResponse {
  ok: true
  source: 'google-drive' | 'local'
  items: PrepareItem[]
  remaining: number
  done: boolean
}

interface FinalizeLocalResponse {
  ok: true
  migrated: number
  errors: { file_id: string; reason: string }[]
}

interface DownloadUrlRemote {
  url: string
  backend: 'google-drive'
  expires_at: string
}

interface UploadUrlResponse {
  url: string
  token: string
  path: string
  backend: 'google-drive'
  method?: 'PUT' | 'POST'
  expires_at: string
}

interface FinalizeUploadResponse {
  ok: true
  path: string
  size: number
  backend: 'google-drive' | 'local'
}

interface MigrationState {
  status: 'idle' | 'running' | 'done' | 'failed'
  direction: LocalMigrationDirection
  totalMigrated: number
  totalSkipped: number
  remaining: number | null
  errors: { path: string; reason: string }[]
}

const state = reactive<MigrationState>({
  status: 'idle',
  direction: 'drive-to-local',
  totalMigrated: 0,
  totalSkipped: 0,
  remaining: null,
  errors: [],
})

const BATCH_SIZE = 10

export function useLocalMigration() {
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  async function runToLocal(workspaceId: string) {
    const deviceId = useDeviceId()
    if (!deviceId) throw new Error('Device id unavailable')
    const opfs = useWorkspaceLocalFiles()
    if (!opfs.supported()) throw new Error('LOCAL_STORAGE_UNSUPPORTED')

    while (true) {
      const prep = await $fetch<PrepareResponse>(
        `/api/workspaces/${workspaceId}/files/prepare-local-migration`,
        { method: 'POST', body: { source: 'google-drive', batch_size: BATCH_SIZE } },
      )
      if (prep.items.length === 0) {
        state.remaining = prep.remaining
        break
      }

      const committed: { file_id: string }[] = []
      for (const item of prep.items) {
        try {
          const dl = await $fetch<DownloadUrlRemote>(
            `/api/workspaces/${workspaceId}/files/download-url`,
            { method: 'POST', body: { path: item.path, expires_in: 300 } },
          )
          const res = await fetch(dl.url)
          if (!res.ok) throw new Error(`fetch_failed:${res.status}`)
          const blob = await res.blob()
          await opfs.write(workspaceId, item.file_id, blob, {
            path: item.path,
            contentType: item.content_type,
            size: item.size_bytes,
          })
          committed.push({ file_id: item.file_id })
        }
        catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          state.errors.push({ path: item.path, reason })
          state.totalSkipped++
        }
      }

      if (committed.length === 0) {
        state.remaining = prep.remaining
        break
      }

      const fin = await $fetch<FinalizeLocalResponse>(
        `/api/workspaces/${workspaceId}/files/finalize-local-migration`,
        { method: 'POST', body: { source: 'google-drive', device_id: deviceId, items: committed } },
      )
      state.totalMigrated += fin.migrated
      for (const e of fin.errors) {
        state.errors.push({ path: e.file_id, reason: e.reason })
      }
      state.remaining = Math.max(0, prep.remaining - committed.length)
      if (prep.done || state.remaining === 0) break
    }
  }

  async function runFromLocal(workspaceId: string) {
    const deviceId = useDeviceId()
    if (!deviceId) throw new Error('Device id unavailable')
    const opfs = useWorkspaceLocalFiles()
    if (!opfs.supported()) throw new Error('LOCAL_STORAGE_UNSUPPORTED')

    while (true) {
      const prep = await $fetch<PrepareResponse>(
        `/api/workspaces/${workspaceId}/files/prepare-local-migration`,
        { method: 'POST', body: { source: 'local', device_id: deviceId, batch_size: BATCH_SIZE } },
      )
      if (prep.items.length === 0) {
        state.remaining = prep.remaining
        break
      }

      let uploaded = 0
      for (const item of prep.items) {
        try {
          const entry = await opfs.read(workspaceId, item.file_id)
          if (!entry) {
            state.errors.push({ path: item.path, reason: 'local_bytes_missing' })
            state.totalSkipped++
            continue
          }

          const signed = await $fetch<UploadUrlResponse>(
            `/api/workspaces/${workspaceId}/files/upload-url`,
            {
              method: 'POST',
              body: {
                path: item.path,
                size: entry.blob.size,
                content_type: item.content_type || entry.blob.type || undefined,
                preferred_backend: 'google-drive',
              },
            },
          )

          const proxyUrl = `/api/workspaces/${workspaceId}/files/upload-drive-proxy?session_url=${encodeURIComponent(signed.url)}`
          const driveRes = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': item.content_type || entry.blob.type || 'application/octet-stream' },
            body: entry.blob,
          })
          if (!driveRes.ok) throw new Error(`drive_upload_failed:${driveRes.status}`)
          const driveJson = await driveRes.json().catch(() => null) as { id?: string } | null
          if (!driveJson?.id) throw new Error('drive_file_id_missing')
          const backendRef = driveJson.id

          await $fetch<FinalizeUploadResponse>(
            `/api/workspaces/${workspaceId}/files/finalize-upload`,
            {
              method: 'POST',
              body: {
                path: item.path,
                size: entry.blob.size,
                content_type: item.content_type ?? undefined,
                backend: signed.backend,
                backend_ref: backendRef,
              },
            },
          )

          await opfs.remove(workspaceId, item.file_id)
          uploaded++
        }
        catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          state.errors.push({ path: item.path, reason })
          state.totalSkipped++
        }
      }

      state.totalMigrated += uploaded
      state.remaining = Math.max(0, prep.remaining - uploaded)
      if (uploaded === 0 || prep.done || state.remaining === 0) break
    }
  }

  function backendsFor(direction: LocalMigrationDirection): {
    source: 'google-drive' | 'local'
    target: 'google-drive' | 'local'
  } {
    if (direction === 'drive-to-local') return { source: 'google-drive', target: 'local' }
    return { source: 'local', target: 'google-drive' }
  }

  async function run(direction: LocalMigrationDirection) {
    const workspaceId = currentWorkspace.value?.id
    if (!workspaceId) return
    if (state.status === 'running') return

    state.status = 'running'
    state.direction = direction
    state.totalMigrated = 0
    state.totalSkipped = 0
    state.remaining = null
    state.errors = []

    try {
      if (direction === 'drive-to-local') {
        await runToLocal(workspaceId)
      }
      else {
        await runFromLocal(workspaceId)
      }

      // Folders are metadata anchors for the FileBrowser's provider icon. Once
      // a file pass clears the source, flip any orphan folder rows so they
      // display the new backend's icon instead of the disconnected one.
      if (state.remaining === 0) {
        const { source, target } = backendsFor(direction)
        const deviceId = target === 'local' ? useDeviceId() : undefined
        try {
          await $fetch(
            `/api/workspaces/${workspaceId}/files/migrate-folder-backends`,
            { method: 'POST', body: { source, target, ...(deviceId ? { device_id: deviceId } : {}) } },
          )
        }
        catch (err) {
          console.warn('[local-migration] folder-backends flip failed', err)
        }
      }

      state.status = 'done'
      if (state.totalMigrated > 0) {
        const msg = direction === 'drive-to-local'
          ? `Moved ${state.totalMigrated} files to this device.`
          : `Moved ${state.totalMigrated} files off this device.`
        toast.show(msg, 'info')
      }
    }
    catch (err) {
      console.error('[local-migration] run failed', err)
      state.status = 'failed'
      const message = (err as { statusMessage?: string })?.statusMessage
        || (err instanceof Error ? err.message : 'Migration failed.')
      toast.show(message, 'error')
    }
  }

  return { state, run }
}
