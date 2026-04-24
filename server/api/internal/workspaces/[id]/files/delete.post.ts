import { serverSupabaseServiceRole } from '#supabase/server'
import { requireInternalToken } from '~~/server/utils/internalAuth'
import { normalizePath, resolveWorkspaceId } from '~~/server/utils/workspaceFiles'

// POST /api/internal/workspaces/[id]/files/delete
// Body: { paths: string[] }  (one or many)
//
// Records a metadata delete after Go has removed the bytes from the backend.
// Only touches the `files` metadata table — the bytes themselves are Go's
// responsibility via the backend API.

interface Body {
  paths?: unknown
}

export default defineEventHandler(async (event) => {
  await requireInternalToken(event)

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event)

  const rawPaths = Array.isArray(body.paths) ? body.paths : []
  const paths = rawPaths
    .map(raw => normalizePath(raw))
    .filter(p => p.length > 0)

  if (paths.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'paths must contain at least one non-empty path.' })
  }

  const admin = serverSupabaseServiceRole(event)

  const { error, count } = await admin
    .from('files')
    .delete({ count: 'exact' })
    .eq('workspace_id', workspaceId)
    .in('path', paths)

  if (error) {
    console.error('[internal/files/delete] error', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete file metadata.' })
  }

  return { deleted: count ?? 0 }
})
