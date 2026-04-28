import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  storageKey,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/finalize-upload
// Body: { path, size, content_type?, backend?, backend_ref?, etag? }
//
// Called by the browser after a direct-to-storage PUT succeeds. Reconciles the
// metadata row. The `files` table has client-blocking RLS so this runs under
// the service role after a permission re-check.
//
// For Supabase uploads we verify the object exists in the bucket before
// writing the row. For Drive uploads the browser passes back the file id from
// the resumable upload's terminal response; we trust + record it.

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

  const requestedBackend: 'google-drive' | 'local' | 'supabase'
    = body.backend === 'google-drive'
      ? 'google-drive'
      : body.backend === 'local'
        ? 'local'
        : 'supabase'
  const contentType = typeof body.content_type === 'string' ? body.content_type : null

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

  if (requestedBackend === 'google-drive') {
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
  }

  const objectName = storageKey(workspaceId, logicalPath)

  // Verify the object actually exists before writing metadata so the row
  // always reflects real bytes.
  const { data: head, error: headError } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(objectName.split('/').slice(0, -1).join('/'), {
      search: objectName.split('/').pop(),
      limit: 1,
    })
  if (headError || !head || head.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Upload has not landed yet.' })
  }
  const actualSize = head[0]?.metadata?.size ?? Number(body.size) ?? 0

  const { error: upsertError } = await admin
    .from('files')
    .upsert({
      workspace_id: workspaceId,
      path: logicalPath,
      kind: 'file',
      backend: 'supabase',
      backend_ref: objectName,
      size_bytes: actualSize,
      content_type: contentType,
      backend_mtime: new Date().toISOString(),
      created_by: user.sub,
    }, { onConflict: 'workspace_id,path' })

  if (upsertError) {
    console.error('[files] finalize-upload upsert error', upsertError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record metadata.' })
  }

  return { ok: true as const, path: logicalPath, size: actualSize, backend: 'supabase' as const }
})
