import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertSessionMember,
  resolveArtifactId,
  resolveSessionId,
} from '~~/server/utils/sessionAccess'

// GET /api/sessions/[id]/artifacts/[aid]/download-url
// Returns: { url, expires_at }
//
// Mints a short-lived signed URL for the artifact's stored object. Inline-text
// artifacts (where `content` is set and `storage_path` is null) get a 404 —
// the client already has the body.

const ARTIFACTS_BUCKET = 'artifacts'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const sessionId = resolveSessionId(event)
  const artifactId = resolveArtifactId(event)

  const supabase = await serverSupabaseClient(event)
  await assertSessionMember(supabase, sessionId, user.sub)

  const { data: artifact, error } = await supabase
    .from('artifacts')
    .select('id, storage_path')
    .eq('id', artifactId)
    .eq('session_id', sessionId)
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

  const expiresIn = 60 * 60 // 1h, matches §16.11 leakage cap.
  const admin = serverSupabaseServiceRole(event)
  const { data: signed, error: signErr } = await admin.storage
    .from(ARTIFACTS_BUCKET)
    .createSignedUrl(artifact.storage_path as string, expiresIn)
  if (signErr || !signed) {
    console.error('[artifacts/download-url] sign error', signErr)
    throw createError({ statusCode: 500, statusMessage: 'Failed to mint download URL.' })
  }

  return {
    url: signed.signedUrl,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
})
