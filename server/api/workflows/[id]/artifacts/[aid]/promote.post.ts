import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2DownloadBytes } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { notifyPermissionsChanged } from '~~/server/utils/workspace/notifyAgent'
import {
  assertWorkflowMember,
  resolveArtifactId,
  resolveWorkflowId,
} from '~~/server/utils/workspace/workflowAccess'
import {
  basenameOf,
  normalizePath,
  requireWrite,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { uploadDriveFileBytes } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workflows/[id]/artifacts/[aid]/promote
// Body: { path }
// Returns: { storage_path, backend, file_id }
//
// Promotes a session artifact into the workspace as a real file. Requires
// Google Drive to be connected: bytes are uploaded to the workspace's Drive
// folder and a `files` row is upserted pointing at the new Drive file id.
//
// Permission: caller must have `write` on the *target* path. Inline-content
// artifacts can also be promoted; their bytes are encoded and uploaded.

interface Body {
  path?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workflowId = resolveWorkflowId(event)
  const artifactId = resolveArtifactId(event)
  const body = await readBody<Body>(event)
  const targetPath = normalizePath(body.path)
  if (!targetPath) {
    throw createError({ statusCode: 400, statusMessage: 'path is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { workspaceId } = await assertWorkflowMember(supabase, workflowId, user.sub)
  await requireWrite(supabase, workspaceId, targetPath, user.sub)

  const { data: artifact, error: fetchErr } = await supabase
    .from('artifacts')
    .select('id, name, mime_type, size_bytes, storage_path, content')
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: driveRow } = await admin
    .from('workspace_integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')
    .maybeSingle()
  if (!driveRow) {
    throw createError({
      statusCode: 412,
      statusMessage: 'Connect Google Drive to promote artifacts to your workspace.',
    })
  }

  const contentType = (artifact.mime_type as string | null) ?? 'application/octet-stream'

  let bytes: Buffer
  let sizeBytes = Number(artifact.size_bytes ?? 0)
  if (artifact.storage_path) {
    try {
      const wsKey = await ensureWorkspaceKey(admin, workspaceId, user.sub)
      bytes = await b2DownloadBytes(wsKey, artifact.storage_path as string)
    }
    catch (err) {
      console.error('[artifacts/promote] b2 download error', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to read artifact.' })
    }
    sizeBytes = bytes.byteLength
  }
  else if (typeof artifact.content === 'string') {
    bytes = Buffer.from(new TextEncoder().encode(artifact.content))
    sizeBytes = bytes.byteLength
  }
  else {
    throw createError({ statusCode: 422, statusMessage: 'Artifact has no content to promote.' })
  }

  const access = await resolveDriveAccess(admin, workspaceId)
  const driveFile = await uploadDriveFileBytes(
    access.accessToken,
    {
      name: basenameOf(targetPath),
      parents: [access.rootFolderId],
      mimeType: contentType,
    },
    bytes,
    workspaceId,
  )

  const { data: fileRow, error: upsertErr } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: targetPath,
      kind: 'file' as const,
      backend: 'google-drive' as const,
      backend_ref: driveFile.id,
      size_bytes: sizeBytes,
      content_type: contentType,
      backend_mtime: driveFile.modifiedTime ?? new Date().toISOString(),
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })
    .select('id')
    .single()
  if (upsertErr || !fileRow) {
    console.error('[artifacts/promote] upsert files error', upsertErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record file metadata.' })
  }

  void notifyPermissionsChanged(workspaceId)

  return {
    storage_path: targetPath,
    backend: 'google-drive' as const,
    file_id: fileRow.id as string,
  }
})
