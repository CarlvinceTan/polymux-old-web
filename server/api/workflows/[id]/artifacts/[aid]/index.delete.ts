import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2DeleteByKey } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import {
  assertWorkflowMember,
  resolveArtifactId,
  resolveWorkflowId,
} from '~~/server/utils/workspace/workflowAccess'

// DELETE /api/workflows/[id]/artifacts/[aid]
// Returns: { ok: true }
//
// Removes the artifact row and best-effort deletes its stored B2 object.
// The 24h cleanup job catches any orphaned objects on failure (PLAN §5.6).

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workflowId = resolveWorkflowId(event)
  const artifactId = resolveArtifactId(event)

  const supabase = await serverSupabaseClient(event)
  await assertWorkflowMember(supabase, workflowId, user.sub)

  const admin = serverSupabaseServiceRole(event)
  const { data: artifact, error: fetchErr } = await admin
    .from('artifacts')
    .select('id, storage_path, workspace_id')
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  if (artifact.storage_path) {
    try {
      const wsKey = await ensureWorkspaceKey(admin, artifact.workspace_id as string, user.sub)
      await b2DeleteByKey(wsKey, artifact.storage_path as string)
    }
    catch (err) {
      // Non-fatal — the cleanup job will pick orphans up. Logging only.
      console.warn('[artifacts/delete] b2 remove failed', err)
    }
  }

  const { error: delErr } = await admin
    .from('artifacts')
    .delete()
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
  if (delErr) {
    console.error('[artifacts/delete] row delete error', delErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete artifact.' })
  }

  return { ok: true as const }
})
