import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  resolveWorkspaceId,
  storageKey,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { deleteDriveFile } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/finalize-local-migration
// Body: { source: 'supabase'|'google-drive', device_id: string, items: [{ file_id }] }
//
// Flips a batch of file rows from their current remote backend to
// backend='local', with `backend_ref` set to the caller's device id so
// /download-url can tell whether this browser is the device that holds
// the bytes. Best-effort cleans up the remote storage; cleanup failures
// are logged but don't fail the flip — the row already says "local" and
// orphaned remote bytes only waste quota.

interface Body {
  source?: unknown
  device_id?: unknown
  items?: unknown
}

interface ItemReport {
  file_id: string
  reason: string
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const body = await readBody<Body>(event).catch(() => ({})) as Body
  const source = body?.source === 'google-drive' ? 'google-drive' : 'supabase'
  const deviceId = typeof body?.device_id === 'string' ? body.device_id : ''
  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: 'device_id is required.' })
  }
  const items = Array.isArray(body?.items)
    ? body.items.filter((x): x is { file_id: string } =>
      !!x && typeof (x as { file_id?: unknown }).file_id === 'string',
    )
    : []
  if (items.length === 0) {
    return { ok: true as const, migrated: 0, errors: [] as ItemReport[] }
  }

  const supabase = await serverSupabaseClient(event)
  const { data: membership, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.sub)
    .single()
  if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can migrate workspace files.',
    })
  }

  const admin = serverSupabaseServiceRole(event)
  const fileIds = items.map(i => i.file_id)

  const { data: rows, error: rowError } = await admin
    .from('files')
    .select('id, path, backend, backend_ref')
    .eq('workspace_id', workspaceId)
    .in('id', fileIds)
  if (rowError) {
    console.error('[finalize-local-migration] row lookup failed', rowError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load files.' })
  }
  const rowMap = new Map((rows ?? []).map(r => [r.id, r]))

  const errors: ItemReport[] = []
  let migrated = 0

  // Drive access is lazy — only resolved if we actually need to delete a
  // Drive file, so the endpoint still works when source=supabase and Drive
  // isn't connected.
  let driveAccess: Awaited<ReturnType<typeof resolveDriveAccess>> | null = null
  async function driveAccessOrThrow() {
    if (!driveAccess) driveAccess = await resolveDriveAccess(admin, workspaceId)
    return driveAccess
  }

  for (const item of items) {
    const row = rowMap.get(item.file_id)
    if (!row) {
      errors.push({ file_id: item.file_id, reason: 'not_found' })
      continue
    }
    if (row.backend !== source) {
      // Already flipped (concurrent run) or on the wrong backend — skip.
      errors.push({ file_id: item.file_id, reason: `unexpected_backend:${row.backend}` })
      continue
    }

    const { error: updateError } = await admin
      .from('files')
      .update({
        backend: 'local',
        backend_ref: deviceId,
        etag: null,
        backend_mtime: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (updateError) {
      errors.push({ file_id: item.file_id, reason: `metadata_update_failed: ${updateError.message}` })
      continue
    }

    // Best-effort remote cleanup.
    try {
      if (source === 'supabase') {
        const key = row.backend_ref || storageKey(workspaceId, row.path)
        const { error: rmError } = await admin.storage.from(STORAGE_BUCKET).remove([key])
        if (rmError) console.warn('[finalize-local-migration] supabase cleanup failed', key, rmError)
      }
      else {
        if (row.backend_ref) {
          const access = await driveAccessOrThrow()
          await deleteDriveFile(access.accessToken, row.backend_ref, workspaceId)
        }
      }
    }
    catch (err) {
      console.warn('[finalize-local-migration] cleanup failed for', row.path, err)
    }

    migrated++
  }

  return {
    ok: true as const,
    migrated,
    errors,
  }
})
