import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  requireRead,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/download-url
// Body: { path, expires_in? }
// Returns: { url, backend, expires_at }
//
// Backend dispatch:
//  - 'google-drive' → URL of the same-origin streaming proxy
//    (/files/drive-stream) which fetches the bytes from Drive using the
//    workspace's server-side OAuth token. Tokens never reach the browser.
//  - 'local' → no URL; the client reads from its own OPFS if it was the
//    creating device, otherwise shows "not available here".

interface Body {
  path?: unknown
  expires_in?: unknown
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

  const rawExpires = Number(body.expires_in)
  const expiresIn = Number.isFinite(rawExpires) && rawExpires > 0
    ? Math.min(Math.floor(rawExpires), 60 * 60 * 24)
    : 3600

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireRead(supabase, workspaceId, logicalPath, user.sub)

  const admin = serverSupabaseServiceRole(event)

  const { data: row } = await admin
    .from('files')
    .select('id, backend, backend_ref, content_type')
    .eq('workspace_id', workspaceId)
    .eq('path', logicalPath)
    .maybeSingle()

  const backend = row?.backend ?? 'google-drive'

  if (backend === 'local') {
    return {
      url: '',
      backend: 'local' as const,
      device_id: row?.backend_ref ?? '',
      file_id: row?.id ?? '',
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }
  }

  if (!row?.backend_ref) {
    throw createError({ statusCode: 404, statusMessage: 'Drive file reference missing.' })
  }

  const url = `/api/workspaces/${workspaceId}/files/drive-stream?path=${encodeURIComponent(logicalPath)}`
  return {
    url,
    backend: 'google-drive' as const,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
})
