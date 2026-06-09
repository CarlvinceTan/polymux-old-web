import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2SignedDownloadURL } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { assertWorkflowMember, resolveWorkflowId } from '~~/server/utils/workspace/workflowAccess'

// GET /api/workflows/[id]/artifacts
// Returns: { artifacts: ArtifactRow[] }
//
// Lists every artifact recorded against this session, newest first. Any
// workspace member can read; writes go through the internal endpoint.
//
// For image/video artifacts the response includes a signed `preview_url` so
// the gallery can render thumbnails inline without N+1 round-trips. Other
// types (and downloads) mint URLs lazily via the dedicated download-url route.

const PREVIEW_TTL_SECONDS = 60 * 60

export interface ArtifactRow {
  id: string
  workflow_id: string
  workspace_id: string
  name: string
  mime_type: string | null
  size_bytes: number
  storage_path: string | null
  content: string | null
  created_by_agent_id: string | null
  created_at: string
  preview_url: string | null
}

function isPreviewable(name: string, mime: string | null): boolean {
  if (mime) {
    return mime.startsWith('image/')
      || mime.startsWith('video/')
      || mime.startsWith('audio/')
      || mime === 'application/pdf'
      || mime === 'text/html'
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'pdf' || ext === 'html' || ext === 'htm'
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  const workflowId = resolveWorkflowId(event)

  const supabase = await serverSupabaseClient(event)
  await assertWorkflowMember(supabase, workflowId, user.sub)

  const { data, error } = await supabase
    .from('artifacts')
    .select('id, workflow_id, workspace_id, name, mime_type, size_bytes, storage_path, content, created_by_agent_id, created_at')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[artifacts/list] error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load artifacts.' })
  }

  const rows = (data ?? []) as Omit<ArtifactRow, 'preview_url'>[]
  const previewable = rows.filter(r => r.storage_path && isPreviewable(r.name, r.mime_type))
  const previewMap = new Map<string, string>()
  if (previewable.length > 0) {
    // All artifacts in a workflow share one workspace_id, so we resolve the
    // workspace's B2 sub-key once and reuse it for every preview URL.
    const workspaceId = previewable[0]!.workspace_id
    const admin = serverSupabaseServiceRole(event)
    try {
      const wsKey = await ensureWorkspaceKey(admin, workspaceId, user.sub)
      // B2's get_download_authorization is per-prefix; with the prefix set to
      // the exact file key it effectively mints a single-file URL. We Promise-
      // allSettled so one bad row doesn't fail the whole listing — the affected
      // tile falls back to the placeholder icon.
      const results = await Promise.allSettled(
        previewable.map(r => b2SignedDownloadURL(wsKey, r.storage_path as string, PREVIEW_TTL_SECONDS)),
      )
      for (let i = 0; i < previewable.length; i++) {
        const res = results[i]
        if (res?.status === 'fulfilled') previewMap.set(previewable[i]!.id, res.value.url)
        else if (res?.status === 'rejected') {
          console.warn('[artifacts/list] b2 preview sign failed', res.reason)
        }
      }
    }
    catch (err) {
      console.warn('[artifacts/list] failed to resolve workspace b2 key; previews disabled', err)
    }
  }

  const artifacts: ArtifactRow[] = rows.map(r => ({
    ...r,
    preview_url: previewMap.get(r.id) ?? null,
  }))
  return { artifacts }
})
