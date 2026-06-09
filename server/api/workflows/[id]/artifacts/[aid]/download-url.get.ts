import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2SignedDownloadURL } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import {
  assertWorkflowMember,
  resolveArtifactId,
  resolveWorkflowId,
} from '~~/server/utils/workspace/workflowAccess'

// GET /api/workflows/[id]/artifacts/[aid]/download-url
// Returns: { url, expires_at }
//
// Mints a short-lived B2 signed download URL for the artifact's stored
// object. Inline-text artifacts (where `content` is set and `storage_path`
// is null) get a 404 — the client already has the body.

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
    .select('id, storage_path, workspace_id')
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
    .single()
  if (error || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }
  if (!artifact.storage_path) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Artifact has no stored object — content is inline.',
    })
  }

  const storagePath = artifact.storage_path as string
  const workspaceId = artifact.workspace_id as string
  const expiresIn = 60 * 60 // 1h, matches §16.11 leakage cap.

  try {
    const admin = serverSupabaseServiceRole(event)
    const wsKey = await ensureWorkspaceKey(admin, workspaceId, user.sub)
    const signed = await b2SignedDownloadURL(wsKey, storagePath, expiresIn)
    return { url: signed.url, expires_at: signed.expiresAt }
  }
  catch (err) {
    console.error('[artifacts/download-url] b2 sign error', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to mint download URL.' })
  }
})
