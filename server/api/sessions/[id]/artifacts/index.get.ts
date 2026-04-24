import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { assertSessionMember, resolveSessionId } from '~~/server/utils/sessionAccess'

// GET /api/sessions/[id]/artifacts
// Returns: { artifacts: ArtifactRow[] }
//
// Lists every artifact recorded against this session, newest first. Any
// workspace member can read; writes go through the internal endpoint.
//
// For image/video artifacts the response includes a signed `preview_url` so
// the gallery can render thumbnails inline without N+1 round-trips. Other
// types (and downloads) mint URLs lazily via the dedicated download-url route.

const ARTIFACTS_BUCKET = 'artifacts'
const PREVIEW_TTL_SECONDS = 60 * 60

export interface ArtifactRow {
  id: string
  session_id: string
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

function isPreviewable(mime: string | null): boolean {
  if (!mime) return false
  return mime.startsWith('image/') || mime.startsWith('video/')
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  const sessionId = resolveSessionId(event)

  const supabase = await serverSupabaseClient(event)
  await assertSessionMember(supabase, sessionId, user.sub)

  const { data, error } = await supabase
    .from('artifacts')
    .select('id, session_id, workspace_id, name, mime_type, size_bytes, storage_path, content, created_by_agent_id, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[artifacts/list] error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load artifacts.' })
  }

  const rows = (data ?? []) as Omit<ArtifactRow, 'preview_url'>[]
  const previewable = rows.filter(r => r.storage_path && isPreviewable(r.mime_type))
  const previewMap = new Map<string, string>()
  if (previewable.length > 0) {
    const admin = serverSupabaseServiceRole(event)
    const { data: signed, error: signErr } = await admin.storage
      .from(ARTIFACTS_BUCKET)
      .createSignedUrls(previewable.map(r => r.storage_path as string), PREVIEW_TTL_SECONDS)
    if (signErr) {
      console.error('[artifacts/list] preview sign error', signErr)
      // Non-fatal — gallery falls back to placeholder icons.
    } else {
      for (let i = 0; i < previewable.length; i++) {
        const url = signed?.[i]?.signedUrl
        if (url) previewMap.set(previewable[i]!.id, url)
      }
    }
  }

  const artifacts: ArtifactRow[] = rows.map(r => ({
    ...r,
    preview_url: previewMap.get(r.id) ?? null,
  }))
  return { artifacts }
})
