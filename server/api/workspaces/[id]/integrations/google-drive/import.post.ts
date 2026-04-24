import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  resolveWorkspaceId,
  storageKey,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { deleteDriveFile, downloadDriveFileBytes } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/integrations/google-drive/import
// Body: { batch_size?, max_bytes_per_file? }
//
// Inverse of migrate.post.ts. Walks files where backend='google-drive' for this
// workspace, downloads each from Drive, uploads the bytes to the Supabase
// bucket at the canonical `{workspaceId}/main/{path}` key, swaps the metadata
// row to backend='supabase', then deletes the original Drive file. Idempotent —
// already-Supabase rows are skipped, and re-runs continue from where the last
// call left off.
//
// Synchronous: returns { migrated, skipped, remaining, done, errors[] } once
// the batch finishes. Caller polls by re-invoking until `done` is true.

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

  const { data: rowsRaw, error: listError } = await admin
    .from('files')
    .select('id, path, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .eq('backend', 'google-drive')
    .eq('kind', 'file')
    .order('created_at', { ascending: true })
    .limit(batchSize)
  if (listError) {
    console.error('[drive import] list failed', listError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to list files for migration.' })
  }
  const rows = (rowsRaw ?? []) as unknown as FileRow[]

  let migrated = 0
  let skipped = 0
  const errors: { path: string, reason: string }[] = []

  for (const row of rows) {
    try {
      if (!row.backend_ref) {
        skipped++
        errors.push({ path: row.path, reason: 'missing_drive_file_id' })
        continue
      }
      if ((row.size_bytes ?? 0) > maxFileBytes) {
        skipped++
        errors.push({
          path: row.path,
          reason: `FILE_TOO_LARGE size=${row.size_bytes} max=${maxFileBytes}`,
        })
        continue
      }

      // 1. Download the Drive object. backend_ref holds the Drive file id.
      const buffer = await downloadDriveFileBytes(
        access.accessToken,
        row.backend_ref,
        workspaceId,
      )

      // 2. Upload to the Supabase bucket at the canonical key.
      const objectKey = storageKey(workspaceId, row.path)
      const { error: upError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(objectKey, buffer, {
          contentType: row.content_type ?? 'application/octet-stream',
          upsert: true,
        })
      if (upError) {
        errors.push({ path: row.path, reason: `upload_failed: ${upError.message}` })
        continue
      }

      // 3. Verify size — the bucket keeps the original byte length.
      if (row.size_bytes && buffer.byteLength !== row.size_bytes) {
        // Bytes diverged from what the row claimed. Roll back the Supabase
        // copy so we don't leave a size-mismatched object sitting around.
        await safeRemoveSupabaseObject(admin, objectKey)
        errors.push({
          path: row.path,
          reason: `size_mismatch drive=${buffer.byteLength} row=${row.size_bytes}`,
        })
        continue
      }

      // 4. Flip the metadata row to point at Supabase.
      const nowIso = new Date().toISOString()
      const { error: updateError } = await admin
        .from('files')
        .update({
          backend: 'supabase',
          backend_ref: objectKey,
          etag: null,
          backend_mtime: nowIso,
        })
        .eq('id', row.id)
      if (updateError) {
        await safeRemoveSupabaseObject(admin, objectKey)
        errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
        continue
      }

      // 5. Drop the Drive file. Best-effort: leaving stragglers wastes space
      // but doesn't break correctness — the row already points at Supabase.
      try {
        await deleteDriveFile(access.accessToken, row.backend_ref, workspaceId)
      }
      catch (err) {
        console.warn('[drive import] failed to remove old Drive file', row.backend_ref, err)
      }

      migrated++
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ path: row.path, reason: message })
    }
  }

  const { count: remaining, error: countError } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('backend', 'google-drive')
    .eq('kind', 'file')
  if (countError) {
    console.warn('[drive import] failed to count remaining', countError)
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

async function safeRemoveSupabaseObject(
  admin: ReturnType<typeof import('#supabase/server').serverSupabaseServiceRole>,
  key: string,
) {
  try {
    await admin.storage.from(STORAGE_BUCKET).remove([key])
  }
  catch (err) {
    console.warn('[drive import] cleanup of partial Supabase upload failed', key, err)
  }
}
