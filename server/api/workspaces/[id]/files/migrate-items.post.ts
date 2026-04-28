import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  STORAGE_BUCKET,
  assertMembership,
  basenameOf,
  normalizePath,
  storageKey,
} from '~~/server/utils/workspaceFiles'
import { resolveDriveAccess } from '~~/server/utils/driveTokens'
import { deleteDriveFile, downloadDriveFileBytes, uploadDriveFileBytes } from '~~/server/utils/googleOAuth'

// POST /api/workspaces/[id]/files/migrate-items
// Body: {
//   items: Array<{ path: string; kind: 'file' | 'folder' }>,
//   targetProvider: 'supabase' | 'google-drive' | 'local',
//   targetParent: string   // destination folder path; '' for root
// }
//
// Migrates a specific subset of files/folders to a different provider and
// moves them under `targetParent`. Called by the FileBrowser when the user
// drags or picks Move-To across providers. Same-provider moves should NOT go
// through here — the existing /files/move endpoint handles those.
//
// Behavior per direction:
//   supabase → google-drive    : server-side (download + upload + flip + cleanup)
//   google-drive → supabase    : server-side (download + upload + flip + cleanup)
//   anything involving 'local' : not supported server-side; returns a plan that
//                                the client must execute via the existing
//                                prepare/finalize-local endpoints. Phase 1
//                                errors out clearly so the caller can surface
//                                a toast instead of silently succeeding.
//
// Folders:
//   The folder row itself is just metadata (no bytes). We expand each folder
//   into its descendants via `path = X OR path LIKE 'X/%'`, rename the whole
//   subtree by rewriting the path prefix, and migrate each descendant file.
//
// Partial failure is intentionally non-fatal: we keep successful migrations
// and surface per-item errors so the client can toast them. Response:
//   { migrated: Array<{fromPath, toPath}>, errors: Array<{path, reason}> }

type Backend = 'supabase' | 'google-drive' | 'local'

interface ItemInput { path?: unknown; kind?: unknown }
interface Body {
  items?: unknown
  targetProvider?: unknown
  targetParent?: unknown
}

interface FileMetaRow {
  id: string
  path: string
  kind: 'file' | 'folder'
  backend: Backend
  backend_ref: string | null
  size_bytes: number | null
  content_type: string | null
}

// Guard rails — mirrored from the existing migrate/import endpoints so a
// per-item call can't DoS the server or blow memory on a giant file.
const MAX_ITEMS_PER_REQUEST = 500
const MAX_FILE_BYTES = 100 * 1024 * 1024

async function loadRow(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  path: string,
): Promise<FileMetaRow | null> {
  const { data } = await admin
    .from('files')
    .select('id, path, kind, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .eq('path', path)
    .maybeSingle()
  return (data ?? null) as FileMetaRow | null
}

async function loadSubtree(
  admin: ReturnType<typeof serverSupabaseServiceRole>,
  workspaceId: string,
  rootPath: string,
): Promise<FileMetaRow[]> {
  const { data } = await admin
    .from('files')
    .select('id, path, kind, backend, backend_ref, size_bytes, content_type')
    .eq('workspace_id', workspaceId)
    .or(`path.eq.${rootPath},path.like.${rootPath}/%`)
  return (data ?? []) as FileMetaRow[]
}

function rewritePath(sourceRoot: string, newRoot: string, itemPath: string): string {
  // `itemPath` is either the root itself or a descendant. Build the new path
  // by replacing the `sourceRoot` prefix with `newRoot`.
  if (itemPath === sourceRoot) return newRoot
  // Defensive: only rewrite when there's a real prefix match.
  if (!itemPath.startsWith(`${sourceRoot}/`)) return itemPath
  return `${newRoot}${itemPath.slice(sourceRoot.length)}`
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const workspaceId = resolveWorkspaceId(event)
  const supabase = await serverSupabaseClient(event)
  const role = await assertMembership(supabase, workspaceId, user.sub)
  if (!['owner', 'admin'].includes(role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can migrate workspace files.',
    })
  }

  const body = await readBody<Body>(event).catch(() => ({} as Body))
  const targetProvider = body.targetProvider
  if (targetProvider !== 'supabase' && targetProvider !== 'google-drive' && targetProvider !== 'local') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid targetProvider.' })
  }
  const targetParent = normalizePath(body.targetParent)
  const rawItems = Array.isArray(body.items) ? (body.items as ItemInput[]) : []
  if (rawItems.length === 0) {
    return { migrated: [], errors: [] }
  }
  if (rawItems.length > MAX_ITEMS_PER_REQUEST) {
    throw createError({ statusCode: 400, statusMessage: `Too many items (max ${MAX_ITEMS_PER_REQUEST}).` })
  }

  const admin = serverSupabaseServiceRole(event)

  // Expand the top-level items into a flat list of rows that need the combined
  // "move to targetParent + switch backend to targetProvider" treatment.
  interface Pending {
    row: FileMetaRow
    toPath: string
    // True when this row is the explicit user-picked top-level item (vs. a
    // descendant discovered by folder expansion). Used only for diagnostics.
    isRoot: boolean
  }
  const pending: Pending[] = []
  const errors: { path: string; reason: string }[] = []
  const seenRowIds = new Set<string>()

  for (const input of rawItems) {
    const srcPath = normalizePath(input?.path)
    const declaredKind = input?.kind === 'folder' ? 'folder' : 'file'
    if (!srcPath) {
      errors.push({ path: '', reason: 'invalid_path' })
      continue
    }
    const base = basenameOf(srcPath)
    const rootTo = targetParent ? `${targetParent}/${base}` : base

    // Don't allow moving an item into itself or into its own descendants.
    if (rootTo === srcPath || rootTo.startsWith(`${srcPath}/`)) {
      errors.push({ path: srcPath, reason: 'target_is_source_or_descendant' })
      continue
    }

    if (declaredKind === 'folder') {
      const subtree = await loadSubtree(admin, workspaceId, srcPath)
      if (subtree.length === 0) {
        errors.push({ path: srcPath, reason: 'not_found' })
        continue
      }
      for (const row of subtree) {
        if (seenRowIds.has(row.id)) continue
        seenRowIds.add(row.id)
        pending.push({
          row,
          toPath: rewritePath(srcPath, rootTo, row.path),
          isRoot: row.path === srcPath,
        })
      }
    } else {
      const row = await loadRow(admin, workspaceId, srcPath)
      if (!row) {
        errors.push({ path: srcPath, reason: 'not_found' })
        continue
      }
      if (seenRowIds.has(row.id)) continue
      seenRowIds.add(row.id)
      pending.push({ row, toPath: rootTo, isRoot: true })
    }
  }

  // Sort so descendant files migrate before their parent folder row gets its
  // path rewritten. Deepest paths first, folders last. This keeps the unique
  // (workspace_id, path) constraint happy if anything reads mid-flight.
  pending.sort((a, b) => {
    const depth = b.row.path.split('/').length - a.row.path.split('/').length
    if (depth !== 0) return depth
    if (a.row.kind !== b.row.kind) return a.row.kind === 'folder' ? 1 : -1
    return 0
  })

  // Lazy-resolved Drive access — we only need it if at least one item touches
  // Drive, so skip the lookup entirely on pure supabase ↔ supabase or when
  // everything is rejected.
  let driveAccessPromise: ReturnType<typeof resolveDriveAccess> | null = null
  function getDriveAccess() {
    if (!driveAccessPromise) driveAccessPromise = resolveDriveAccess(admin, workspaceId)
    return driveAccessPromise
  }

  const migrated: { fromPath: string; toPath: string }[] = []

  for (const p of pending) {
    const { row, toPath } = p
    const sameProvider = row.backend === targetProvider
    const sameLocation = row.path === toPath
    try {
      // Folders (and local rows of any kind) carry no bytes we can transfer
      // server-side — they're pure metadata. Flip the row in place. The
      // client still does the actual byte work for local files via the
      // prepare/finalize-local flow; migrate-items just advances the
      // database-visible state.
      if (row.kind === 'folder' || row.backend === 'local' || targetProvider === 'local') {
        if (sameProvider && sameLocation) {
          migrated.push({ fromPath: row.path, toPath })
          continue
        }
        // NOTE: for `local` file rows, flipping `backend` without coordinating
        // OPFS is incorrect — we'd be lying to the client about where bytes
        // live. Phase 1 reports this as unsupported so the UI can toast
        // clearly. Remove this guard once the client-driven local path is
        // wired up.
        if (row.kind === 'file' && (row.backend === 'local' || targetProvider === 'local')) {
          errors.push({
            path: row.path,
            reason: `direction_unsupported_phase1: ${row.backend} -> ${targetProvider}`,
          })
          continue
        }
        const updateResult = sameProvider
          ? await admin.from('files').update({ path: toPath }).eq('id', row.id)
          : await admin.from('files').update({ path: toPath, backend: targetProvider }).eq('id', row.id)
        if (updateResult.error) {
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateResult.error.message}` })
          continue
        }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // Guard rail: reject unexpectedly large files so we don't OOM the node
      // process buffering them in memory. Caller can chunk or raise this.
      if ((row.size_bytes ?? 0) > MAX_FILE_BYTES) {
        errors.push({ path: row.path, reason: `file_too_large size=${row.size_bytes} max=${MAX_FILE_BYTES}` })
        continue
      }

      // supabase ↔ supabase (same provider, new path): use Storage move so
      // we don't re-upload bytes.
      if (row.backend === 'supabase' && targetProvider === 'supabase') {
        if (sameLocation) {
          migrated.push({ fromPath: row.path, toPath })
          continue
        }
        const oldKey = row.backend_ref || storageKey(workspaceId, row.path)
        const newKey = storageKey(workspaceId, toPath)
        const { error: mvErr } = await admin.storage.from(STORAGE_BUCKET).move(oldKey, newKey)
        if (mvErr) {
          errors.push({ path: row.path, reason: `storage_move_failed: ${mvErr.message}` })
          continue
        }
        const { error: updateError } = await admin
          .from('files')
          .update({ path: toPath, backend_ref: newKey })
          .eq('id', row.id)
        if (updateError) {
          // Metadata flip failed after the bytes already moved — best-effort
          // reverse the object move to keep state consistent.
          await admin.storage.from(STORAGE_BUCKET).move(newKey, oldKey).catch(() => {})
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // supabase → google-drive: download the object, upload to Drive,
      // flip metadata to point at the new Drive id, then drop the source.
      if (row.backend === 'supabase' && targetProvider === 'google-drive') {
        const access = await getDriveAccess()
        const oldKey = row.backend_ref || storageKey(workspaceId, row.path)
        const { data: blob, error: dlErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .download(oldKey)
        if (dlErr || !blob) {
          errors.push({ path: row.path, reason: `download_failed: ${dlErr?.message ?? 'unknown'}` })
          continue
        }
        const buf = Buffer.from(await blob.arrayBuffer())
        const driveFile = await uploadDriveFileBytes(
          access.accessToken,
          {
            name: basenameOf(toPath),
            parents: [access.rootFolderId],
            mimeType: row.content_type ?? 'application/octet-stream',
          },
          buf,
          workspaceId,
        )
        const { error: updateError } = await admin
          .from('files')
          .update({
            path: toPath,
            backend: 'google-drive',
            backend_ref: driveFile.id,
            etag: driveFile.md5Checksum ?? null,
            backend_mtime: driveFile.modifiedTime ?? new Date().toISOString(),
          })
          .eq('id', row.id)
        if (updateError) {
          // Roll the Drive side back so the row still correctly says 'supabase'.
          await safeDeleteDriveFile(access.accessToken, driveFile.id, workspaceId)
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        // Source cleanup. A zombie supabase object will ghost the item back
        // into the old folder's listing (the listing endpoint unions bucket +
        // metadata), so we try both the stored backend_ref AND the path-
        // derived canonical key. backend_ref can drift from the canonical
        // key if a row was ever moved between same-provider folders without
        // re-anchoring it.
        const candidateKeys = Array.from(new Set([
          oldKey,
          storageKey(workspaceId, row.path),
        ]))
        const { error: rmErr } = await admin.storage.from(STORAGE_BUCKET).remove(candidateKeys)
        if (rmErr) {
          console.warn('[migrate-items] supabase cleanup failed', candidateKeys, rmErr)
        }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // google-drive → supabase: download bytes from Drive, upload to the
      // Supabase bucket at the canonical key for the new path, flip metadata,
      // then drop the Drive file.
      if (row.backend === 'google-drive' && targetProvider === 'supabase') {
        if (!row.backend_ref) {
          errors.push({ path: row.path, reason: 'missing_drive_file_id' })
          continue
        }
        const access = await getDriveAccess()
        const buf = await downloadDriveFileBytes(access.accessToken, row.backend_ref, workspaceId)
        const newKey = storageKey(workspaceId, toPath)
        const { error: upErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(newKey, buf, {
            contentType: row.content_type ?? 'application/octet-stream',
            upsert: true,
          })
        if (upErr) {
          errors.push({ path: row.path, reason: `upload_failed: ${upErr.message}` })
          continue
        }
        const { error: updateError } = await admin
          .from('files')
          .update({
            path: toPath,
            backend: 'supabase',
            backend_ref: newKey,
            etag: null,
            backend_mtime: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (updateError) {
          await admin.storage.from(STORAGE_BUCKET).remove([newKey]).catch(() => {})
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        try {
          await deleteDriveFile(access.accessToken, row.backend_ref, workspaceId)
        }
        catch (err) {
          console.warn('[migrate-items] drive cleanup failed', row.backend_ref, err)
        }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // google-drive ↔ google-drive (same provider, new path): just update
      // metadata. Drive itself doesn't care about our logical path strings.
      if (row.backend === 'google-drive' && targetProvider === 'google-drive') {
        const { error: updateError } = await admin
          .from('files')
          .update({ path: toPath })
          .eq('id', row.id)
        if (updateError) {
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // Should be unreachable given the preceding branches — keep a net.
      errors.push({
        path: row.path,
        reason: `direction_unsupported: ${row.backend} -> ${targetProvider}`,
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ path: row.path, reason: message })
    }
  }

  return { migrated, errors }
})

async function safeDeleteDriveFile(accessToken: string, fileId: string, workspaceId: string) {
  try {
    await deleteDriveFile(accessToken, fileId, workspaceId)
  }
  catch (err) {
    console.warn('[migrate-items] cleanup of partial Drive copy failed', fileId, err)
  }
}
