import { Readable } from 'node:stream'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  assertMembership,
  normalizePath,
  requireRead,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { quotaUserHeader } from '~~/server/utils/oauth/googleOAuth'

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'

// GET /api/workspaces/[id]/files/drive-stream?path=...
// Streams the bytes of a Drive-backed workspace file directly to the browser
// after the standard read-permission check. Replaces the prior Supabase-Storage
// drive-cache hop (which staged Drive bytes in a per-workspace bucket) so we
// can drop the workspace-files bucket entirely.

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const query = getQuery(event)
  const logicalPath = normalizePath(query.path)
  if (!logicalPath) {
    throw createError({ statusCode: 400, statusMessage: 'path is required.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireRead(supabase, workspaceId, logicalPath, user.sub)

  const admin = serverSupabaseServiceRole(event)
  const { data: row } = await admin
    .from('files')
    .select('backend, backend_ref, content_type')
    .eq('workspace_id', workspaceId)
    .eq('path', logicalPath)
    .maybeSingle()

  if (!row || row.backend !== 'google-drive' || !row.backend_ref) {
    throw createError({ statusCode: 404, statusMessage: 'Drive file reference missing.' })
  }

  const access = await resolveDriveAccess(admin, workspaceId)
  const driveRes = await fetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(row.backend_ref)}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${access.accessToken}`,
        ...quotaUserHeader(workspaceId),
      },
    },
  )
  if (!driveRes.ok || !driveRes.body) {
    const text = await driveRes.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: `Drive download failed: ${driveRes.status} ${text}`.trim(),
    })
  }

  setResponseStatus(event, 200)
  setResponseHeader(event, 'Content-Type', row.content_type ?? 'application/octet-stream')
  const length = driveRes.headers.get('content-length')
  if (length) setResponseHeader(event, 'Content-Length', Number(length))
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  return sendStream(event, Readable.fromWeb(driveRes.body as unknown as Parameters<typeof Readable.fromWeb>[0]))
})
