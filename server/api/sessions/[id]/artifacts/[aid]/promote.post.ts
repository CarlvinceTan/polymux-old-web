import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { notifyPermissionsChanged } from '~~/server/utils/notifyAgent'
import {
  assertSessionMember,
  resolveArtifactId,
  resolveSessionId,
} from '~~/server/utils/sessionAccess'
import {
  STORAGE_BUCKET,
  normalizePath,
  requireWrite,
  storageKey,
} from '~~/server/utils/workspaceFiles'

// POST /api/sessions/[id]/artifacts/[aid]/promote
// Body: { path }
// Returns: { storage_path, backend, file_id }
//
// Server-side copy from the `artifacts` bucket → `workspace-files` bucket at
// the requested logical path, then upserts a `files` row. The artifact is
// untouched — it lives until the session-cleanup job runs (§5.6).
//
// Permission: caller must have `write` on the *target* path. Inline-content
// artifacts can also be promoted; their bytes are written to the workspace
// bucket directly.

const ARTIFACTS_BUCKET = 'artifacts'

interface Body {
  path?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const sessionId = resolveSessionId(event)
  const artifactId = resolveArtifactId(event)
  const body = await readBody<Body>(event)
  const targetPath = normalizePath(body.path)
  if (!targetPath) {
    throw createError({ statusCode: 400, statusMessage: 'path is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { workspaceId } = await assertSessionMember(supabase, sessionId, user.sub)
  await requireWrite(supabase, workspaceId, targetPath, user.sub)

  const { data: artifact, error: fetchErr } = await supabase
    .from('artifacts')
    .select('id, name, mime_type, size_bytes, storage_path, content')
    .eq('id', artifactId)
    .eq('session_id', sessionId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  const admin = serverSupabaseServiceRole(event)
  const targetKey = storageKey(workspaceId, targetPath)
  const contentType = (artifact.mime_type as string | null) ?? 'application/octet-stream'

  // 1. Copy bytes from artifacts bucket → workspace bucket. Two paths:
  //    - storage_path is set: download from artifacts bucket, re-upload.
  //      (Supabase JS storage has no direct cross-bucket copy.)
  //    - content is set: upload the inline string body directly.
  let sizeBytes = Number(artifact.size_bytes ?? 0)
  if (artifact.storage_path) {
    const { data: blob, error: dlErr } = await admin.storage
      .from(ARTIFACTS_BUCKET)
      .download(artifact.storage_path as string)
    if (dlErr || !blob) {
      console.error('[artifacts/promote] download error', dlErr)
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
      console.error('[artifacts/promote] upload error', upErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to write to storage.' })
    }
  } else if (typeof artifact.content === 'string') {
    const buf = new TextEncoder().encode(artifact.content)
    sizeBytes = buf.byteLength
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(targetKey, buf, { contentType, upsert: true })
    if (upErr) {
      console.error('[artifacts/promote] inline upload error', upErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to write to storage.' })
    }
  } else {
    throw createError({ statusCode: 422, statusMessage: 'Artifact has no content to promote.' })
  }

  // 2. Upsert files metadata so the new path appears in the storage UI on next reload.
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
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })
    .select('id')
    .single()
  if (upsertErr || !fileRow) {
    console.error('[artifacts/promote] upsert files error', upsertErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record file metadata.' })
  }

  // 3. Tell the Go agent to invalidate any cached file index — the new file
  //    should show up in PullFolder responses without waiting for the 30s TTL.
  void notifyPermissionsChanged(workspaceId)

  return {
    storage_path: targetPath,
    backend: 'supabase' as const,
    file_id: fileRow.id as string,
  }
})
