import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  basenameOf,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { deleteDriveFile, uploadDriveFileBytes } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/integrations/google-drive/migrate
// Body: { batch_size?, max_bytes_per_file? }
//
// Walks files where backend='supabase' for this workspace, copies each into
// the Drive root folder, swaps the metadata row to backend='google-drive',
// then deletes the Supabase object. Idempotent — already-Drive rows are
// skipped, and re-runs just continue from where the last call left off.
//
// Synchronous: returns { migrated, skipped, failed, errors[] } once the batch
// finishes. The caller polls by re-invoking until migrated+skipped covers all
// rows. Per-file cap defaults to 100 MiB because uploadDriveFileBytes loads
// the whole file in memory; large files would warrant a streaming/resumable
// path that we can add when someone hits the cap.

interface Body {
  batch_size?: unknown
  max_bytes_per_file?: unknown
}

const DEFAULT_BATCH = 50
const MAX_BATCH = 200
const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024

interface FileRow {
  id: string
  path: string
  backend: string
  backend_ref: string | null
  size_bytes: number | null
  content_type: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
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

  const body = await readBody<Body>(event).catch(() => ({}))
  const batchSize = clamp(Number(body?.batch_size) || DEFAULT_BATCH, 1, MAX_BATCH)
  const maxFileBytes = clamp(
    Number(body?.max_bytes_per_file) || DEFAULT_MAX_FILE_BYTES,
    1,
    500 * 1024 * 1024,
  )

  const admin = serverSupabaseServiceRole(event)
  const access = await resolveDriveAccess(admin, workspaceId)

  // Pull a batch of supabase-backed rows. Ordering by created_at gives stable
  // resumption: we always finish the oldest pending file before moving on.
  const { data: rowsRaw, error: listError } = await admin
    .from('files')
    .select('id, path, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .eq('backend', 'supabase')
    .eq('kind', 'file')
    .order('created_at', { ascending: true })
    .limit(batchSize)
  if (listError) {
    console.error('[drive migrate] list failed', listError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files for migration.' })
  }
  const rows = (rowsRaw ?? []) as unknown as FileRow[]

  let migrated = 0
  let skipped = 0
  const errors: { path: string, reason: string }[] = []

  for (const row of rows) {
    try {
      if ((row.size_bytes ?? 0) > maxFileBytes) {
        skipped++
        errors.push({
          path: row.path,
          reason: `FILE_TOO_LARGE size=${row.size_bytes} max=${maxFileBytes}`,
        })
        continue
      }

      // 1. Download the Supabase object. backend_ref holds the storage key
      // (`{workspaceId}/main/{path}`); fall back to the deterministic key for
      // legacy rows that didn't populate it.
      const objectKey = row.backend_ref || `${workspaceId}/main/${row.path}`
      const { data: blob, error: dlError } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(objectKey)
      if (dlError || !blob) {
        errors.push({ path: row.path, reason: `download_failed: ${dlError?.message ?? 'unknown'}` })
        continue
      }

      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 2. Upload to Drive root folder.
      const driveFile = await uploadDriveFileBytes(
        access.accessToken,
        {
          name: basenameOf(row.path),
          parents: [access.rootFolderId],
          mimeType: row.content_type ?? 'application/octet-stream',
        },
        buffer,
        workspaceId,
      )

      // 3. Verify size — Drive returns size as a string.
      const driveSize = Number(driveFile.size ?? '0')
      if (driveSize > 0 && row.size_bytes && driveSize !== row.size_bytes) {
        // Bytes diverged. Roll back the Drive copy so we don't leave orphans.
        await safeDeleteDriveFile(access.accessToken, driveFile.id, workspaceId)
        errors.push({
          path: row.path,
          reason: `size_mismatch supabase=${row.size_bytes} drive=${driveSize}`,
        })
        continue
      }

      // 4. Flip the metadata row to point at Drive.
      const { error: updateError } = await admin
        .from('files')
        .update({
          backend: 'google-drive',
          backend_ref: driveFile.id,
          etag: driveFile.md5Checksum ?? null,
          backend_mtime: driveFile.modifiedTime ?? new Date().toISOString(),
        })
        .eq('id', row.id)
      if (updateError) {
        // Row swap failed — drop the Drive copy so the next run can retry cleanly.
        await safeDeleteDriveFile(access.accessToken, driveFile.id, workspaceId)
        errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
        continue
      }

      // 5. Drop the Supabase object. Best-effort: leaving stragglers wastes
      // space but doesn't break correctness — the row already points at Drive.
      const { error: rmError } = await admin.storage.from(STORAGE_BUCKET).remove([objectKey])
      if (rmError) {
        console.warn('[drive migrate] failed to remove old supabase object', objectKey, rmError)
      }

      migrated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ path: row.path, reason: message })
    }
  }

  // How many supabase-backed rows are still left? Caller uses this to decide
  // whether another /migrate call is needed.
  const { count: remaining, error: countError } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('backend', 'supabase')
    .eq('kind', 'file')
  if (countError) {
    console.warn('[drive migrate] failed to count remaining', countError)
  }

  // When the last supabase-backed file leaves, flip any supabase-backed folder
  // rows to google-drive. Folders are metadata anchors for the FileBrowser's
  // per-row provider icon — no bytes to move. Drive-side folders here have
  // backend_ref = null (the codebase doesn't create real Drive folders for
  // logical workspace folders; files all land in the integration's root).
  if ((remaining ?? 0) === 0) {
    const { error: folderError } = await admin
      .from('files')
      .update({ backend: 'google-drive', backend_ref: null })
      .eq('workspace_id', workspaceId)
      .eq('backend', 'supabase')
      .eq('kind', 'folder')
    if (folderError) {
      console.warn('[drive migrate] failed to migrate folder rows', folderError)
    }
  }

  return {
    ok: true as const,
    migrated,
    skipped,
    remaining: remaining ?? null,
    done: (remaining ?? 0) === 0,
    errors,
  }
})

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, Math.floor(n)))
}

async function safeDeleteDriveFile(accessToken: string, fileId: string, workspaceId: string) {
  try {
    await deleteDriveFile(accessToken, fileId, workspaceId)
  } catch (err) {
    console.warn('[drive migrate] cleanup of partial Drive copy failed', fileId, err)
  }
}
