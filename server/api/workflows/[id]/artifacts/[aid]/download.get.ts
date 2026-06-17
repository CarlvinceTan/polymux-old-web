import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2DownloadBytes } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import {
  assertWorkflowMember,
  resolveArtifactId,
  resolveWorkflowId,
} from '~~/server/utils/workspace/workflowAccess'
import { basenameOf } from '~~/server/utils/workspace/workspaceFiles'

// GET /api/workflows/[id]/artifacts/[aid]/download
//
// Streams artifact bytes through our API with Content-Disposition so the
// browser saves under the artifact's name. Avoids cross-origin fetch/CORS
// issues with direct B2 signed URLs and works for inline-content artifacts.

function attachmentDisposition(filename: string): string {
  const base = basenameOf(filename) || filename || 'download'
  const safe = base.replace(/[\r\n"\\]/g, '_') || 'download'
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(base)}`
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workflowId = resolveWorkflowId(event)
  const artifactId = resolveArtifactId(event)

  const supabase = await serverSupabaseClient(event)
  await assertWorkflowMember(supabase, workflowId, user.sub)

  const { data: artifact, error } = await supabase
    .from('artifacts')
    .select('id, name, mime_type, storage_path, content, workspace_id')
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
    .single()
  if (error || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  const contentType = (artifact.mime_type as string | null) ?? 'application/octet-stream'
  const fileName = (artifact.name as string) || 'download'

  let body: Buffer
  if (typeof artifact.content === 'string') {
    body = Buffer.from(new TextEncoder().encode(artifact.content))
  }
  else if (artifact.storage_path) {
    try {
      const admin = serverSupabaseServiceRole(event)
      const wsKey = await ensureWorkspaceKey(admin, artifact.workspace_id as string, user.sub)
      body = await b2DownloadBytes(wsKey, artifact.storage_path as string)
    }
    catch (err) {
      console.error('[artifacts/download] b2 read error', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to read artifact.' })
    }
  }
  else {
    throw createError({ statusCode: 422, statusMessage: 'Artifact has no content to download.' })
  }

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Content-Disposition', attachmentDisposition(fileName))
  setHeader(event, 'Content-Length', body.byteLength)
  return body
})
