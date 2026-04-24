import { useAppToast } from '~/composables/useAppToast'

export type LocalMigrationDirection =
  | 'supabase-to-local'
  | 'drive-to-local'
  | 'local-to-supabase'
  | 'local-to-drive'

interface PrepareItem {
  file_id: string
  path: string
  size_bytes: number
  content_type: string | null
}

interface PrepareResponse {
  ok: true
  source: 'supabase' | 'google-drive' | 'local'
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
  backend: 'supabase' | 'google-drive'
  expires_at: string
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
}

interface MigrationState {
  status: 'idle' | 'running' | 'done' | 'failed'
  direction: LocalMigrationDirection
  totalMigrated: number
  totalSkipped: number
  remaining: number | null
  errors: { path: string; reason: string }[]
}

// Module-scoped singleton, same pattern as useDriveMigration, so observers
// (FileBrowser, the settings page progress card) stay in sync.
const state = reactive<MigrationState>({
  status: 'idle',
  direction: 'supabase-to-local',
  totalMigrated: 0,
  totalSkipped: 0,
  remaining: null,
  errors: [],
})

const BATCH_SIZE = 10

export function useLocalMigration() {
  const { currentWorkspace } = useWorkspaces()
  const toast = useAppToast()

  function remoteFromDir(direction: LocalMigrationDirection): 'supabase' | 'google-drive' {
    if (direction === 'supabase-to-local' || direction === 'local-to-supabase') return 'supabase'
    return 'google-drive'
  }

  async function runToLocal(direction: LocalMigrationDirection, workspaceId: string) {
    const source = remoteFromDir(direction)
    const deviceId = useDeviceId()
    if (!deviceId) throw new Error('Device id unavailable')
    const opfs = useWorkspaceLocalFiles()
    if (!opfs.supported()) throw new Error('LOCAL_STORAGE_UNSUPPORTED')

    while (true) {
      const prep = await $fetch<PrepareResponse>(
        `/api/workspaces/${workspaceId}/files/prepare-local-migration`,
        { method: 'POST', body: { source, batch_size: BATCH_SIZE } },
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
        // Nothing in the batch made it — stop to avoid an infinite loop when
        // e.g. all files are too big or the network is down.
        state.remaining = prep.remaining
        break
      }

      const fin = await $fetch<FinalizeLocalResponse>(
        `/api/workspaces/${workspaceId}/files/finalize-local-migration`,
        { method: 'POST', body: { source, device_id: deviceId, items: committed } },
      )
      state.totalMigrated += fin.migrated
      for (const e of fin.errors) {
        state.errors.push({ path: e.file_id, reason: e.reason })
      }
      state.remaining = Math.max(0, prep.remaining - committed.length)
      if (prep.done || state.remaining === 0) break
    }
  }

  async function runFromLocal(direction: LocalMigrationDirection, workspaceId: string) {
    const target = remoteFromDir(direction)
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
                preferred_backend: target,
              },
            },
          )

          let backendRef: string | undefined
          if (signed.backend === 'google-drive') {
            const proxyUrl = `/api/workspaces/${workspaceId}/files/upload-drive-proxy?session_url=${encodeURIComponent(signed.url)}`
            const driveRes = await fetch(proxyUrl, {
              method: 'POST',
              headers: { 'Content-Type': item.content_type || entry.blob.type || 'application/octet-stream' },
              body: entry.blob,
            })
            if (!driveRes.ok) throw new Error(`drive_upload_failed:${driveRes.status}`)
            const driveJson = await driveRes.json().catch(() => null) as { id?: string } | null
            if (!driveJson?.id) throw new Error('drive_file_id_missing')
            backendRef = driveJson.id
          }
          else {
            const formData = new FormData()
            formData.append('cacheControl', '3600')
            formData.append('', entry.blob)
            const putRes = await fetch(signed.url, {
              method: 'PUT',
              headers: { 'x-upsert': 'true' },
              body: formData,
            })
            if (!putRes.ok) throw new Error(`supabase_upload_failed:${putRes.status}`)
          }

          await $fetch<FinalizeUploadResponse>(
            `/api/workspaces/${workspaceId}/files/finalize-upload`,
            {
              method: 'POST',
              body: {
                path: item.path,
                size: entry.blob.size,
                content_type: item.content_type ?? undefined,
                backend: signed.backend,
                ...(backendRef ? { backend_ref: backendRef } : {}),
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
      if (direction === 'supabase-to-local' || direction === 'drive-to-local') {
        await runToLocal(direction, workspaceId)
      }
      else {
        await runFromLocal(direction, workspaceId)
      }
      state.status = 'done'
      if (state.totalMigrated > 0) {
        const msg = direction.endsWith('to-local')
          ? `Moved ${state.totalMigrated} files to this device.`
          : `Moved ${state.totalMigrated} files off this device.`
        toast.show(msg, 'success')
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
