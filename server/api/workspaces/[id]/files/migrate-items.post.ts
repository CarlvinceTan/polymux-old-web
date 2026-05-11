import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'
import {
  assertMembership,
  basenameOf,
  normalizePath,
  resolveWorkspaceId,
} from '~~/server/utils/workspaceFiles'

// POST /api/workspaces/[id]/files/migrate-items
// Body: {
//   items: Array<{ path: string; kind: 'file' | 'folder' }>,
//   targetProvider: 'google-drive' | 'local',
//   targetParent: string   // destination folder path; '' for root
// }
//
// Migrates a specific subset of files/folders to a different provider and
// moves them under `targetParent`. Same-provider moves should NOT go through
// here — /files/move handles those.
//
// Behavior:
//   google-drive ↔ google-drive (rename) : metadata-only (Drive doesn't care
//                                          about our logical paths)
//   anything involving 'local'           : not supported server-side; the
//                                          client drives the OPFS work via
//                                          prepare/finalize-local-migration
//                                          and we surface a clear error here.
//
// Folders carry no bytes: their migration is a metadata-only path rewrite,
// regardless of provider.
//
// Partial failure is intentionally non-fatal: we keep successful migrations
// and surface per-item errors so the client can toast them. Response:
//   { migrated: Array<{fromPath, toPath}>, errors: Array<{path, reason}> }

type Backend = 'google-drive' | 'local'

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
  if (targetProvider !== 'google-drive' && targetProvider !== 'local') {
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

  const migrated: { fromPath: string; toPath: string }[] = []

  for (const p of pending) {
    const { row, toPath } = p
    const sameProvider = row.backend === targetProvider
    const sameLocation = row.path === toPath
    try {
      // Folders are pure metadata — flip the row in place regardless of
      // provider. Local rows (file or folder) and rows targeting local are
      // similarly metadata-only here; the client drives any OPFS byte work
      // through prepare/finalize-local-migration.
      if (row.kind === 'folder' || row.backend === 'local' || targetProvider === 'local') {
        if (sameProvider && sameLocation) {
          migrated.push({ fromPath: row.path, toPath })
          continue
        }
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

      // google-drive → google-drive (rename only): Drive doesn't care about
      // our logical path strings; just update the metadata row.
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
