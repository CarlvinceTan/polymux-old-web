import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  normalizePath,
  requireRead,
  resolveWorkspaceId,
  storageKey,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { downloadDriveFileBytes } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/download-url
// Body: { path, expires_in? }
// Returns: { url, backend, expires_at }
//
// Backend dispatch:
//  - 'supabase' → Supabase Storage signed URL (direct browser GET).
//  - 'google-drive' → Drive's `?alt=media` requires the workspace's access
//    token, which we never expose to the browser. Instead we cache the bytes
//    into a one-shot signed URL on Supabase Storage under a `_drive_cache/`
//    prefix and return that. Fine for typical file sizes; very large files
//    would warrant a streaming proxy route.

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
    .select('backend, backend_ref, content_type')
    .eq('workspace_id', workspaceId)
    .eq('path', logicalPath)
    .maybeSingle()

  const backend = row?.backend ?? 'supabase'

  if (backend === 'google-drive') {
    if (!row?.backend_ref) {
      throw createError({ statusCode: 404, statusMessage: 'Drive file reference missing.' })
    }
    const access = await resolveDriveAccess(admin, workspaceId)
    const bytes = await downloadDriveFileBytes(access.accessToken, row.backend_ref, workspaceId)

    // Stash in Supabase under a per-workspace cache prefix so we can hand the
    // browser a signed URL — keeps tokens off the client. Upsert overwrites
    // any prior cache entry for the same path.
    const cacheKey = `${workspaceId}/_drive_cache/${logicalPath}`
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(cacheKey, bytes, {
        contentType: row.content_type ?? 'application/octet-stream',
        upsert: true,
      })
    if (upErr) {
      console.error('[files/download-url] drive cache upload failed', upErr)
      throw createError({ statusCode: 500, statusMessage: 'Failed to stage Drive file for download.' })
    }
    const { data: signed, error: signError } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(cacheKey, expiresIn)
    if (signError || !signed) {
      console.error('[files/download-url] drive cache sign failed', signError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to mint Drive download URL.' })
    }
    return {
      url: signed.signedUrl,
      backend: 'google-drive' as const,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }
  }

  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storageKey(workspaceId, logicalPath), expiresIn)

  if (signError || !signed) {
    console.error('[files] createSignedUrl error', signError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to mint download URL.' })
  }

  return {
    url: signed.signedUrl,
    backend: 'supabase' as const,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
})
