import { serverSupabaseServiceRole } from '#supabase/server'
import { revokeWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { requirePolymuxSecret } from '~~/server/utils/security/internalAuth'
import { resolveWorkspaceId } from '~~/server/utils/workspace/workspaceFiles'

// POST /api/internal/workspaces/[id]/b2-key/revoke
// No body. Returns: { ok: true }
//
// Called by the Go workspace-delete handler before the workspace row is
// dropped. Best-effort: deletes the per-workspace B2 sub-key (so it can't be
// used to access the bucket post-deletion) and removes the row from
// workspace_integrations. Idempotent — no-ops if the workspace never had a
// key minted.
//
// Failure here is logged but doesn't block workspace deletion; the
// b2KeyManager already handles partial-failure (row removed even if the B2
// API call errors).

export default defineEventHandler(async (event) => {
  await requirePolymuxSecret(event)
  const workspaceId = resolveWorkspaceId(event)

  const admin = serverSupabaseServiceRole(event)
  try {
    await revokeWorkspaceKey(admin, workspaceId)
  }
  catch (err) {
    // Surface but don't fail — the caller wants the workspace gone either way.
    console.error('[internal/b2-key/revoke] revoke failed', err)
    return { ok: false as const, error: 'revoke_failed' }
  }
  return { ok: true as const }
})
