import { serverSupabaseServiceRole } from '#supabase/server'
import { requireInternalToken } from '~~/server/utils/internalAuth'
import { normalizePath, resolveWorkspaceId } from '~~/server/utils/workspaceFiles'

// POST /api/internal/workspaces/[id]/files/upsert
// Body: {
//   path: string,
//   backend: 'google-drive' | 'local',
//   backend_ref: string,
//   size: number,
//   etag?: string,
//   mtime?: string (ISO),
//   content_type?: string,
//   created_by?: string (user UUID — workspace owner for autonomous runs)
// }
//
// Called by Go after a successful PushFile / PushFolder upload so the metadata
// index reflects the new state. Kind is always 'file' here — folders are
// implicit in the path segments.

interface Body {
  path?: unknown
  backend?: unknown
  backend_ref?: unknown
  size?: unknown
  etag?: unknown
  mtime?: unknown
  content_type?: unknown
  created_by?: unknown
}

const ALLOWED_BACKENDS = new Set(['google-drive', 'local'])

export default defineEventHandler(async (event) => {
  await requireInternalToken(event)

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)

  const path = normalizePath(body.path)
  if (!path) {
    throw createError({ statusCode: 400, statusMessage: 'path is required.' })
  }

  const backend = typeof body.backend === 'string' ? body.backend : ''
  if (!ALLOWED_BACKENDS.has(backend)) {
    throw createError({ statusCode: 400, statusMessage: 'backend is required and must be one of google-drive, local.' })
  }

  const size = Number(body.size)
  if (!Number.isFinite(size) || size < 0) {
    throw createError({ statusCode: 400, statusMessage: 'size must be a non-negative number.' })
  }

  const backendRef = typeof body.backend_ref === 'string' && body.backend_ref ? body.backend_ref : null
  const etag = typeof body.etag === 'string' && body.etag ? body.etag : null
  const contentType = typeof body.content_type === 'string' && body.content_type ? body.content_type : null
  const mtime = typeof body.mtime === 'string' && body.mtime ? body.mtime : null
  const createdBy = typeof body.created_by === 'string' && body.created_by ? body.created_by : null

  const admin = serverSupabaseServiceRole(event)

  const row = {
    workspace_id: workspaceId,
    path,
    kind: 'file' as const,
    backend,
    backend_ref: backendRef,
    size_bytes: size,
    content_type: contentType,
    etag,
    backend_mtime: mtime,
    created_by: createdBy,
  }

  const { data, error } = await admin
    .from('files')
    .upsert(row, { onConflict: 'workspace_id,path' })
    .select('id, etag, backend_mtime')
    .single()

  if (error || !data) {
    console.error('[internal/files/upsert] error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upsert file metadata.' })
  }

  return {
    id: data.id,
    path,
    etag: data.etag,
    mtime: data.backend_mtime,
  }
})
