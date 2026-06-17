import type { SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { cloudCap, fileCap } from '~~/server/utils/billing/planLimits'
import { planLimitsEnforce } from '~~/server/utils/billing/planLimitsEnforce'
import { b2DownloadBytes, b2UploadBytes, b2WorkspaceKey } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { uploadDriveFileBytes } from '~~/server/utils/oauth/googleOAuth'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
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
  sanitizeSegment,
} from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workflows/[id]/artifacts/[aid]/promote
// Body: { path }
// Returns: { storage_path, backend, file_id }
//
// Promotes a session artifact into the workspace as a real file. Uses Google
// Drive when connected; otherwise falls back to Polymux Cloud (B2) when the
// workspace plan allows it.

interface Body {
  path?: unknown
}

async function assertCloudCapacity(
  admin: SupabaseClient,
  workspaceId: string,
  targetPath: string,
  sizeBytes: number,
  plan: string,
  enforcePlanLimits: boolean,
) {
  const cap = cloudCap(plan)
  if (enforcePlanLimits && cap <= 0) {
    throw createError({
      statusCode: 412,
      statusMessage: 'Connect Google Drive or upgrade to Pro to save artifacts to storage.',
    })
  }

  const { data: cloudRows } = await admin
    .from('files')
    .select('size_bytes')
    .eq('workspace_id', workspaceId)
    .eq('backend', 'b2')
  let cloudUsed = 0
  for (const row of cloudRows ?? []) {
    const n = Number((row as { size_bytes?: number | null }).size_bytes ?? 0)
    if (Number.isFinite(n) && n > 0) cloudUsed += Math.floor(n)
  }

  let previousSize = 0
  const { data: existing } = await admin
    .from('files')
    .select('backend, size_bytes')
    .eq('workspace_id', workspaceId)
    .eq('path', targetPath)
    .maybeSingle()
  if (existing?.backend === 'b2') {
    previousSize = Number(existing.size_bytes ?? 0) || 0
  }

  if (enforcePlanLimits && cap > 0 && cloudUsed - previousSize + sizeBytes > cap) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Cloud storage cap reached for your plan.',
      data: { used: cloudUsed, size: sizeBytes, cap, plan },
    })
  }
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

  const segments = targetPath.split('/')
  const fileName = segments[segments.length - 1] ?? ''
  if (!fileName || sanitizeSegment(fileName) !== fileName) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file name.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { workspaceId } = await assertWorkflowMember(supabase, workflowId, user.sub)
  await requireWrite(supabase, workspaceId, targetPath, user.sub)

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  if (wsError || !workspace) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load workspace plan.' })
  }
  const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'
  const enforcePlanLimits = await planLimitsEnforce()

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

  if (enforcePlanLimits && sizeBytes > fileCap(plan)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'File exceeds your plan\'s per-file size limit.',
    })
  }

  const { data: driveRow } = await admin
    .from('workspace_integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')
    .maybeSingle()

  if (driveRow) {
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
  }

  await assertCloudCapacity(admin, workspaceId, targetPath, sizeBytes, plan, enforcePlanLimits)

  const wsKey = await ensureWorkspaceKey(admin, workspaceId, user.sub)
  const key = b2WorkspaceKey(workspaceId, targetPath)
  let uploaded
  try {
    uploaded = await b2UploadBytes(wsKey, key, contentType, bytes)
  }
  catch (err) {
    console.error('[artifacts/promote] b2 upload error', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save artifact to Cloud storage.' })
  }

  const { data: fileRow, error: upsertErr } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: targetPath,
      kind: 'file' as const,
      backend: 'b2' as const,
      backend_ref: uploaded.fileId,
      size_bytes: sizeBytes,
      content_type: contentType,
      etag: uploaded.contentSha1,
      backend_mtime: new Date().toISOString(),
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
    backend: 'b2' as const,
    file_id: fileRow.id as string,
  }
})
