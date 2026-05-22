import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { b2GetUploadURL, b2WorkspaceKey } from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { cloudCap, fileCap } from '~~/server/utils/billing/planLimits'
import { planLimitsEnforce } from '~~/server/utils/billing/planLimitsEnforce'
import {
  assertMembership,
  basenameOf,
  normalizePath,
  parentOf,
  requireWrite,
  resolveWorkspaceId,
  sanitizeSegment,
} from '~~/server/utils/workspace/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { createResumableUploadSession } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workspaces/[id]/files/upload-url
// Body: { path, size, content_type?, preferred_backend? }
// Returns:
//   Drive: { url, token: '', path, backend: 'google-drive', method: 'PUT', expires_at }
//   B2:    { url, token: <authToken>, path, key, backend: 'b2', method: 'POST', expires_at }
//
// Mints a signed upload URL for direct upload. Caller must have write
// permission on the target parent path. Enforces per-file size cap and,
// for B2 uploads, the per-workspace Cloud cap (cloudCap(plan)).
//
// `preferred_backend` selects the target:
//   • 'google-drive' (default) — resumable Drive session, requires the workspace to have Drive connected.
//   • 'b2' — Polymux-managed Cloud storage. Requires plan with cloudCap > 0.

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

  const enforcePlanLimits = await planLimitsEnforce()
  if (enforcePlanLimits && size > fileCap(plan)) {
    throw createError({
      statusCode: 413,
      statusMessage: 'File exceeds your plan\'s per-file size limit.',
    })
  }

  const preferred = typeof body.preferred_backend === 'string' ? body.preferred_backend : ''
  const targetBackend: 'google-drive' | 'b2' = preferred === 'b2' ? 'b2' : 'google-drive'

  const contentType = typeof body.content_type === 'string' && body.content_type
    ? body.content_type
    : 'application/octet-stream'

  const admin = serverSupabaseServiceRole(event)

  const { data: existing } = await admin
    .from('files')
    .select('backend, backend_ref')
    .eq('workspace_id', workspaceId)
    .eq('path', logicalPath)
    .maybeSingle()

  if (targetBackend === 'b2') {
    // Cloud (B2) upload path. Plan-gated: free workspaces are sent here only
    // if the client explicitly asked for Cloud, so we reject with a 412 so
    // the caller knows to either upgrade or pick a different backend. When
    // plan_limits is off, the cap check is skipped but the bucket itself
    // still rejects uploads if there's no provisioned B2 key — that's an
    // infrastructure gate, not a plan gate.
    const cap = cloudCap(plan)
    if (enforcePlanLimits && cap <= 0) {
      throw createError({
        statusCode: 412,
        statusMessage: 'Upgrade to Pro or Max to use Cloud storage.',
      })
    }
    // Sum existing B2-backed bytes for this workspace; reject if the new
    // upload would push past the cap. Source of truth is the `files` table —
    // matches the agent-side check in pushFile.
    const { data: cloudRows } = await admin
      .from('files')
      .select('size_bytes')
      .eq('workspace_id', workspaceId)
      .eq('backend', 'b2')
    let cloudUsed = 0
    for (const row of cloudRows ?? []) {
      const n = Number((row as { size_bytes?: number | null }).size_bytes ?? 0)
      if (Number.isFinite(n) && n > 0) cloudUsed += Math.floor(n)
    }
    // Replacing an existing file at this path shouldn't double-count.
    let previousSize = 0
    if (existing?.backend === 'b2') {
      const { data: existingSize } = await admin
        .from('files')
        .select('size_bytes')
        .eq('workspace_id', workspaceId)
        .eq('path', logicalPath)
        .single()
      previousSize = Number(existingSize?.size_bytes ?? 0) || 0
    }
    if (enforcePlanLimits && cap > 0 && cloudUsed - previousSize + size > cap) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Cloud storage cap reached for your plan.',
        data: { used: cloudUsed, size, cap, plan },
      })
    }
    const wsKey = await ensureWorkspaceKey(admin, workspaceId, user.sub)
    const { uploadUrl, authorizationToken } = await b2GetUploadURL(wsKey)
    const key = b2WorkspaceKey(workspaceId, logicalPath)
    return {
      url: uploadUrl,
      token: authorizationToken,
      path: logicalPath,
      key,
      backend: 'b2' as const,
      method: 'POST' as const,
      content_type: contentType,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }
  }

  // Default: Google Drive resumable upload. No polymux-wide bytes cap —
  // the underlying quota is the user's own Drive. Local (OPFS) uploads
  // don't reach this endpoint; they're handled entirely client-side.
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
