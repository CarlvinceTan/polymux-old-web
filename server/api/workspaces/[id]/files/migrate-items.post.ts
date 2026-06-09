import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'
import {
  assertMembership,
  basenameOf,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspace/workspaceFiles'
import {
  b2CopyFile,
  b2DeleteByKey,
  b2DownloadBytes,
  b2UploadBytes,
  b2WorkspaceKey,
} from '~~/server/utils/storage/b2'
import { ensureWorkspaceKey } from '~~/server/utils/storage/b2KeyManager'
import { cloudCap } from '~~/server/utils/billing/planLimits'
import { planLimitsEnforce } from '~~/server/utils/billing/planLimitsEnforce'
import { resolveDriveAccess } from '~~/server/utils/oauth/driveTokens'
import { deleteDriveFile, downloadDriveFileBytes, uploadDriveFileBytes } from '~~/server/utils/oauth/googleOAuth'

// POST /api/workspaces/[id]/files/migrate-items
// Body: {
//   items: Array<{ path: string; kind: 'file' | 'folder' }>,
//   targetProvider: 'google-drive' | 'local',
//   targetParent: string   // destination folder path; '' for root
// }
//
// Migrates a specific subset of files/folders to a different provider and
// moves them under `targetParent`. Same-provider non-Cloud moves should NOT
// go through here — /files/move (metadata-only path rewrite) handles those.
//
// This endpoint owns every transfer the SERVER can do end-to-end, i.e. every
// case that does NOT touch 'local' (OPFS bytes live only in the browser, so
// local-involved moves are client-driven — see useStorageFiles.transfer
// LocalFile / commit-file-migration):
//   google-drive → google-drive (rename) : metadata-only (Drive ignores paths)
//   b2 → b2 (rename/reparent)            : b2_copy_file to the new key, flip
//                                          metadata, drop the old key. NOT
//                                          metadata-only — B2 objects are keyed
//                                          by logical path, so a bare path
//                                          rewrite would orphan the object.
//   google-drive → b2 (into Cloud)       : download Drive bytes, upload to B2,
//                                          flip metadata, drop the Drive file.
//                                          Cloud-cap checked (bypassed when the
//                                          plan_limits flag is off).
//   b2 → google-drive (out of Cloud)     : download B2 bytes, upload to Drive,
//                                          flip metadata, drop the B2 object.
//   anything involving 'local'           : rejected here (local_handled_client)
//                                          — the client drives those.
//
// Folders carry no bytes: their migration is a metadata-only path (+ backend)
// rewrite regardless of provider; descendant FILE rows are enumerated as their
// own pending entries and relocate their bytes via the dispatch above.
//
// Partial failure is intentionally non-fatal: we keep successful migrations
// and surface per-item errors so the client can toast them. Response:
//   { migrated: Array<{fromPath, toPath}>, errors: Array<{path, reason}> }

type Backend = 'google-drive' | 'local' | 'b2'

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

const MAX_ITEMS_PER_REQUEST = 500

async function loadRow(
  admin: SupabaseClient<Database>,
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
  admin: SupabaseClient<Database>,
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
  if (itemPath === sourceRoot) return newRoot
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
  if (targetProvider !== 'google-drive' && targetProvider !== 'local' && targetProvider !== 'b2') {
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

  interface Pending {
    row: FileMetaRow
    toPath: string
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

    // Moving an item INTO its own subtree is invalid. But moving to the SAME
    // path is allowed: it's either a no-op (same provider) or an in-place
    // provider switch — e.g. "move to Cloud" while staying in the current
    // folder, the primary into-Cloud flow. Both are handled per-row below.
    if (rootTo !== srcPath && rootTo.startsWith(`${srcPath}/`)) {
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
        pending.push({ row, toPath: rewritePath(srcPath, rootTo, row.path) })
      }
    } else {
      const row = await loadRow(admin, workspaceId, srcPath)
      if (!row) {
        errors.push({ path: srcPath, reason: 'not_found' })
        continue
      }
      if (seenRowIds.has(row.id)) continue
      seenRowIds.add(row.id)
      pending.push({ row, toPath: rootTo })
    }
  }

  pending.sort((a, b) => {
    const depth = b.row.path.split('/').length - a.row.path.split('/').length
    if (depth !== 0) return depth
    if (a.row.kind !== b.row.kind) return a.row.kind === 'folder' ? 1 : -1
    return 0
  })

  // Cloud-cap context for into-Cloud (→ b2) transfers. Mirrors
  // upload-url.post.ts: when the plan_limits flag is off, enforcement is
  // skipped entirely, so a flag-off workspace can consolidate files into
  // Cloud freely. `cloudRunning` seeds from current B2 usage and accumulates
  // across drive→b2 items so a single batch can't blow past the cap.
  const { data: wsRow } = await admin
    .from('workspaces')
    .select('plan')
    .eq('id', workspaceId)
    .single()
  const plan = typeof wsRow?.plan === 'string' ? wsRow.plan : 'free'
  const enforcePlanLimits = await planLimitsEnforce()
  const cloudCapBytes = cloudCap(plan)
  const capActive = enforcePlanLimits && cloudCapBytes > 0
  let cloudRunning = 0
  if (capActive) {
    const { data: cloudRows } = await admin
      .from('files')
      .select('size_bytes')
      .eq('workspace_id', workspaceId)
      .eq('backend', 'b2')
    for (const r of cloudRows ?? []) {
      const n = Number((r as { size_bytes?: number | null }).size_bytes ?? 0)
      if (Number.isFinite(n) && n > 0) cloudRunning += Math.floor(n)
    }
  }

  // Lazy, memoised credential resolvers — only minted when a transfer needs
  // them so pure metadata batches don't touch B2 / Drive at all.
  const userId = user.sub
  let b2Creds: Awaited<ReturnType<typeof ensureWorkspaceKey>> | null = null
  async function b2CredsOrThrow() {
    if (!b2Creds) b2Creds = await ensureWorkspaceKey(admin, workspaceId, userId)
    return b2Creds
  }
  let driveAccess: Awaited<ReturnType<typeof resolveDriveAccess>> | null = null
  async function driveAccessOrThrow() {
    if (!driveAccess) driveAccess = await resolveDriveAccess(admin, workspaceId)
    return driveAccess
  }

  const migrated: { fromPath: string; toPath: string }[] = []

  for (const p of pending) {
    const { row, toPath } = p
    const sameProvider = row.backend === targetProvider
    const sameLocation = row.path === toPath
    try {
      // No-op: already at the destination on the same backend.
      if (sameProvider && sameLocation) {
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // Folders are pure metadata — flip path (+ backend icon) regardless of
      // provider. Folders hold no bytes; descendant FILE rows relocate their
      // own bytes via their own pending entries below.
      if (row.kind === 'folder') {
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

      // FILE transfers below. Anything touching 'local' is client-driven
      // (OPFS bytes are browser-only); the server can't move them.
      if (row.backend === 'local' || targetProvider === 'local') {
        errors.push({ path: row.path, reason: `local_handled_client: ${row.backend} -> ${targetProvider}` })
        continue
      }

      // google-drive → google-drive (rename only): Drive ignores our logical
      // path strings; just update the metadata row.
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

      // b2 → b2 (rename/reparent): copy the object to the new key, flip the
      // row, then drop the old key. Cap-neutral (same logical bytes). Never
      // metadata-only — the object key is the logical path.
      if (row.backend === 'b2' && targetProvider === 'b2') {
        if (!row.backend_ref) {
          errors.push({ path: row.path, reason: 'b2_missing_backend_ref' })
          continue
        }
        const creds = await b2CredsOrThrow()
        const newKey = b2WorkspaceKey(workspaceId, toPath)
        const copied = await b2CopyFile(creds, row.backend_ref, newKey)
        const { error: updateError } = await admin
          .from('files')
          .update({ path: toPath, backend_ref: copied.fileId, etag: copied.contentSha1, backend_mtime: new Date().toISOString() })
          .eq('id', row.id)
        if (updateError) {
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        try { await b2DeleteByKey(creds, b2WorkspaceKey(workspaceId, row.path)) }
        catch (err) { console.warn('[migrate-items] b2→b2 old-key cleanup failed for', row.path, err) }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // google-drive → b2 (into Cloud): download Drive bytes, upload to B2,
      // flip metadata, drop the Drive file. Cap-checked (bypassed flag-off).
      if (row.backend === 'google-drive' && targetProvider === 'b2') {
        if (!row.backend_ref) {
          errors.push({ path: row.path, reason: 'drive_missing_backend_ref' })
          continue
        }
        const declared = Number(row.size_bytes ?? 0) || 0
        if (capActive && cloudRunning + declared > cloudCapBytes) {
          errors.push({ path: row.path, reason: 'cloud_cap_reached' })
          continue
        }
        const access = await driveAccessOrThrow()
        const bytes = await downloadDriveFileBytes(access.accessToken, row.backend_ref, workspaceId)
        if (capActive && cloudRunning + bytes.length > cloudCapBytes) {
          errors.push({ path: row.path, reason: 'cloud_cap_reached' })
          continue
        }
        const creds = await b2CredsOrThrow()
        const newKey = b2WorkspaceKey(workspaceId, toPath)
        const uploaded = await b2UploadBytes(creds, newKey, row.content_type ?? 'application/octet-stream', bytes)
        const { error: updateError } = await admin
          .from('files')
          .update({
            path: toPath,
            backend: 'b2',
            backend_ref: uploaded.fileId,
            etag: uploaded.contentSha1,
            size_bytes: bytes.length,
            backend_mtime: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (updateError) {
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        cloudRunning += bytes.length
        try { await deleteDriveFile(access.accessToken, row.backend_ref, workspaceId) }
        catch (err) { console.warn('[migrate-items] drive→b2 source cleanup failed for', row.path, err) }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

      // b2 → google-drive (out of Cloud): download B2 bytes, upload to Drive,
      // flip metadata, drop the B2 object.
      if (row.backend === 'b2' && targetProvider === 'google-drive') {
        const creds = await b2CredsOrThrow()
        const oldKey = b2WorkspaceKey(workspaceId, row.path)
        const bytes = await b2DownloadBytes(creds, oldKey)
        const access = await driveAccessOrThrow()
        const driveFile = await uploadDriveFileBytes(
          access.accessToken,
          { name: basenameOf(toPath), parents: [access.rootFolderId], mimeType: row.content_type ?? undefined },
          bytes,
          workspaceId,
        )
        const { error: updateError } = await admin
          .from('files')
          .update({
            path: toPath,
            backend: 'google-drive',
            backend_ref: driveFile.id,
            etag: null,
            size_bytes: bytes.length,
            backend_mtime: driveFile.modifiedTime ?? new Date().toISOString(),
          })
          .eq('id', row.id)
        if (updateError) {
          errors.push({ path: row.path, reason: `metadata_update_failed: ${updateError.message}` })
          continue
        }
        try { await b2DeleteByKey(creds, oldKey) }
        catch (err) { console.warn('[migrate-items] b2→drive old-object cleanup failed for', row.path, err) }
        migrated.push({ fromPath: row.path, toPath })
        continue
      }

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
