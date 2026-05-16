import { serverSupabaseServiceRole } from '#supabase/server'
import { b2DownloadBytes } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { notifyPermissionsChanged } from '~~/server/utils/workspace/notifyAgent'
import { resolveArtifactId, resolveWorkflowId } from '~~/server/utils/workspace/workflowAccess'
import {
  basenameOf,
  normalizePath,
  requireWrite,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { uploadDriveFileBytes } from '~~/server/utils/oauth/googleOAuth'

// POST /api/internal/workflows/[id]/artifacts/[aid]/promote
// Body: { user_id: string, path: string }
// Returns: { storage_path, backend, file_id }
//
// Service-token-gated mirror of /api/workflows/[id]/artifacts/[aid]/promote.
// The Go agent calls this when the model invokes PromoteArtifact — it acts on
// behalf of the supplied user_id, so the same write-permission check applies.
// Requires Google Drive to be connected for the workspace.

interface Body {
  user_id?: unknown
  path?: unknown
}

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)
  const workflowId = resolveWorkflowId(event)
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
    .eq('workflow_id', workflowId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  const workspaceId = artifact.workspace_id as string
  await requireWrite(admin, workspaceId, targetPath, userId)

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
      const wsKey = await ensureWorkspaceKey(admin, workspaceId, userId)
      bytes = await b2DownloadBytes(wsKey, artifact.storage_path as string)
    }
    catch (err) {
      console.error('[internal/promote] b2 download error', err)
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
    backend: 'google-drive' as const,
    file_id: fileRow.id as string,
  }
})
