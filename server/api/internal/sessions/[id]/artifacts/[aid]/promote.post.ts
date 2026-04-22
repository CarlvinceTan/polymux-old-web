import { serverSupabaseServiceRole } from '#supabase/server'
import { requireInternalToken } from '~~/server/utils/internalAuth'
import { notifyPermissionsChanged } from '~~/server/utils/notifyAgent'
import { resolveArtifactId, resolveSessionId } from '~~/server/utils/sessionAccess'
import {
  STORAGE_BUCKET,
  normalizePath,
  requireWrite,
  storageKey,
} from '~~/server/utils/workspaceFiles'

// POST /api/internal/sessions/[id]/artifacts/[aid]/promote
// Body: { user_id: string, path: string }
// Returns: { storage_path, backend, file_id }
//
// Service-token-gated mirror of /api/sessions/[id]/artifacts/[aid]/promote.
// The Go agent calls this when the model invokes PromoteArtifact — it acts on
// behalf of the supplied user_id, so the same write-permission check applies.

const ARTIFACTS_BUCKET = 'artifacts'

interface Body {
  user_id?: unknown
  path?: unknown
}

export default defineEventHandler(async (event) => {
  await requireInternalToken(event)
  const sessionId = resolveSessionId(event)
  const artifactId = resolveArtifactId(event)
  const body = await readBody<Body>(event)

  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const targetPath = normalizePath(body.path)
  if (!userId || !targetPath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'user_id and path are required.',
    })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: artifact, error: fetchErr } = await admin
    .from('artifacts')
    .select('id, name, mime_type, size_bytes, storage_path, content, workspace_id')
    .eq('id', artifactId)
    .eq('session_id', sessionId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  const workspaceId = artifact.workspace_id as string
  await requireWrite(admin, workspaceId, targetPath, userId)

  const targetKey = storageKey(workspaceId, targetPath)
  const contentType = (artifact.mime_type as string | null) ?? 'application/octet-stream'

  let sizeBytes = Number(artifact.size_bytes ?? 0)
  if (artifact.storage_path) {
    const { data: blob, error: dlErr } = await admin.storage
      .from(ARTIFACTS_BUCKET)
      .download(artifact.storage_path as string)
    if (dlErr || !blob) {
      console.error('[internal/promote] download error', dlErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to read artifact.' })
    }
    const arrayBuf = await blob.arrayBuffer()
    sizeBytes = arrayBuf.byteLength
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(targetKey, new Uint8Array(arrayBuf), {
        contentType,
        upsert: true,
      })
    if (upErr) {
      console.error('[internal/promote] upload error', upErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to write to storage.' })
    }
  }
  else if (typeof artifact.content === 'string') {
    const buf = new TextEncoder().encode(artifact.content)
    sizeBytes = buf.byteLength
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(targetKey, buf, { contentType, upsert: true })
    if (upErr) {
      console.error('[internal/promote] inline upload error', upErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to write to storage.' })
    }
  }
  else {
    throw createError({ statusCode: 422, statusMessage: 'Artifact has no content to promote.' })
  }

  const { data: fileRow, error: upsertErr } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: targetPath,
      kind: 'file' as const,
      backend: 'supabase' as const,
      backend_ref: targetKey,
      size_bytes: sizeBytes,
      content_type: contentType,
      created_by: userId,
    }, { onConflict: 'workspace_id,path' })
    .select('id')
    .single()
  if (upsertErr || !fileRow) {
    console.error('[internal/promote] upsert files error', upsertErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record file metadata.' })
  }

  void notifyPermissionsChanged(workspaceId)

  return {
    storage_path: targetPath,
    backend: 'supabase' as const,
    file_id: fileRow.id as string,
  }
})
