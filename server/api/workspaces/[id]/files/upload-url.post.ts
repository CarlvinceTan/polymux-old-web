import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { fileCap, storageCap } from '~~/server/utils/planLimits'
import {
  assertMembership,
  basenameOf,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { createResumableUploadSession } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/upload-url
// Body: { path, size, content_type? }
// Returns: { url, token, path, backend, expires_at }
//
// Mints a signed upload URL for direct-to-Drive upload. Caller must have
// write permission on the target parent path. Enforces per-file size cap and
// workspace total storage cap based on workspace plan.

interface Body {
  path?: unknown
  size?: unknown
  content_type?: unknown
  preferred_backend?: unknown
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

  const segments = logicalPath.split('/')
  const fileName = segments[segments.length - 1] ?? ''
  if (!fileName || sanitizeSegment(fileName) !== fileName) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file name.' })
  }

  const size = Number(body.size)
  if (!Number.isFinite(size) || size < 0) {
    throw createError({ statusCode: 400, statusMessage: 'size must be a non-negative number.' })
  }

  const supabase = await serverSupabaseClient(event)
  await assertMembership(supabase, workspaceId, user.sub)
  await requireWrite(supabase, workspaceId, parentOf(logicalPath), user.sub)

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()

  if (wsError || !workspace) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load workspace plan.' })
  }

  const plan = typeof workspace.plan === 'string' ? workspace.plan : 'free'

  if (size > fileCap(plan)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'File exceeds your plan\'s per-file size limit.',
    })
  }

  const { data: usedRow } = await supabase
    .from('files')
    .select('size_bytes')
    .eq('workspace_id', workspaceId)
  const used = (usedRow ?? []).reduce((acc, r) => acc + (r.size_bytes ?? 0), 0)
  if (used + size > storageCap(plan)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Workspace storage cap reached for your plan.',
    })
  }

  const admin = serverSupabaseServiceRole(event)

  const { data: existing } = await admin
    .from('files')
    .select('backend, backend_ref')
    .eq('workspace_id', workspaceId)
    .eq('path', logicalPath)
    .maybeSingle()

  const { data: driveRow } = await admin
    .from('workspace_integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google-drive')
    .maybeSingle()
  if (!driveRow) {
    throw createError({
      statusCode: 412,
      statusMessage: 'Connect Google Drive to upload files.',
    })
  }

  const contentType = typeof body.content_type === 'string' && body.content_type
    ? body.content_type
    : 'application/octet-stream'

  const access = await resolveDriveAccess(admin, workspaceId)
  const url = await createResumableUploadSession(
    access.accessToken,
    {
      name: basenameOf(logicalPath),
      parents: existing?.backend_ref ? undefined : [access.rootFolderId],
      mimeType: contentType,
    },
    size,
    workspaceId,
  )
  return {
    url,
    token: '',
    path: logicalPath,
    backend: 'google-drive' as const,
    method: 'PUT' as const,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
})
