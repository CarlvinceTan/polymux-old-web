import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'

// POST /api/workspaces/[id]/files/finalize-upload
// Body: { path, size, content_type?, backend?, backend_ref?, etag? }
//
// Called by the browser after a direct-to-storage PUT succeeds. Reconciles the
// metadata row. The `files` table has client-blocking RLS so this runs under
// the service role after a permission re-check.
//
// Drive uploads pass back the file id from the resumable upload's terminal
// response; we trust + record it. Local uploads carry the device id.

interface Body {
  path?: unknown
  size?: unknown
  content_type?: unknown
  backend?: unknown
  backend_ref?: unknown
  etag?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)
  const logicalPath = normalizePath(body.path)
  if (!logicalPath) {
    throw createError({ statusCode: 400, statusMessage: 'path is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireWrite(supabase, workspaceId, parentOf(logicalPath), user.sub)

  const admin = serverSupabaseServiceRole(event)

  const requestedBackend: 'google-drive' | 'local' | 'b2'
    = body.backend === 'local'
      ? 'local'
      : body.backend === 'b2'
        ? 'b2'
        : 'google-drive'
  const contentType = typeof body.content_type === 'string' ? body.content_type : null

  if (requestedBackend === 'b2') {
    // B2 (Cloud) upload finalize. The browser hit the B2 upload URL minted
    // by upload-url.post.ts and got back a fileId + SHA1; we trust + record.
    // Bytes are already in the bucket at workspaces/{ws}/main/{path}, so no
    // server-side verification is needed beyond the SHA1 round-trip that B2
    // already did during upload.
    const backendRef = typeof body.backend_ref === 'string' ? body.backend_ref : ''
    if (!backendRef) {
      throw createError({ statusCode: 400, statusMessage: 'backend_ref (B2 fileId) required for cloud uploads.' })
    }
    const size = Number(body.size) || 0
    const etag = typeof body.etag === 'string' ? body.etag : null

    const { error: upsertError } = await admin
      .from('files')
      .upsert({
        workspace_id: workspaceId,
        path: logicalPath,
        kind: 'file',
        backend: 'b2',
        backend_ref: backendRef,
        size_bytes: size,
        content_type: contentType,
        etag,
        backend_mtime: new Date().toISOString(),
        created_by: user.sub,
      }, { onConflict: 'workspace_id,path' })

    if (upsertError) {
      console.error('[files] finalize-upload (b2) upsert error', upsertError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to record metadata.' })
    }

    return { ok: true as const, path: logicalPath, size, backend: 'b2' as const }
  }

  if (requestedBackend === 'local') {
    // Bytes live in the client's OPFS — we never see them. `backend_ref`
    // carries the device id that holds the file so other devices / teammates
    // can tell they don't have access locally. We return `file_id` so the
    // client can key its OPFS entry to match what /download-url hands back.
    const backendRef = typeof body.backend_ref === 'string' ? body.backend_ref : ''
    if (!backendRef) {
      throw createError({ statusCode: 400, statusMessage: 'backend_ref (device id) required for local uploads.' })
    }
    const size = Number(body.size) || 0

    const { data: upserted, error: upsertError } = await admin
      .from('files')
      .upsert({
        workspace_id: workspaceId,
        path: logicalPath,
        kind: 'file',
        backend: 'local',
        backend_ref: backendRef,
        size_bytes: size,
        content_type: contentType,
        etag: null,
        backend_mtime: new Date().toISOString(),
        created_by: user.sub,
      }, { onConflict: 'workspace_id,path' })
      .select('id')
      .single()

    if (upsertError || !upserted) {
      console.error('[files] finalize-upload (local) upsert error', upsertError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to record metadata.' })
    }

    return {
      ok: true as const,
      path: logicalPath,
      size,
      backend: 'local' as const,
      file_id: upserted.id as string,
    }
  }

  const backendRef = typeof body.backend_ref === 'string' ? body.backend_ref : ''
  if (!backendRef) {
    throw createError({ statusCode: 400, statusMessage: 'backend_ref (Drive file id) required for Drive uploads.' })
  }
  const size = Number(body.size) || 0
  const etag = typeof body.etag === 'string' ? body.etag : null

  const { error: upsertError } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: logicalPath,
      kind: 'file',
      backend: 'google-drive',
      backend_ref: backendRef,
      size_bytes: size,
      content_type: contentType,
      etag,
      backend_mtime: new Date().toISOString(),
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })

  if (upsertError) {
    console.error('[files] finalize-upload (drive) upsert error', upsertError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record metadata.' })
  }

  return { ok: true as const, path: logicalPath, size, backend: 'google-drive' as const }
})
