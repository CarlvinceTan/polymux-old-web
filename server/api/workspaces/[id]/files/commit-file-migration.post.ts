import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'
import { b2DeleteByKey, b2WorkspaceKey } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { deleteDriveFile } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workspaces/[id]/files/commit-file-migration
//
// Server half of a CLIENT-driven, local-involved cross-provider file move
// (local→b2, local→drive, b2→local, drive→local). The client has already
// transferred the bytes to the destination backend; this endpoint reconciles
// metadata and drops the source.
//
//   • Into Cloud / Drive (source is 'local'): the client POSTed the bytes to
//     B2 / Drive itself, so it passes `newRow` and we upsert the destination
//     row here. The OPFS source bytes are removed by the client (opfs.remove).
//   • Out of Cloud / Drive (target is 'local'): the client already called
//     /finalize-upload to create the local destination row, so `newRow` is
//     omitted; we just delete the source B2 object / Drive file.
//
// Order matters: the destination bytes + row already exist when we run, so we
// only ever delete the SOURCE here — a failure leaves the destination intact.
// Object deletes are best-effort (an orphaned source object only wastes
// quota); the source ROW delete is the load-bearing step.
//
// Body: {
//   oldPath: string,
//   oldBackend: 'local' | 'google-drive' | 'b2',
//   oldRef?: string | null,                 // source backend_ref (drive/b2 fileId)
//   newPath: string,
//   newRow?: {                              // present → upsert destination row
//     backend: 'b2' | 'google-drive',
//     backend_ref: string,
//     size: number,
//     content_type?: string | null,
//     etag?: string | null,
//   } | null,
// }

interface NewRow {
  backend?: unknown
  backend_ref?: unknown
  size?: unknown
  content_type?: unknown
  etag?: unknown
}
interface Body {
  oldPath?: unknown
  oldBackend?: unknown
  oldRef?: unknown
  newPath?: unknown
  newRow?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)

  const oldPath = normalizePath(body.oldPath)
  const newPath = normalizePath(body.newPath)
  if (!oldPath || !newPath) {
    throw createError({ statusCode: 400, statusMessage: 'oldPath and newPath are required.' })
  }
  const oldBackend = body.oldBackend
  if (oldBackend !== 'local' && oldBackend !== 'google-drive' && oldBackend !== 'b2') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid oldBackend.' })
  }
  const oldRef = typeof body.oldRef === 'string' ? body.oldRef : null

  // Same gate as /files/migrate-items: cross-provider moves are owner/admin
  // only, so the two halves of a single move agree on who's allowed.
  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can move workspace files across storage.',
    })
  }

  const admin = serverSupabaseServiceRole(event)

  // 1. Upsert the destination row when the client wrote the bytes to a
  //    remote backend itself (into Cloud / Drive). For target=local the client
  //    already created the row via /finalize-upload, so newRow is omitted.
  const raw = body.newRow
  if (raw && typeof raw === 'object') {
    const nr = raw as NewRow
    const backend = nr.backend === 'b2' ? 'b2' : nr.backend === 'google-drive' ? 'google-drive' : null
    const backendRef = typeof nr.backend_ref === 'string' ? nr.backend_ref : ''
    if (!backend || !backendRef) {
      throw createError({ statusCode: 400, statusMessage: 'newRow requires backend and backend_ref.' })
    }
    const { error: upsertError } = await admin
      .from('files')
      .upsert({
        workspace_id: workspaceId,
        path: newPath,
        kind: 'file',
        backend,
        backend_ref: backendRef,
        size_bytes: Number(nr.size) || 0,
        content_type: typeof nr.content_type === 'string' ? nr.content_type : null,
        etag: typeof nr.etag === 'string' ? nr.etag : null,
        backend_mtime: new Date().toISOString(),
        created_by: user.sub,
      }, { onConflict: 'workspace_id,path' })
    if (upsertError) {
      console.error('[commit-file-migration] destination upsert failed', upsertError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to record destination metadata.' })
    }
  }

  // 2. Delete the SOURCE backend object (best-effort). Local bytes live in the
  //    browser's OPFS, so the client removes those itself — nothing to do here.
  try {
    if (oldBackend === 'b2') {
      const creds = await ensureWorkspaceKey(admin, workspaceId, user.sub)
      await b2DeleteByKey(creds, b2WorkspaceKey(workspaceId, oldPath))
    }
    else if (oldBackend === 'google-drive' && oldRef) {
      const access = await resolveDriveAccess(admin, workspaceId)
      await deleteDriveFile(access.accessToken, oldRef, workspaceId)
    }
  }
  catch (err) {
    console.warn('[commit-file-migration] source object cleanup failed for', oldPath, err)
  }

  // 3. Drop the old-path row when the move actually changed the path. When the
  //    path is unchanged (in-place provider switch), step 1 / the client's
  //    finalize-upload already replaced the single (workspace_id, path) row, so
  //    deleting here would remove the freshly-written destination.
  if (newPath !== oldPath) {
    const { error: deleteError } = await admin
      .from('files')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('path', oldPath)
    if (deleteError) {
      console.error('[commit-file-migration] source row delete failed', deleteError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to remove source metadata.' })
    }
  }

  return { ok: true as const, oldPath, newPath }
})
