import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ArtifactRow } from '~~/server/api/workflows/[id]/artifacts/index.get'

export type ArtifactType = 'image' | 'document' | 'code' | 'video' | 'audio' | 'archive' | 'other'

// SandboxArtifact is the gallery-facing shape. Backed by the `artifacts` row
// (PLAN §5.6) plus a derived display type and an optional pre-signed preview
// URL for image/video tiles.
export interface SandboxArtifact {
  id: string
  name: string
  type: ArtifactType
  size: number
  createdAt: string
  url?: string
  content?: string
  mimeType?: string
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'go', 'rs', 'rb', 'java', 'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'sh', 'bash', 'yaml', 'yml', 'json', 'toml', 'xml', 'html', 'css', 'scss', 'sql', 'md'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'])
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg'])
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'ics'])

function artifactTypeFromName(name: string, mime: string | null | undefined): ArtifactType {
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (CODE_EXTS.has(ext)) return 'code'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (ARCHIVE_EXTS.has(ext)) return 'archive'
  if (DOC_EXTS.has(ext)) return 'document'
  return 'other'
}

function rowToArtifact(row: ArtifactRow): SandboxArtifact {
  return {
    id: row.id,
    name: row.name,
    type: artifactTypeFromName(row.name, row.mime_type),
    size: Number(row.size_bytes ?? 0),
    createdAt: row.created_at,
    url: row.preview_url ?? undefined,
    content: row.content ?? undefined,
    mimeType: row.mime_type ?? undefined,
  }
}

export function useArtifacts(sessionId: Ref<string>) {
  const artifacts = useState<SandboxArtifact[]>(`session-artifacts-${sessionId.value}`, () => [])
  const loading = useState<boolean>(`session-artifacts-loading-${sessionId.value}`, () => false)
  const error = useState<string | null>(`session-artifacts-error-${sessionId.value}`, () => null)

  // Lazily-minted signed URLs for download (cached for the life of the page).
  const downloadUrls = useState<Record<string, { url: string, expiresAt: number }>>(
    `session-artifacts-urls-${sessionId.value}`,
    () => ({}),
  )

  let channel: RealtimeChannel | null = null

  async function refresh() {
    if (!sessionId.value) return
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ artifacts: ArtifactRow[] }>(
        `/api/workflows/${sessionId.value}/artifacts`,
      )
      artifacts.value = res.artifacts.map(rowToArtifact)
    }
    catch (err) {
      // 404 means the session is gone — either deleted, in a workspace the
      // caller no longer has access to, or a stale URL from before sign-in.
      // The /workflow/[id] layout reroutes to /workflow/new in that case;
      // logging here would just add noise on every such redirect.
      const status = (err as { status?: number, statusCode?: number })?.status
        ?? (err as { statusCode?: number })?.statusCode
      if (status === 404) {
        artifacts.value = []
      } else {
        console.error('[useArtifacts] refresh failed', err)
        error.value = 'Failed to load artifacts.'
      }
    }
    finally {
      loading.value = false
    }
  }

  function subscribe() {
    if (!import.meta.client) return
    if (!sessionId.value) return
    if (channel) return

    const supabase = useSupabaseClient()
    channel = supabase
      .channel(`artifacts:${sessionId.value}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'artifacts', filter: `workflow_id=eq.${sessionId.value}` },
        (payload) => {
          const row = payload.new as ArtifactRow
          // INSERT events from realtime omit preview_url (it's not a column).
          // For images/videos the gallery card still needs a URL; trigger a
          // cheap refresh so the list endpoint signs new previews.
          const next = rowToArtifact(row)
          artifacts.value = [next, ...artifacts.value.filter(a => a.id !== row.id)]
          if (next.type === 'image' || next.type === 'video') {
            void refresh()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'artifacts', filter: `workflow_id=eq.${sessionId.value}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) artifacts.value = artifacts.value.filter(a => a.id !== id)
        },
      )
      .subscribe()
  }

  function unsubscribe() {
    if (channel) {
      const supabase = useSupabaseClient()
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  async function getDownloadUrl(artifactId: string): Promise<string | null> {
    const cached = downloadUrls.value[artifactId]
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url
    try {
      const res = await $fetch<{ url: string, expires_at: string }>(
        `/api/workflows/${sessionId.value}/artifacts/${artifactId}/download-url`,
      )
      downloadUrls.value = {
        ...downloadUrls.value,
        [artifactId]: { url: res.url, expiresAt: new Date(res.expires_at).getTime() },
      }
      return res.url
    }
    catch (err) {
      console.error('[useArtifacts] getDownloadUrl failed', err)
      return null
    }
  }

  async function downloadArtifact(artifact: SandboxArtifact) {
    const link = document.createElement('a')
    if (artifact.content) {
      const blob = new Blob([artifact.content], { type: artifact.mimeType ?? 'text/plain' })
      link.href = URL.createObjectURL(blob)
    }
    else {
      const url = await getDownloadUrl(artifact.id)
      if (!url) return
      link.href = url
    }
    link.download = artifact.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function promote(artifactId: string, path: string): Promise<{ storage_path: string }> {
    return $fetch<{ storage_path: string }>(
      `/api/workflows/${sessionId.value}/artifacts/${artifactId}/promote`,
      { method: 'POST', body: { path } },
    )
  }

  async function removeArtifact(artifactId: string): Promise<boolean> {
    try {
      await $fetch(`/api/workflows/${sessionId.value}/artifacts/${artifactId}`, {
        method: 'DELETE',
      })
      // Optimistic local update; realtime DELETE will reconcile across tabs.
      artifacts.value = artifacts.value.filter(a => a.id !== artifactId)
      return true
    }
    catch (err) {
      console.error('[useArtifacts] removeArtifact failed', err)
      return false
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      void refresh()
      subscribe()
    })
    onBeforeUnmount(() => {
      unsubscribe()
    })
  }

  return {
    artifacts: readonly(artifacts),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    getDownloadUrl,
    downloadArtifact,
    promote,
    removeArtifact,
  }
}
