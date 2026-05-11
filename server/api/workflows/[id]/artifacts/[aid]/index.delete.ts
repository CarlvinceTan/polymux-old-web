import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertWorkflowMember,
  resolveArtifactId,
  resolveWorkflowId,
} from '~~/server/utils/workflowAccess'

// DELETE /api/workflows/[id]/artifacts/[aid]
// Returns: { ok: true }
//
// Removes the artifact row and best-effort deletes its stored object. The
// 24h cleanup job catches any orphaned objects on failure (PLAN §5.6).

const ARTIFACTS_BUCKET = 'artifacts'

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
    .select('id, storage_path')
    .eq('id', artifactId)
    .eq('workflow_id', workflowId)
    .single()
  if (fetchErr || !artifact) {
    throw createError({ statusCode: 404, statusMessage: 'Artifact not found.' })
  }

  if (artifact.storage_path) {
    const { error: rmErr } = await admin.storage
      .from(ARTIFACTS_BUCKET)
      .remove([artifact.storage_path as string])
    if (rmErr) {
      // Non-fatal — the cleanup job will pick it up. Logging only.
      console.warn('[artifacts/delete] storage remove failed', rmErr)
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
